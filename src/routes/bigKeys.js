const express = require('express');
const { scanBigKeys, parseThreshold } = require('../services/redisScanner');

const router = express.Router();

const parseBool = (value) => {
  if (value === 'true' || value === '1' || value === true) return true;
  if (value === 'false' || value === '0' || value === false) return false;
  return undefined;
};

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
      timeout,
      delayMs,
      maxKeysPerSecond,
      latencyThresholdMs,
      autoThrottle,
      latencyCheckInterval
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
    if (delayMs !== undefined) options.delayMs = parseInt(delayMs);
    if (maxKeysPerSecond !== undefined) options.maxKeysPerSecond = parseInt(maxKeysPerSecond);
    if (latencyThresholdMs !== undefined) options.latencyThresholdMs = parseInt(latencyThresholdMs);
    if (autoThrottle !== undefined) {
      const at = parseBool(autoThrottle);
      if (at !== undefined) options.autoThrottle = at;
    }
    if (latencyCheckInterval !== undefined) options.latencyCheckInterval = parseInt(latencyCheckInterval);

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

    if (delayMs !== undefined && (isNaN(options.delayMs) || options.delayMs < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid delayMs. Must be a non-negative integer (milliseconds).'
      });
    }

    if (maxKeysPerSecond !== undefined && (isNaN(options.maxKeysPerSecond) || options.maxKeysPerSecond < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid maxKeysPerSecond. Must be a non-negative integer (0 = unlimited).'
      });
    }

    if (latencyThresholdMs !== undefined && (isNaN(options.latencyThresholdMs) || options.latencyThresholdMs <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latencyThresholdMs. Must be a positive integer (milliseconds).'
      });
    }

    if (latencyCheckInterval !== undefined && (isNaN(options.latencyCheckInterval) || options.latencyCheckInterval <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latencyCheckInterval. Must be a positive integer.'
      });
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
