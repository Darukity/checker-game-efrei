// ==================== CONSTANTS ====================

require('dotenv').config();

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET,
  MESSAGE_SIZE_LIMIT: 8 * 1024, // 8KB
  MAX_MESSAGES_PER_MINUTE: 100,
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development'
};
