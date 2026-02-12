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
    // Only start the game if it's not already in progress
    const result = await pool.query(
      `UPDATE games 
       SET status = $1, 
           current_turn = 1,
           game_state = jsonb_set(COALESCE(game_state, '{}'), '{currentTurn}', '1'),
           started_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND status != 'in_progress'
       RETURNING *`,
      ['in_progress', gameId]
    );

    if (result.rows.length === 0) {
      // Game not found or already in progress - fetch current state instead
      const currentGame = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
      
      if (currentGame.rows.length === 0) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          data: { message: 'Partie non trouvée' }
        }));
        return;
      }
      
      // Game already started, just send current state without resetting turn
      const gameData = currentGame.rows[0];
      const player1 = await pool.query('SELECT username FROM users WHERE id = $1', [gameData.player1_id]);
      const player2 = gameData.player2_id ? await pool.query('SELECT username FROM users WHERE id = $1', [gameData.player2_id]) : null;

      const gameStateToSend = {
        ...gameData,
        player1_username: player1.rows[0]?.username,
        player2_username: player2?.rows[0]?.username
      };

      broadcastToGameRoom(gameRooms, gameId, {
        type: 'GAME_STATE',
        data: gameStateToSend
      });
      
      console.log(`⚠️ GAME_START ignored - game ${gameId} already in progress`);
      return;
    }

    const gameData = result.rows[0];
    
    // Get player usernames
    const player1 = await pool.query('SELECT username FROM users WHERE id = $1', [gameData.player1_id]);
    const player2 = gameData.player2_id ? await pool.query('SELECT username FROM users WHERE id = $1', [gameData.player2_id]) : null;

    const gameStateToSend = {
      ...gameData,
      player1_username: player1.rows[0]?.username,
      player2_username: player2?.rows[0]?.username
    };

    // Broadcast GAME_STATE to all players in the room (includes current_turn)
    broadcastToGameRoom(gameRooms, gameId, {
      type: 'GAME_STATE',
      data: gameStateToSend
    });
    
    // Also send GAME_START event for backward compatibility
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
    
    // Determine if this user is an actual player or a spectator
    const isPlayer = (userId === gameData.player1_id || userId === gameData.player2_id);
    
    // Only update status to 'in_game' if they're an actual player
    if (isPlayer) {
      await updateUserStatus(userId, 'in_game');

      // Broadcast status change to all users in general channel
      broadcastToLobby(lobbyUsers, {
        type: 'USER_STATUS',
        data: { userId, status: 'in_game' }
      });
      
      console.log(`✅ Player ${userId} joined game ${gameId}`);
    } else {
      console.log(`👁️ Spectator ${userId} joined game ${gameId}`);
    }

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

    // Only broadcast PLAYER_JOINED if this is an actual player, not a spectator
    if (isPlayer) {
      broadcastToGameRoom(gameRooms, gameId, {
        type: 'PLAYER_JOINED',
        data: { userId, gameId }
      }, ws);
    }
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
    gameRooms.get(gameId).add(ws); // Add WebSocket, not userId

    // Get game info to exclude actual players from viewer count
    const game = await pool.query('SELECT player1_id, player2_id FROM games WHERE id = $1', [gameId]);
    
    const viewerCount = await pool.query(
      'SELECT COUNT(*) as count FROM game_viewers WHERE game_id = $1 AND user_id NOT IN ($2, $3)',
      [gameId, game.rows[0].player1_id, game.rows[0].player2_id]
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

  try {
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

    // Remove from game_viewers table
    await pool.query(
      'DELETE FROM game_viewers WHERE game_id = $1 AND user_id = $2',
      [gameId, userId]
    );

    // Get game info to exclude actual players from viewer count
    const game = await pool.query('SELECT player1_id, player2_id FROM games WHERE id = $1', [gameId]);
    
    if (game.rows.length > 0) {
      const viewerCount = await pool.query(
        'SELECT COUNT(*) as count FROM game_viewers WHERE game_id = $1 AND user_id NOT IN ($2, $3)',
        [gameId, game.rows[0].player1_id, game.rows[0].player2_id]
      );

      // Broadcast updated viewer count
      broadcastToGameRoom(gameRooms, gameId, {
        type: 'VIEWER_COUNT_UPDATE',
        data: { gameId, count: viewerCount.rows[0].count }
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
  } catch (err) {
    console.error('Erreur lors du départ du jeu:', err);
  }
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
