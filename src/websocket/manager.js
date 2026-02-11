// ==================== WEBSOCKET MANAGER ====================

const RateLimiter = require('../utils/rateLimiter');

class WebSocketManager {
  static gameRooms = new Map();
  static lobbyUsers = new Map();

  static registerUserConnection(userId, ws) {
    RateLimiter.registerConnection(userId, ws);
  }

  static addToLobby(userId, ws) {
    this.lobbyUsers.set(userId, ws);
  }

  static removeFromLobby(userId) {
    this.lobbyUsers.delete(userId);
  }

  static addToGameRoom(gameId, ws) {
    if (!this.gameRooms.has(gameId)) {
      this.gameRooms.set(gameId, new Set());
    }
    this.gameRooms.get(gameId).add(ws);
  }

  static removeFromGameRoom(gameId, ws) {
    if (this.gameRooms.has(gameId)) {
      this.gameRooms.get(gameId).delete(ws);
      if (this.gameRooms.get(gameId).size === 0) {
        this.gameRooms.delete(gameId);
      }
    }
  }

  static broadcastToLobby(message, excludeUserId = null) {
    this.lobbyUsers.forEach((ws, userId) => {
      if (excludeUserId && userId === excludeUserId) return;
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
      }
    });
  }

  static broadcastToGameRoom(gameId, message, excludeWs = null) {
    if (!this.gameRooms.has(gameId)) return;
    
    this.gameRooms.get(gameId).forEach(ws => {
      if (excludeWs && ws === excludeWs) return;
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify(message));
      }
    });
  }

  static getUserConnection(userId) {
    return RateLimiter.getConnection(userId);
  }

  static removeUserConnection(userId) {
    RateLimiter.removeConnection(userId);
  }
}

module.exports = WebSocketManager;
