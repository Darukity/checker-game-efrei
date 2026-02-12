const pool = require('../db/pool');
const { verifyToken } = require('../utils/auth');
const { updateUserStatus, getUsersOnline } = require('../services/userService');
const { broadcastToLobby, broadcastToGameRoom } = require('../utils/game');

// Will be set by connection.js
let userConnections = null;
let gameRooms = null;
let lobbyUsers = null;

function setSharedData(connections, rooms, lobby) {
  userConnections = connections;
  gameRooms = rooms;
  lobbyUsers = lobby;
}

async function handleAuth(ws, data) {
  const { token } = data;

  if (!token) {
    ws.send(JSON.stringify({
      type: 'AUTH_ERROR',
      data: { message: 'Token manquant' }
    }));
    return null;
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    ws.send(JSON.stringify({
      type: 'AUTH_ERROR',
      data: { message: 'Token invalide' }
    }));
    return null;
  }

  const userId = parseInt(decoded.userId);
  await updateUserStatus(userId, 'online');

  // Store or update the connection for this user
  userConnections.set(userId, {
    ws,
    status: 'online',
    lastMessageTime: Date.now(),
    messageCount: 0
  });

  ws.send(JSON.stringify({
    type: 'AUTH_SUCCESS',
    data: { userId, message: 'Authentification réussie' }
  }));

  return userId;
}

async function handleLobbyJoin(ws, userId) {
  // Add user to general channel (replace if already exists from another connection)
  lobbyUsers.set(userId, ws);

  const users = await getUsersOnline();

  // Send full user list to the joining user
  ws.send(JSON.stringify({
    type: 'LOBBY_UPDATE',
    data: { users }
  }));

  // Broadcast to all other users in general channel that a user came online
  broadcastToLobby(lobbyUsers, {
    type: 'USER_STATUS',
    data: { userId, status: 'online' }
  }, userId);

  console.log(`✅ User ${userId} joined general channel. Total users: ${lobbyUsers.size}`);
}

function handleLobbyLeave(ws, userId) {
  // Only remove if this WebSocket is the current one for this user
  if (lobbyUsers.get(userId) === ws) {
    lobbyUsers.delete(userId);
  }
}

async function handleGameMove(ws, userId, data) {
  // Deprecated: Game moves should now use POST /api/games/:gameId/move
  ws.send(JSON.stringify({
    type: 'ERROR',
    data: { message: 'Utilisez l\'API REST pour les mouvements' }
  }));
}

async function handleChatMessage(ws, userId, data) {
  // Deprecated: Chat messages should now use POST /api/games/:gameId/chat
  ws.send(JSON.stringify({
    type: 'ERROR',
    data: { message: 'Utilisez l\'API REST pour les messages de chat' }
  }));
}

async function handleGameStart(ws, userId, data) {
  const { gameId } = data;

  if (!gameId) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'gameId requis' }
    }));
    return;
  }

  try {
    const result = await pool.query(
      'UPDATE games SET status = $1, started_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['in_progress', gameId]
    );

    broadcastToGameRoom(gameRooms, gameId, {
      type: 'GAME_START',
      data: { gameId }
    });
  } catch (err) {
    console.error('Erreur lors du démarrage du jeu:', err);
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Erreur lors du démarrage' }
    }));
  }
}

