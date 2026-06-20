const { parseThreshold, formatBytes } = require('../src/services/redisScanner');

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

  console.log('\n=== Testing roundtrip ===');
  const sizes = ['1KB', '512KB', '1MB', '10MB', '1GB'];
  sizes.forEach(size => {
    const bytes = parseThreshold(size);
    const formatted = formatBytes(bytes);
    console.log(`  ${size} -> ${bytes} bytes -> ${formatted}`);
  });

  console.log('\n🎉 All tests passed!');
};

try {
  runTests();
} catch (err) {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
}
