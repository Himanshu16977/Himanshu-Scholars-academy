const mongoose = require('mongoose');

// @desc    Get API Info
// @route   GET /api
// @access  Public
const getApiInfo = (req, res) => {
  res.status(200).json({
    success: true,
    academy: 'Himanshu Scholars Academy',
    tagline: 'Learn Today, Lead Tomorrow',
    version: '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
};

// @desc    Check Server & DB Health
// @route   GET /api/health
// @access  Public
const getHealthStatus = (req, res) => {
  const dbStatusMap = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting',
  };

  const dbState = mongoose.connection.readyState;

  res.status(200).json({
    success: true,
    message: 'Himanshu Scholars Academy API is operational',
    uptime: `${Math.floor(process.uptime())} seconds`,
    database: {
      status: dbStatusMap[dbState] || 'Unknown',
      connected: dbState === 1,
    },
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  getApiInfo,
  getHealthStatus,
};