async function handleGameJoin(ws, userId, data) {
  const { gameId } = data;

  if (!gameId) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'gameId requis' }
    }));
    return;
  }

  try {
    // Add WebSocket to game room (game namespace)
    // Note: User stays connected to general channel (lobbyUsers) as well
    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, new Set());
    }
    gameRooms.get(gameId).add(ws);

    console.log(`🎮 User ${userId} joined game room ${gameId}. Room size: ${gameRooms.get(gameId).size}`);

    // Update user status to 'in_game' so they don't appear in lobby
    await updateUserStatus(userId, 'in_game');

    // Broadcast status change to all users in general channel
    broadcastToLobby(lobbyUsers, {
      type: 'USER_STATUS',
      data: { userId, status: 'in_game' }
    });

    // Retrieve game state
    const game = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);

    if (game.rows.length === 0) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Partie non trouvée' }
      }));
      return;
    }

    // Get player usernames
    const gameData = game.rows[0];
    const player1 = await pool.query('SELECT username FROM users WHERE id = $1', [gameData.player1_id]);
    const player2 = gameData.player2_id ? await pool.query('SELECT username FROM users WHERE id = $1', [gameData.player2_id]) : null;

    // Ensure game_state is properly formatted
    // PostgreSQL returns JSONB as an object, so we keep it as-is
    const gameStateToSend = {
      ...gameData,
      player1_username: player1.rows[0]?.username,
      player2_username: player2?.rows[0]?.username
    };

    console.log('Type of game_state:', typeof gameData.game_state);
    console.log('game_state content:', gameData.game_state);
    console.log('Sending GAME_STATE with board:', gameData.game_state?.board ? 'yes' : 'no');

    // Send game state to the joining user
    ws.send(JSON.stringify({
      type: 'GAME_STATE',
      data: gameStateToSend
    }));

    // Broadcast to other players in the game room (not general channel)
    broadcastToGameRoom(gameRooms, gameId, {
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

async function handleInviteGame(ws, userId, data) {
  // Deprecated: Game invitations should now use POST /api/games
  ws.send(JSON.stringify({
    type: 'ERROR',
    data: { message: 'Utilisez l\'API REST pour les invitations' }
  }));
}

async function handleAcceptInvite(ws, userId, data) {
  // Deprecated: Accept invitations should now use POST /api/games/:gameId/accept
  ws.send(JSON.stringify({
    type: 'ERROR',
    data: { message: 'Utilisez l\'API REST pour accepter les invitations' }
  }));
}

async function handleViewGame(ws, userId, data) {
  const { gameId } = data;

  if (!gameId) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'gameId requis' }
    }));
    return;
  }

  try {
    await pool.query(
      'INSERT INTO game_viewers (game_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [gameId, userId]
    );

    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, new Set());
    }
    gameRooms.get(gameId).add(userId);

    const viewerCount = await pool.query(
      'SELECT COUNT(*) as count FROM game_viewers WHERE game_id = $1',
      [gameId]
    );

    broadcastToGameRoom(gameRooms, gameId, {
      type: 'VIEWER_COUNT_UPDATE',
      data: { gameId, count: viewerCount.rows[0].count }
    });
  } catch (err) {
    console.error('Erreur lors de la mise à jour des viewers:', err);
  }
}

async function handleGameLeave(ws, userId, data) {
  const { gameId } = data;

  if (!gameId) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'gameId requis' }
    }));
    return;
  }

  // Remove user from game room but keep them in general channel
  if (gameRooms.has(gameId)) {
    gameRooms.get(gameId).delete(ws);
    console.log(`👋 User ${userId} left game room ${gameId}. Room size: ${gameRooms.get(gameId).size}`);
    
    // Clean up empty game rooms
    if (gameRooms.get(gameId).size === 0) {
      gameRooms.delete(gameId);
      console.log(`🗑️ Game room ${gameId} deleted (empty)`);
    }

    // Notify other players in game room
    broadcastToGameRoom(gameRooms, gameId, {
      type: 'PLAYER_LEFT',
      data: { userId, gameId }
    });
  }

  // Update user status back to 'online' - now available in lobby again
  await updateUserStatus(userId, 'online');

  // Broadcast status change to all users in general channel
  broadcastToLobby(lobbyUsers, {
    type: 'USER_STATUS',
    data: { userId, status: 'online' }
  });

  ws.send(JSON.stringify({
    type: 'GAME_LEAVE_SUCCESS',
    data: { gameId }
  }));
}

module.exports = {
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
};
