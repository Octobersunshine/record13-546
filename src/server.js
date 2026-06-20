require('dotenv').config();
const express = require('express');
const bigKeysRoutes = require('./routes/bigKeys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
});

app.use('/api/big-keys', bigKeysRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    availableEndpoints: [
      { method: 'GET', path: '/api/health', description: 'Health check' },
      { method: 'GET', path: '/api/big-keys', description: 'Scan Redis for big keys' }
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Redis Big Key Scanner API Server`);
  console.log(`Running on: http://localhost:${PORT}`);
  console.log(`========================================\n`);
  console.log(`Available Endpoints:`);
  console.log(`  GET /api/health`);
  console.log(`  GET /api/big-keys?db=0&threshold=1MB`);
  console.log(`\nConnection Parameters:`);
  console.log(`  host      - Redis host (default: 127.0.0.1)`);
  console.log(`  port      - Redis port (default: 6379)`);
  console.log(`  password  - Redis password`);
  console.log(`  db        - Redis database number (default: 0)`);
  console.log(`\nScan Parameters:`);
  console.log(`  threshold - Memory threshold (default: 1MB)`);
  console.log(`  pattern   - Key match pattern (default: *)`);
  console.log(`  count     - SCAN batch size (default: 100)`);
  console.log(`  timeout   - Timeout in ms (default: 300000)`);
  console.log(`\nAnti-Blocking Parameters (production safe):`);
  console.log(`  delayMs             - Base delay between batches in ms (default: 10)`);
  console.log(`  maxKeysPerSecond    - Max keys to scan per second, 0=unlimited (default: 0)`);
  console.log(`  latencyThresholdMs  - Redis latency threshold for auto-throttle (default: 50)`);
  console.log(`  autoThrottle        - Enable auto throttle based on latency (default: true)`);
  console.log(`  latencyCheckInterval- Check latency every N batches (default: 10)\n`);
  console.log(`Examples:`);
  console.log(`  Safe for production: GET /api/big-keys?db=0&maxKeysPerSecond=500&delayMs=50`);
  console.log(`  Ultra-safe mode:    GET /api/big-keys?db=0&maxKeysPerSecond=100&latencyThresholdMs=20\n`);
});
