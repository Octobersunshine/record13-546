const { createRedisClient } = require('../config/redis');

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const parseThreshold = (threshold) => {
  if (typeof threshold === 'number') return threshold;
  if (typeof threshold !== 'string') return 1024 * 1024;

  const match = threshold.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) return parseInt(threshold) || 1024 * 1024;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 };

  return Math.floor(value * units[unit]);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const measureLatency = async (client) => {
  const start = process.hrtime.bigint();
  try {
    await client.ping();
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6;
  } catch {
    return -1;
  }
};

const calculateDelay = (baseDelayMs, currentLatencyMs, latencyThresholdMs) => {
  if (currentLatencyMs < 0) return baseDelayMs * 2;
  if (currentLatencyMs > latencyThresholdMs * 3) return baseDelayMs * 10;
  if (currentLatencyMs > latencyThresholdMs * 2) return baseDelayMs * 5;
  if (currentLatencyMs > latencyThresholdMs) return baseDelayMs * 2;
  return baseDelayMs;
};

const REDIS_TYPES = ['string', 'list', 'hash', 'set', 'zset', 'stream', 'module'];

const groupByType = (bigKeys) => {
  const totalMemory = bigKeys.reduce((sum, k) => sum + k.memoryBytes, 0);
  const groups = {};

  for (const type of REDIS_TYPES) {
    groups[type] = { count: 0, totalMemoryBytes: 0, topKey: null };
  }

  for (const k of bigKeys) {
    const t = k.type || 'unknown';
    if (!groups[t]) {
      groups[t] = { count: 0, totalMemoryBytes: 0, topKey: null };
    }
    groups[t].count += 1;
    groups[t].totalMemoryBytes += k.memoryBytes;
    if (!groups[t].topKey || k.memoryBytes > groups[t].topKey.memoryBytes) {
      groups[t].topKey = { key: k.key, memoryBytes: k.memoryBytes, memoryFormatted: k.memoryFormatted };
    }
  }

  const result = [];
  for (const [type, stat] of Object.entries(groups)) {
    if (stat.count === 0) continue;
    result.push({
      type,
      count: stat.count,
      totalMemoryBytes: stat.totalMemoryBytes,
      totalMemoryFormatted: formatBytes(stat.totalMemoryBytes),
      percentage: totalMemory > 0 ? parseFloat(((stat.totalMemoryBytes / totalMemory) * 100).toFixed(2)) : 0,
      avgMemoryBytes: Math.round(stat.totalMemoryBytes / stat.count),
      avgMemoryFormatted: formatBytes(Math.round(stat.totalMemoryBytes / stat.count)),
      topKey: stat.topKey
    });
  }

  result.sort((a, b) => b.totalMemoryBytes - a.totalMemoryBytes);

  return result;
};

const processKeysInBatch = async (client, keys, thresholdBytes) => {
  if (keys.length === 0) return [];

  const pipeline = client.pipeline();
  keys.forEach(key => {
    pipeline.memory('USAGE', key);
  });

  const memoryResults = await pipeline.exec();

  const candidateKeys = [];
  keys.forEach((key, index) => {
    const [err, memory] = memoryResults[index];
    if (!err && memory !== null && memory >= thresholdBytes) {
      candidateKeys.push({ key, memory });
    }
  });

  if (candidateKeys.length === 0) return [];

  const detailPipeline = client.pipeline();
  candidateKeys.forEach(({ key }) => {
    detailPipeline.type(key);
    detailPipeline.ttl(key);
  });

  const detailResults = await detailPipeline.exec();

  const bigKeys = [];
  candidateKeys.forEach(({ key, memory }, index) => {
    const typeResult = detailResults[index * 2];
    const ttlResult = detailResults[index * 2 + 1];

    const typeErr = typeResult[0];
    const ttlErr = ttlResult[0];

    if (!typeErr && !ttlErr) {
      let ttl = ttlResult[1];
      if (ttl === -1) ttl = null;
      else if (ttl === -2) ttl = 'expired';

      bigKeys.push({
        key,
        type: typeResult[1],
        memoryBytes: memory,
        memoryFormatted: formatBytes(memory),
        ttl
      });
    }
  });

  return bigKeys;
};

