const { verifyToken } = require('../utils/auth');
const { validateMessage, isRateLimited } = require('../utils/validation');
const { updateUserStatus, getUsersOnline } = require('../services/userService');
const { broadcastToLobby, broadcastToGameRoom } = require('../utils/game');
const {
  setSharedData,
  handleAuth,
  handleLobbyJoin,
  handleLobbyLeave,
  handleGameMove,
  handleChatMessage,
  handleGameStart,
  handleGameJoin,
  handleGameLeave,
  handleInviteGame,
  handleAcceptInvite,
  handleViewGame
} = require('./handlers');

function setupWebSocket(wss, userConnections, gameRooms, lobbyUsers) {
  // Share data structures with handlers
  setSharedData(userConnections, gameRooms, lobbyUsers);

  wss.on('connection', (ws, req) => {
    console.log('📱 Nouveau client WebSocket connecté');
    let userId = null;
    let currentGameId = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);

        // Validation du message
        if (!validateMessage(message)) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            data: { message: 'Message mal formé ou trop volumineux' }
          }));
          return;
        }

        const { type, data: msgData, token } = message;

        // Authentication pour les messages non-AUTH
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

          userId = parseInt(decoded.userId);
        }

        // Rate limiting
        if (userId && isRateLimited(userId, userConnections)) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            data: { message: 'Trop de messages, veuillez attendre' }
          }));
          return;
        }

        // Traiter les différents types de messages
        switch (type) {
          case 'AUTH':
            userId = await handleAuth(ws, msgData);
            // Automatically join general channel after authentication
            if (userId) {
              await handleLobbyJoin(ws, userId);
            }
            break;

          case 'LOBBY_JOIN':
            // Keep for backward compatibility, but now it's automatic after AUTH
            await handleLobbyJoin(ws, userId);
            break;

          case 'LOBBY_LEAVE':
            // Deprecated - users stay in general channel until disconnect
            // Keep for backward compatibility but do nothing
            break;

          case 'GAME_MOVE':
            await handleGameMove(ws, userId, msgData);
            break;

          case 'CHAT_MESSAGE':
            await handleChatMessage(ws, userId, msgData);
            break;

          case 'GAME_START':
            await handleGameStart(ws, userId, msgData);
            break;

          case 'GAME_JOIN':
            currentGameId = msgData.gameId;
            await handleGameJoin(ws, userId, msgData);
            break;

          case 'GAME_LEAVE':
            if (currentGameId) {
              handleGameLeave(ws, userId, { gameId: currentGameId });
              currentGameId = null;
            }
            break;

          case 'INVITE_GAME':
            await handleInviteGame(ws, userId, msgData);
            break;

          case 'ACCEPT_INVITE':
            await handleAcceptInvite(ws, userId, msgData);
            break;

          case 'VIEW_GAME':
            await handleViewGame(ws, userId, msgData);
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
    });

    ws.on('close', async () => {
      console.log(`👋 Client déconnecté (userId: ${userId})`);
      if (userId) {
        // Always remove from general channel (lobby)
        if (lobbyUsers.get(userId) === ws) {
          lobbyUsers.delete(userId);
          // Broadcast user offline status to all users in general channel
          broadcastToLobby(lobbyUsers, {
            type: 'USER_STATUS',
            data: { userId, status: 'offline' }
          });
        }

        // Retirer du game room si présent
        if (currentGameId && gameRooms.has(currentGameId)) {
          gameRooms.get(currentGameId).delete(ws);
          if (gameRooms.get(currentGameId).size === 0) {
            gameRooms.delete(currentGameId);
          }
          // Notify other players in game room
          broadcastToGameRoom(gameRooms, currentGameId, {
            type: 'PLAYER_DISCONNECTED',
            data: { userId, gameId: currentGameId }
          });
        }

        // Retirer de userConnections si c'est bien cette WebSocket
        const conn = userConnections.get(userId);
        if (conn && conn.ws === ws) {
          userConnections.delete(userId);
          await updateUserStatus(userId, 'offline');
        }
      }
    });
  });
}

module.exports = { setupWebSocket };
