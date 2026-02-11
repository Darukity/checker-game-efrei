// ==================== RATE LIMITER ====================

const { MAX_MESSAGES_PER_MINUTE } = require('../config/constants');

class RateLimiter {
  static userConnections = new Map();

  static registerConnection(userId, ws) {
    this.userConnections.set(userId, {
      ws,
      status: 'online',
      lastMessageTime: Date.now(),
      messageCount: 0
    });
  }

  static isRateLimited(userId) {
    const conn = this.userConnections.get(userId);
    if (!conn) return false;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    if (conn.lastMessageTime < oneMinuteAgo) {
      conn.messageCount = 0;
      conn.lastMessageTime = now;
      return false;
    }

    conn.messageCount++;
    return conn.messageCount > MAX_MESSAGES_PER_MINUTE;
  }

  static removeConnection(userId) {
    this.userConnections.delete(userId);
  }

  static getConnection(userId) {
    return this.userConnections.get(userId);
  }

  static getAllConnections() {
    return this.userConnections;
  }
}

module.exports = RateLimiter;
