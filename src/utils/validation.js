const MESSAGE_SIZE_LIMIT = 8 * 1024; // 8KB en bytes
const MAX_MESSAGES_PER_MINUTE = 100; // Rate limiting

function validateMessage(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.type || typeof data.type !== 'string') return false;
  if (JSON.stringify(data).length > MESSAGE_SIZE_LIMIT) return false;
  return true;
}

function isRateLimited(userId, userConnections) {
  const conn = userConnections.get(userId);
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

module.exports = {
  MESSAGE_SIZE_LIMIT,
  MAX_MESSAGES_PER_MINUTE,
  validateMessage,
  isRateLimited
};
