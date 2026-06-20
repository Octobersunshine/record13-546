const express = require('express');
const { scanBigKeys, parseThreshold } = require('../services/redisScanner');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const {
      host,
      port,
      password,
      db,
      threshold,
      pattern,
      count,
      timeout
    } = req.query;

    const options = {};
    if (host) options.host = host;
    if (port) options.port = parseInt(port);
    if (password) options.password = password;
    if (db !== undefined) options.db = parseInt(db);
    if (threshold) options.threshold = threshold;
    if (pattern) options.pattern = pattern;
    if (count) options.count = parseInt(count);
    if (timeout) options.timeout = parseInt(timeout);

    if (db !== undefined && (isNaN(options.db) || options.db < 0 || options.db > 15)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid db parameter. Must be an integer between 0 and 15.'
      });
    }

    if (threshold) {
      const parsed = parseThreshold(threshold);
      if (isNaN(parsed) || parsed <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid threshold. Use format like "1MB", "512KB", "1024" (bytes).'
        });
      }
    }

    const result = await scanBigKeys(options);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
