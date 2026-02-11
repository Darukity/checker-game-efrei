// ==================== VALIDATION UTILITIES ====================

const { MESSAGE_SIZE_LIMIT } = require('../config/constants');

function validateMessage(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.type || typeof data.type !== 'string') return false;
  if (JSON.stringify(data).length > MESSAGE_SIZE_LIMIT) return false;
  return true;
}

module.exports = {
  validateMessage
};