const scanBigKeys = async (options = {}) => {
  const {
    host,
    port,
    password,
    db = 0,
    threshold = '1MB',
    pattern = '*',
    count = 100,
    timeout = 300000,
    delayMs = 10,
    maxKeysPerSecond = 0,
    latencyThresholdMs = 50,
    autoThrottle = true,
    latencyCheckInterval = 10
  } = options;

  const thresholdBytes = parseThreshold(threshold);
  const client = createRedisClient({ host, port, password, db });

  const effectiveCount = maxKeysPerSecond > 0 && maxKeysPerSecond < count
    ? Math.max(1, maxKeysPerSecond)
    : count;

  const minBatchIntervalMs = maxKeysPerSecond > 0
    ? Math.max(0, (effectiveCount / maxKeysPerSecond) * 1000 - 0)
    : 0;

  try {
    await client.connect();

    const bigKeys = [];
    let cursor = '0';
    let scannedCount = 0;
    let batchCount = 0;
    let throttledCount = 0;
    const startTime = Date.now();
    const timeoutAt = startTime + timeout;
    const latencyHistory = [];

    let currentDelayMs = delayMs;

    do {
      if (Date.now() > timeoutAt) {
        throw new Error(`Scan timed out after ${timeout}ms`);
      }

      const batchStart = Date.now();

      if (autoThrottle && batchCount % latencyCheckInterval === 0) {
        const latency = await measureLatency(client);
        latencyHistory.push({ batch: batchCount, latencyMs: latency });

        if (latency > 0) {
          const newDelay = calculateDelay(delayMs, latency, latencyThresholdMs);
          if (newDelay > currentDelayMs) {
            currentDelayMs = newDelay;
            throttledCount++;
            console.warn(`[Throttle] Redis latency ${latency.toFixed(1)}ms exceeds threshold ${latencyThresholdMs}ms, increasing delay to ${currentDelayMs}ms`);
          } else if (latency < latencyThresholdMs * 0.5 && currentDelayMs > delayMs) {
            currentDelayMs = Math.max(delayMs, Math.floor(currentDelayMs / 2));
          }
        }
      }

      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', effectiveCount);
      cursor = result[0];
      const keys = result[1];

      if (keys.length > 0) {
        const batchBigKeys = await processKeysInBatch(client, keys, thresholdBytes);
        bigKeys.push(...batchBigKeys);
      }

      scannedCount += keys.length;
      batchCount++;

      const batchElapsed = Date.now() - batchStart;
      const totalDelay = Math.max(currentDelayMs, minBatchIntervalMs - batchElapsed);

      if (totalDelay > 0 && cursor !== '0') {
        await sleep(totalDelay);
      }

    } while (cursor !== '0');

    bigKeys.sort((a, b) => b.memoryBytes - a.memoryBytes);

    const typeStats = groupByType(bigKeys);

    const totalDuration = Date.now() - startTime;
    const avgLatency = latencyHistory.length > 0
      ? latencyHistory.reduce((sum, l) => sum + (l.latencyMs > 0 ? l.latencyMs : 0), 0) / latencyHistory.filter(l => l.latencyMs > 0).length
      : 0;

    return {
      success: true,
      data: {
        db,
        host: client.options.host,
        port: client.options.port,
        threshold,
        thresholdBytes,
        pattern,
        scanOptions: {
          count: effectiveCount,
          baseDelayMs: delayMs,
          maxKeysPerSecond,
          latencyThresholdMs,
          autoThrottle,
          latencyCheckInterval
        },
        totalScanned: scannedCount,
        bigKeysCount: bigKeys.length,
        typeStats,
        totalMemoryBytes: bigKeys.reduce((sum, k) => sum + k.memoryBytes, 0),
        totalMemoryFormatted: formatBytes(bigKeys.reduce((sum, k) => sum + k.memoryBytes, 0)),
        durationMs: totalDuration,
        throughput: scannedCount / (totalDuration / 1000),
        stats: {
          batchCount,
          throttledCount,
          avgLatencyMs: avgLatency.toFixed(2),
          maxLatencyMs: Math.max(...latencyHistory.map(l => l.latencyMs).filter(l => l > 0), 0).toFixed(2),
          latencyHistory: latencyHistory.slice(-10)
        },
        bigKeys
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      db,
      host: client.options.host,
      port: client.options.port
    };
  } finally {
    try {
      await client.quit();
    } catch (quitErr) {
      console.warn('Failed to quit Redis connection:', quitErr.message);
    }
  }
};

module.exports = {
  scanBigKeys,
  parseThreshold,
  formatBytes,
  calculateDelay,
  measureLatency,
  processKeysInBatch,
  groupByType
};
