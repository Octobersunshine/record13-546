require('dotenv').config();
const { createRedisClient } = require('../src/config/redis');

const generateTestData = async () => {
  const client = createRedisClient();
  try {
    await client.connect();
    console.log('Generating test data...\n');

    await client.flushdb();
    console.log('Flushed existing data in db 0\n');

    const smallValue = 'x'.repeat(100);
    for (let i = 0; i < 50; i++) {
      await client.set(`small:key:${i}`, smallValue);
    }
    console.log('Created 50 small keys (~100 bytes each)');

    const mediumValue = 'x'.repeat(500 * 1024);
    for (let i = 0; i < 5; i++) {
      await client.set(`medium:key:${i}`, mediumValue);
    }
    console.log('Created 5 medium keys (~500KB each)');

    const largeValue = 'x'.repeat(2 * 1024 * 1024);
    for (let i = 0; i < 3; i++) {
      await client.set(`large:key:${i}`, largeValue);
    }
    console.log('Created 3 large keys (~2MB each)');

    const hugeValue = 'x'.repeat(5 * 1024 * 1024);
    await client.set('huge:key:0', hugeValue);
    console.log('Created 1 huge key (~5MB)');

    const listItems = Array(1000).fill('list_item_value');
    await client.rpush('big:list:0', ...listItems);
    console.log('Created 1 big list (~1000 items)');

    const hashData = {};
    for (let i = 0; i < 500; i++) {
      hashData[`field_${i}`] = 'hash_value_' + 'x'.repeat(100);
    }
    await client.hset('big:hash:0', hashData);
    console.log('Created 1 big hash (~500 fields)');

    await client.set('temp:key:0', 'temp_value', 'EX', 3600);
    console.log('Created 1 temp key with TTL');

    await client.set('permanent:key:0', 'permanent_value');
    console.log('Created 1 permanent key (no TTL)');

    console.log('\n✅ Test data generation complete!');
    console.log('\nNext steps:');
    console.log('  1. Start server: npm start');
    console.log('  2. Test API: curl "http://localhost:3000/api/big-keys?db=0&threshold=1MB"');

  } catch (err) {
    console.error('Failed to generate test data:', err.message);
  } finally {
    await client.quit();
  }
};

generateTestData();
