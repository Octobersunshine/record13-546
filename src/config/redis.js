const Redis = require('ioredis');

const createRedisClient = (options = {}) => {
  const config = {
    host: options.host || process.env.REDIS_HOST || '127.0.0.1',
    port: options.port || parseInt(process.env.REDIS_PORT || '6379'),
    password: options.password || process.env.REDIS_PASSWORD || undefined,
    db: options.db !== undefined ? options.db : parseInt(process.env.REDIS_DB || '0'),
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    ...options
  };

  const client = new Redis(config);

  client.on('error', (err) => {
    console.error(`Redis connection error [db=${config.db}]:`, err.message);
  });

  client.on('connect', () => {
    console.log(`Redis connected successfully [db=${config.db}, host=${config.host}:${config.port}]`);
  });

  return client;
};

module.exports = { createRedisClient };
