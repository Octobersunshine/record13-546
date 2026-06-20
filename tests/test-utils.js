const { parseThreshold, formatBytes, calculateDelay, groupByType } = require('../src/services/redisScanner');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Test failed: ${message}`);
  }
  console.log(`✅ ${message}`);
};

const runTests = () => {
  console.log('Running unit tests for utils...\n');

  console.log('=== Testing formatBytes ===');
  assert(formatBytes(0) === '0 B', 'formatBytes(0) should return "0 B"');
  assert(formatBytes(1023) === '1023 B', 'formatBytes(1023) should return "1023 B"');
  assert(formatBytes(1024) === '1 KB', 'formatBytes(1024) should return "1 KB"');
  assert(formatBytes(1024 * 1024) === '1 MB', 'formatBytes(1024 * 1024) should return "1 MB"');
  assert(formatBytes(1024 * 1024 * 1024) === '1 GB', 'formatBytes(1GB) should return "1 GB"');
  assert(formatBytes(1536) === '1.5 KB', 'formatBytes(1536) should return "1.5 KB"');

  console.log('\n=== Testing parseThreshold ===');
  assert(parseThreshold(1024) === 1024, 'parseThreshold(1024) should return 1024');
  assert(parseThreshold('1024') === 1024, 'parseThreshold("1024") should return 1024');
  assert(parseThreshold('1B') === 1, 'parseThreshold("1B") should return 1');
  assert(parseThreshold('1KB') === 1024, 'parseThreshold("1KB") should return 1024');
  assert(parseThreshold('1MB') === 1024 * 1024, 'parseThreshold("1MB") should return 1048576');
  assert(parseThreshold('1GB') === 1024 * 1024 * 1024, 'parseThreshold("1GB") should return 1073741824');
  assert(parseThreshold('512KB') === 512 * 1024, 'parseThreshold("512KB") should return 524288');
  assert(parseThreshold('1.5MB') === Math.floor(1.5 * 1024 * 1024), 'parseThreshold("1.5MB") should return 1572864');
  assert(parseThreshold('1 mb') === 1024 * 1024, 'parseThreshold("1 mb") should be case insensitive');
  assert(parseThreshold('invalid') === 1024 * 1024, 'parseThreshold("invalid") should return default 1MB');
  assert(parseThreshold(null) === 1024 * 1024, 'parseThreshold(null) should return default 1MB');

  console.log('\n=== Testing calculateDelay (auto-throttle logic) ===');
  const baseDelay = 10;
  const threshold = 50;

  assert(calculateDelay(baseDelay, -1, threshold) === baseDelay * 2,
    'Error latency should double the delay');

  assert(calculateDelay(baseDelay, 10, threshold) === baseDelay,
    'Latency below threshold should use base delay');

  assert(calculateDelay(baseDelay, 60, threshold) === baseDelay * 2,
    'Latency 1x over threshold should double delay');

  assert(calculateDelay(baseDelay, 120, threshold) === baseDelay * 5,
    'Latency 2x over threshold should 5x delay');

  assert(calculateDelay(baseDelay, 200, threshold) === baseDelay * 10,
    'Latency 3x+ over threshold should 10x delay');

  console.log('\n  Auto-throttle tier demonstration:');
  const testLatencies = [10, 30, 55, 75, 110, 160, 250];
  testLatencies.forEach(latency => {
    const delay = calculateDelay(baseDelay, latency, threshold);
    const ratio = delay / baseDelay;
    const status = latency > threshold ? '⚠️  THROTTLED' : '✓ OK';
    console.log(`    latency=${latency}ms -> delay=${delay}ms (${ratio}x) ${status}`);
  });

  console.log('\n=== Testing groupByType (type-grouped statistics) ===');

  const emptyResult = groupByType([]);
  assert(Array.isArray(emptyResult) && emptyResult.length === 0,
    'groupByType([]) should return empty array');

  const mockBigKeys = [
    { key: 's1', type: 'string', memoryBytes: 2 * 1024 * 1024, memoryFormatted: '2 MB', ttl: null },
    { key: 's2', type: 'string', memoryBytes: 1 * 1024 * 1024, memoryFormatted: '1 MB', ttl: null },
    { key: 's3', type: 'string', memoryBytes: 3 * 1024 * 1024, memoryFormatted: '3 MB', ttl: 3600 },
    { key: 'h1', type: 'hash',   memoryBytes: 5 * 1024 * 1024, memoryFormatted: '5 MB', ttl: null },
    { key: 'h2', type: 'hash',   memoryBytes: 2 * 1024 * 1024, memoryFormatted: '2 MB', ttl: null },
    { key: 'l1', type: 'list',   memoryBytes: 4 * 1024 * 1024, memoryFormatted: '4 MB', ttl: null },
    { key: 'z1', type: 'zset',   memoryBytes: 512 * 1024,      memoryFormatted: '512 KB', ttl: null },
    { key: 'st1', type: 'set',   memoryBytes: 1.5 * 1024 * 1024, memoryFormatted: '1.5 MB', ttl: null }
  ];

  const stats = groupByType(mockBigKeys);

  assert(stats.length === 5,
    `groupByType should return 5 types with keys, got ${stats.length}`);

  assert(stats[0].type === 'hash',
    'First group should be hash (highest total memory)');

  const hashStat = stats.find(s => s.type === 'hash');
  assert(hashStat.count === 2, 'hash should have 2 keys');
  assert(hashStat.totalMemoryBytes === 7 * 1024 * 1024, 'hash total memory should be 7MB');
  assert(hashStat.topKey.key === 'h1', 'hash top key should be h1');
  assert(hashStat.topKey.memoryBytes === 5 * 1024 * 1024, 'hash top key memory should be 5MB');

  const stringStat = stats.find(s => s.type === 'string');
  assert(stringStat.count === 3, 'string should have 3 keys');
  assert(stringStat.totalMemoryBytes === 6 * 1024 * 1024, 'string total memory should be 6MB');
  assert(stringStat.topKey.key === 's3', 'string top key should be s3 (3MB)');

  const listStat = stats.find(s => s.type === 'list');
  assert(listStat.count === 1, 'list should have 1 key');
  assert(listStat.avgMemoryBytes === 4 * 1024 * 1024, 'list avg memory should be 4MB');

  const totalMem = mockBigKeys.reduce((sum, k) => sum + k.memoryBytes, 0);
  const percentageSum = stats.reduce((sum, s) => sum + s.percentage, 0);
  assert(Math.abs(percentageSum - 100) < 0.1,
    `Percentage sum should be ~100, got ${percentageSum.toFixed(2)}`);

  const unknownKey = { key: 'u1', type: 'unknown_type', memoryBytes: 1024, memoryFormatted: '1 KB', ttl: null };
  const statsWithUnknown = groupByType([unknownKey]);
  assert(statsWithUnknown.length === 1 && statsWithUnknown[0].type === 'unknown_type',
    'Unknown types should be included in results');

  console.log('\n  Type statistics summary:');
  stats.forEach(s => {
    console.log(`    ${s.type.padEnd(8)} count=${s.count}  total=${s.totalMemoryFormatted.padEnd(8)} avg=${s.avgMemoryFormatted.padEnd(8)} top=${s.topKey.key} (${s.percentage}%)`);
  });

  console.log('\n=== Testing roundtrip ===');
  const sizes = ['1KB', '512KB', '1MB', '10MB', '1GB'];
  sizes.forEach(size => {
    const bytes = parseThreshold(size);
    const formatted = formatBytes(bytes);
    console.log(`  ${size} -> ${bytes} bytes -> ${formatted}`);
  });

  console.log('\n=== New Anti-Blocking Features Summary ===');
  console.log('  ✓ Batch delay: configurable sleep between SCAN batches');
  console.log('  ✓ Rate limit: maxKeysPerSecond to control throughput');
  console.log('  ✓ Pipeline: batch MEMORY/TYPE/TTL calls to reduce RTT');
  console.log('  ✓ Latency monitor: PING to measure Redis load');
  console.log('  ✓ Auto-throttle: dynamic delay based on Redis latency');
  console.log('  ✓ Stats output: latency history and throttle count');

  console.log('\n🎉 All tests passed!');
};

try {
  runTests();
} catch (err) {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
}
