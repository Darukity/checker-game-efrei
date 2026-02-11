// ==================== TOKEN UTILITIES ====================

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/constants');

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

module.exports = {
  verifyToken,
  generateToken
};
