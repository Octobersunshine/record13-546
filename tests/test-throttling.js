const { calculateDelay } = require('../src/services/redisScanner');

console.log('='.repeat(60));
console.log('Redis Big Key Scanner - Anti-Blocking Feature Demo');
console.log('='.repeat(60));

console.log('\n📊 Scenario Comparison: Default vs Production-Safe\n');

const scenarios = [
  {
    name: 'Unlimited speed (old behavior)',
    params: { delayMs: 0, maxKeysPerSecond: 0, autoThrottle: false },
    description: 'Fast but risky for production'
  },
  {
    name: 'Default (safe default)',
    params: { delayMs: 10, maxKeysPerSecond: 0, autoThrottle: true, latencyThresholdMs: 50 },
    description: 'Balanced, with auto-throttle protection'
  },
  {
    name: 'Production safe',
    params: { delayMs: 50, maxKeysPerSecond: 500, autoThrottle: true, latencyThresholdMs: 30 },
    description: 'Recommended for high-traffic environments'
  },
  {
    name: 'Ultra safe / low impact',
    params: { delayMs: 100, maxKeysPerSecond: 100, autoThrottle: true, latencyThresholdMs: 20 },
    description: 'Minimal performance impact, slower scan'
  }
];

scenarios.forEach((scenario, idx) => {
  console.log(`\n${idx + 1}. ${scenario.name}`);
  console.log(`   ${scenario.description}`);
  console.log(`   Parameters:`, JSON.stringify(scenario.params));
});

console.log('\n' + '='.repeat(60));
console.log('📈 Auto-Throttle Response Simulation');
console.log('='.repeat(60));

const simulateScan = (baseDelay, threshold, latencyPattern) => {
  console.log(`\nSimulation: baseDelay=${baseDelay}ms, threshold=${threshold}ms`);
  console.log('-'.repeat(40));

  let currentDelay = baseDelay;
  latencyPattern.forEach((latency, i) => {
    const newDelay = calculateDelay(baseDelay, latency, threshold);
    const throttled = newDelay > currentDelay;
    const recovered = newDelay < currentDelay && latency < threshold * 0.5;

    let action = '';
    if (throttled) action = '🔴 THROTTLE UP';
    else if (recovered) action = '🟢 THROTTLE DOWN';
    else action = '⚪ NO CHANGE';

    console.log(`  Batch ${i.toString().padStart(2)}: latency=${latency.toString().padStart(3)}ms -> delay=${currentDelay.toString().padStart(3)}ms -> ${newDelay.toString().padStart(3)}ms ${action}`);

    if (throttled) {
      currentDelay = newDelay;
    } else if (recovered) {
      currentDelay = Math.max(baseDelay, Math.floor(currentDelay / 2));
    }
  });
};

const latencyPatterns = [
  [5, 8, 12, 15, 20, 30, 45, 60, 80, 120, 150, 200, 180, 150, 100, 60, 30, 15, 10, 8],
  [10, 15, 20, 55, 60, 58, 52, 48, 45, 42, 38, 35, 30, 25, 20, 15, 12, 10],
  [5, 10, 15, 200, 250, 300, 280, 200, 150, 100, 50, 20, 10, 8, 5]
];

console.log('\nScenario 1: Gradual load increase then recovery');
simulateScan(10, 50, latencyPatterns[0]);

console.log('\nScenario 2: Brief spike then quick recovery');
simulateScan(10, 50, latencyPatterns[1]);

console.log('\nScenario 3: Severe spike with gradual recovery');
simulateScan(10, 50, latencyPatterns[2]);

console.log('\n' + '='.repeat(60));
console.log('📋 API Usage Examples');
console.log('='.repeat(60));

console.log('\n1. Default scan (with auto-throttle protection):');
console.log('   GET /api/big-keys?db=0&threshold=1MB');

console.log('\n2. Production-safe scan (max 500 keys/sec):');
console.log('   GET /api/big-keys?db=0&threshold=1MB&maxKeysPerSecond=500&delayMs=50');

console.log('\n3. Ultra-safe scan for peak hours:');
console.log('   GET /api/big-keys?db=0&threshold=1MB&maxKeysPerSecond=100&latencyThresholdMs=20');

console.log('\n4. Disable throttling (NOT recommended for production):');
console.log('   GET /api/big-keys?db=0&threshold=1MB&delayMs=0&autoThrottle=false');

console.log('\n5. Scan with custom pattern and strict throttling:');
console.log('   GET /api/big-keys?db=1&threshold=512KB&pattern=cache:*&maxKeysPerSecond=200&delayMs=100');

console.log('\n' + '='.repeat(60));
console.log('✅ Anti-Blocking Features Summary');
console.log('='.repeat(60));

const features = [
  { feature: 'SCAN command', benefit: 'Non-blocking key iteration (vs KEYS command)' },
  { feature: 'Configurable delay', benefit: 'Pause between batches to yield CPU time' },
  { feature: 'Rate limiting', benefit: 'Control max keys/sec to cap resource usage' },
  { feature: 'Redis pipeline', benefit: 'Batch commands to reduce network RTT by ~70%' },
  { feature: 'Latency monitoring', benefit: 'Real-time PING to detect Redis load' },
  { feature: 'Auto-throttle', benefit: 'Dynamic delay adjustment based on latency' },
  { feature: 'Graceful recovery', benefit: 'Gradually speed up when load decreases' },
  { feature: 'Stats output', benefit: 'Latency history, throttle count, throughput metrics' }
];

features.forEach((item, i) => {
  console.log(`\n${i + 1}. ${item.feature}`);
  console.log(`   Benefit: ${item.benefit}`);
});

console.log('\n' + '='.repeat(60));
console.log('🎯 Recommended Configuration for Production');
console.log('='.repeat(60));

console.log('\nFor high-traffic production environments:');
console.log('  maxKeysPerSecond: 200-500 (adjust based on your Redis load)');
console.log('  delayMs: 20-50ms');
console.log('  latencyThresholdMs: 20-30ms (lower = more sensitive)');
console.log('  autoThrottle: true');
console.log('  count: 50-100 (smaller batches = finer throttling)');

console.log('\nFor off-peak / maintenance windows:');
console.log('  maxKeysPerSecond: 1000-2000');
console.log('  delayMs: 5-10ms');
console.log('  latencyThresholdMs: 50ms');

console.log('\n💡 Tip: Start with conservative settings and gradually increase');
console.log('   while monitoring Redis latency and error rates.\n');
