// ==================== WEBSOCKET HANDLERS ====================

const WebSocketManager = require('./manager');
const { verifyToken } = require('../utils/tokenUtils');
const userQueries = require('../db/queries/userQueries');
const gameQueries = require('../db/queries/gameQueries');
const RateLimiter = require('../utils/rateLimiter');
const { validateMessage } = require('../utils/validation');

class WebSocketHandlers {
  static async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);

      // Validate message
      if (!validateMessage(message)) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          data: { message: 'Message mal formé ou trop volumineux' }
        }));
        return;
      }

      const { type, data: msgData, token } = message;
      let userId = null;

      // Store user ID from previous auth
      if (ws.userId) {
        userId = ws.userId;
      }

      // Authenticate for non-AUTH messages
      if (type !== 'AUTH' && !userId) {
        if (!token) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            data: { message: 'Authentification requise' }
          }));
          return;
        }

        const decoded = verifyToken(token);
        if (!decoded) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            data: { message: 'Token invalide' }
          }));
          return;
        }

        userId = decoded.userId;
        ws.userId = userId;
      }

      // Rate limiting
      if (userId && RateLimiter.isRateLimited(userId)) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          data: { message: 'Trop de messages, veuillez attendre' }
        }));
        return;
      }

      // Handle different message types
      switch (type) {
        case 'AUTH':
          await this.handleAuth(ws, msgData);
          break;

        case 'LOBBY_JOIN':
          await this.handleLobbyJoin(ws, userId);
          break;

        case 'LOBBY_LEAVE':
          this.handleLobbyLeave(ws, userId);
          break;

        case 'GAME_JOIN':
          await this.handleGameJoin(ws, userId, msgData);
          break;

        case 'GAME_START':
          await this.handleGameStart(ws, userId, msgData);
          break;

        case 'VIEW_GAME':
          await this.handleViewGame(ws, userId, msgData);
          break;

        case 'PING':
          ws.send(JSON.stringify({
            type: 'PONG',
            data: {}
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'ERROR',
            data: { message: 'Type de message inconnu' }
          }));
      }
    } catch (err) {
      console.error('Erreur lors du traitement du message WebSocket:', err);
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Erreur serveur' }
      }));
    }
  }

  static async handleAuth(ws, data) {
    const { token } = data;

    if (!token) {
      ws.send(JSON.stringify({
        type: 'AUTH_ERROR',
        data: { message: 'Token manquant' }
      }));
      return;
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      ws.send(JSON.stringify({
        type: 'AUTH_ERROR',
        data: { message: 'Token invalide' }
      }));
      return;
    }

    const userId = decoded.userId;
    ws.userId = userId;

    await userQueries.updateUserStatus(userId, 'online');
    WebSocketManager.registerUserConnection(userId, ws);

    ws.send(JSON.stringify({
      type: 'AUTH_SUCCESS',
      data: { userId, message: 'Authentification réussie' }
    }));
  }

  static async handleLobbyJoin(ws, userId) {
    WebSocketManager.addToLobby(userId, ws);
    ws.isInLobby = true;

    const users = await userQueries.getUsersOnline();

    ws.send(JSON.stringify({
      type: 'LOBBY_UPDATE',
      data: { users }
    }));

    // Broadcast to other users
    WebSocketManager.broadcastToLobby({
      type: 'USER_STATUS',
      data: { userId, status: 'online' }
    }, userId);
  }

  static handleLobbyLeave(ws, userId) {
    if (WebSocketManager.lobbyUsers.get(userId) === ws) {
      WebSocketManager.removeFromLobby(userId);
      ws.isInLobby = false;
    }
  }

  static async handleGameJoin(ws, userId, data) {
    const { gameId } = data;

    if (!gameId) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'gameId requis' }
      }));
      return;
    }

    try {
      WebSocketManager.addToGameRoom(gameId, ws);
      ws.currentGameId = gameId;

      const game = await gameQueries.getGameById(gameId);

      if (!game) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          data: { message: 'Partie non trouvée' }
        }));
        return;
      }

      const player1 = await userQueries.getUserById(game.player1_id);
      const player2 = game.player2_id ? await userQueries.getUserById(game.player2_id) : null;

      const gameStateToSend = {
        ...game,
        player1_username: player1?.username,
        player2_username: player2?.username
      };

      ws.send(JSON.stringify({
        type: 'GAME_STATE',
        data: gameStateToSend
      }));

      // Broadcast to other players
      WebSocketManager.broadcastToGameRoom(gameId, {
        type: 'PLAYER_JOINED',
        data: { userId, gameId }
      }, ws);
    } catch (err) {
      console.error('Erreur lors de la connexion au jeu:', err);
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Erreur lors de la connexion au jeu' }
      }));
    }
  }

  static handleDisconnect(ws) {
    const userId = ws.userId;

    if (userId) {
      // Remove from lobby if present
      if (ws.isInLobby && WebSocketManager.lobbyUsers.get(userId) === ws) {
        WebSocketManager.removeFromLobby(userId);
        userQueries.updateUserStatus(userId, 'offline');
        WebSocketManager.broadcastToLobby({
          type: 'LOBBY_UPDATE',
          data: { users: [] }
        });
      }

      // Remove from game room if present
      if (ws.currentGameId && WebSocketManager.gameRooms.get(ws.currentGameId)) {
        WebSocketManager.removeFromGameRoom(ws.currentGameId, ws);
      }

      // Remove user connection
      WebSocketManager.removeUserConnection(userId);
    }
  }

  static async handleGameStart(ws, userId, data) {
    const { gameId } = data;

    if (!gameId) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'gameId requis' }
      }));
      return;
    }

    try {
      const game = await gameQueries.getGameById(gameId);

      if (!game) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          data: { message: 'Partie non trouvée' }
        }));
        return;
      }

      // Update game status to in_progress
      await gameQueries.updateGameStatus(gameId, 'in_progress');

      // Broadcast game start to all players
      WebSocketManager.broadcastToGameRoom(gameId, {
        type: 'GAME_START',
        data: { gameId, startedAt: new Date() }
      });
    } catch (err) {
      console.error('Erreur lors du démarrage du jeu:', err);
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Erreur lors du démarrage du jeu' }
      }));
    }
  }

  static async handleViewGame(ws, userId, data) {
    const { gameId } = data;

    if (!gameId) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'gameId requis' }
      }));
      return;
    }

    try {
      // Add user to game room as a spectator
      WebSocketManager.addToGameRoom(gameId, ws);
      ws.currentGameId = gameId;
      ws.isSpectator = true;

      const game = await gameQueries.getGameById(gameId);

      if (!game) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          data: { message: 'Partie non trouvée' }
        }));
        return;
      }

      // Increment viewer count manually (would need a counter in the future)
      WebSocketManager.broadcastToGameRoom(gameId, {
        type: 'VIEWER_COUNT_UPDATE',
        data: { count: 1 }
      }, ws);

      ws.send(JSON.stringify({
        type: 'GAME_STATE',
        data: game
      }));
    } catch (err) {
      console.error('Erreur lors de la visualisation du jeu:', err);
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Erreur lors de la connexion au spectateur' }
      }));
    }
  }
}

module.exports = WebSocketHandlers;
