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

const scanBigKeys = async (options = {}) => {
  const {
    host,
    port,
    password,
    db = 0,
    threshold = '1MB',
    pattern = '*',
    count = 100,
    timeout = 300000
  } = options;

  const thresholdBytes = parseThreshold(threshold);
  const client = createRedisClient({ host, port, password, db });

  try {
    await client.connect();

    const bigKeys = [];
    let cursor = '0';
    let scannedCount = 0;
    const startTime = Date.now();
    const timeoutAt = startTime + timeout;

    do {
      if (Date.now() > timeoutAt) {
        throw new Error(`Scan timed out after ${timeout}ms`);
      }

      const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
      cursor = result[0];
      const keys = result[1];

      for (const key of keys) {
        try {
          const memory = await client.memory('USAGE', key);
          if (memory !== null && memory >= thresholdBytes) {
            const type = await client.type(key);
            let ttl = await client.ttl(key);
            if (ttl === -1) ttl = null;
            else if (ttl === -2) ttl = 'expired';

            bigKeys.push({
              key,
              type,
              memoryBytes: memory,
              memoryFormatted: formatBytes(memory),
              ttl
            });
          }
        } catch (keyErr) {
          console.warn(`Failed to process key ${key}:`, keyErr.message);
        }
      }

      scannedCount += keys.length;
    } while (cursor !== '0');

    bigKeys.sort((a, b) => b.memoryBytes - a.memoryBytes);

    const totalDuration = Date.now() - startTime;

    return {
      success: true,
      data: {
        db,
        host: client.options.host,
        port: client.options.port,
        threshold,
        thresholdBytes,
        pattern,
        totalScanned: scannedCount,
        bigKeysCount: bigKeys.length,
        totalMemoryBytes: bigKeys.reduce((sum, k) => sum + k.memoryBytes, 0),
        totalMemoryFormatted: formatBytes(bigKeys.reduce((sum, k) => sum + k.memoryBytes, 0)),
        durationMs: totalDuration,
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
  formatBytes
};
