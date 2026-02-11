const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
require('dotenv').config();

const pool = require('./db/pool');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '8kb' })); // Limite de 8KB pour sécurité
app.use(express.static('public'));

// ==================== CONSTANTS ====================
const JWT_SECRET = process.env.JWT_SECRET;
const MESSAGE_SIZE_LIMIT = 8 * 1024; // 8KB en bytes
const MAX_MESSAGES_PER_MINUTE = 100; // Rate limiting

// ==================== DATA STRUCTURES ====================
const userConnections = new Map(); // userId -> { ws, status, lastMessageTime, messageCount }
const gameRooms = new Map(); // gameId -> Set of WebSocket connections
const lobbyUsers = new Map(); // userId -> WebSocket for lobby

// ==================== UTILITY FUNCTIONS ====================

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

function isRateLimited(userId) {
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

function validateMessage(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.type || typeof data.type !== 'string') return false;
  if (JSON.stringify(data).length > MESSAGE_SIZE_LIMIT) return false;
  return true;
}

function broadcastToLobby(message, excludeUserId = null) {
  lobbyUsers.forEach((ws, userId) => {
    if (excludeUserId && userId === excludeUserId) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

async function getUsersOnline() {
  try {
    const result = await pool.query(`
      SELECT id, username, online_status FROM users WHERE online_status = 'online'
    `);
    return result.rows;
  } catch (err) {
    console.error('Erreur lors de la récupération des utilisateurs:', err);
    return [];
  }
}

async function updateUserStatus(userId, status) {
  try {
    await pool.query('UPDATE users SET online_status = $1 WHERE id = $2', [status, userId]);
  } catch (err) {
    console.error('Erreur lors de la mise à jour du statut:', err);
  }
}

// ==================== HTTP ROUTES ====================

// Endpoint de santé
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const userExists = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Utilisateur ou email déjà existant' });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }

    const result = await pool.query('SELECT id, username, email, password FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const user = result.rows[0];
    const passwordValid = await bcryptjs.compare(password, user.password);

    if (!passwordValid) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Erreur lors de la connexion:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Verify token
app.post('/api/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    res.json({ valid: true, userId: decoded.userId });
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// Get current user info
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get all online users
app.get('/api/users/online', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, online_status FROM users WHERE online_status = 'online'
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur lors de la récupération des utilisateurs:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get user's games
app.get('/api/games/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(`
      SELECT 
        g.id, g.status, g.created_at, g.started_at, g.ended_at,
        u1.username as player1_username,
        u2.username as player2_username,
        (SELECT COUNT(*) FROM game_viewers WHERE game_id = g.id) as viewer_count
      FROM games g
      LEFT JOIN users u1 ON g.player1_id = u1.id
      LEFT JOIN users u2 ON g.player2_id = u2.id
      WHERE g.player1_id = $1 OR g.player2_id = $1
      ORDER BY g.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create a new game
app.post('/api/games', async (req, res) => {
  try {
    const { player1Id, player2Id } = req.body;

    if (!player1Id || !player2Id) {
      return res.status(400).json({ error: 'player1Id et player2Id requis' });
    }

    const result = await pool.query(
      `INSERT INTO games (player1_id, player2_id, game_state, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [player1Id, player2Id, { board: initializeBoard() }, 'waiting_for_opponent']
    );

    const game = result.rows[0];

    // Broadcast invitation to the invited player via general lobby channel
    const player2Conn = userConnections.get(parseInt(player2Id));
    console.log(`🎮 Sending invitation to player ${player2Id}, connection found:`, !!player2Conn);
    console.log(`📋 Active connections:`, Array.from(userConnections.keys()));
    
    if (player2Conn) {
      console.log(`🔍 WebSocket readyState for player ${player2Id}:`, player2Conn.ws.readyState);
      console.log(`🔍 WebSocket.OPEN constant:`, WebSocket.OPEN);
    }
    
    if (player2Conn && player2Conn.ws.readyState === WebSocket.OPEN) {
      const inviteMessage = JSON.stringify({
        type: 'GAME_INVITATION',
        data: { 
          fromUserId: player1Id, 
          gameId: game.id
        }
      });
      console.log(`📤 Sending message to player ${player2Id}:`, inviteMessage);
      player2Conn.ws.send(inviteMessage);
      console.log(`✅ Invitation sent to player ${player2Id}`);
    } else {
      console.log(`❌ Could not send invitation to player ${player2Id} - connection not found or not open`);
    }

    res.status(201).json(game);
  } catch (err) {
    console.error('Erreur lors de la création du jeu:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Accept game invitation
app.post('/api/games/:gameId/accept', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId requis' });
    }

    // Update game status to in_progress and set started_at
    const result = await pool.query(
      `UPDATE games 
       SET status = 'in_progress', started_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND player2_id = $2
       RETURNING *`,
      [gameId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partie non trouvée ou non autorisée' });
    }

    const game = result.rows[0];

    // Broadcast to both players to redirect them to the game
    const player1Conn = userConnections.get(game.player1_id);
    const player2Conn = userConnections.get(game.player2_id);

    if (player1Conn && player1Conn.ws.readyState === WebSocket.OPEN) {
      player1Conn.ws.send(JSON.stringify({
        type: 'GAME_ACCEPTED',
        data: { gameId: game.id }
      }));
    }

    if (player2Conn && player2Conn.ws.readyState === WebSocket.OPEN) {
      player2Conn.ws.send(JSON.stringify({
        type: 'GAME_ACCEPTED',
        data: { gameId: game.id }
      }));
    }

    res.json(game);
  } catch (err) {
    console.error('Erreur lors de l\'acceptation de l\'invitation:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Abandon a game
app.post('/api/games/:gameId/abandon', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId requis' });
    }

    // Fetch the game
    const gameResult = await pool.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }

    const game = gameResult.rows[0];

    // Verify user is part of the game
    if (game.player1_id !== userId && game.player2_id !== userId) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à abandonner cette partie' });
    }

    // Determine the winner (the opponent)
    const winnerId = game.player1_id === userId ? game.player2_id : game.player1_id;

    // Update game status to finished and set ended_at
    const result = await pool.query(
      `UPDATE games 
       SET status = 'finished', ended_at = CURRENT_TIMESTAMP, winner_id = $1
       WHERE id = $2
       RETURNING *`,
      [winnerId, gameId]
    );

    // Notify both players via WebSocket
    const player1Conn = userConnections.get(game.player1_id);
    const player2Conn = userConnections.get(game.player2_id);

    const notificationMessage = {
      type: 'GAME_ABANDONED',
      data: {
        gameId: game.id,
        abandonedByUserId: userId,
        winnerId: winnerId,
        message: `Le joueur a abandonné. Vous avez gagné!`
      }
    };

    if (player1Conn && player1Conn.ws.readyState === WebSocket.OPEN) {
      player1Conn.ws.send(JSON.stringify(notificationMessage));
    }

    if (player2Conn && player2Conn.ws.readyState === WebSocket.OPEN) {
      player2Conn.ws.send(JSON.stringify(notificationMessage));
    }

    res.json({ success: true, game: result.rows[0] });
  } catch (err) {
    console.error('Erreur lors de l\'abandon:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Make a game move
app.post('/api/games/:gameId/move', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, from, to } = req.body;

    if (!userId || !from || !to) {
      return res.status(400).json({ error: 'userId, from et to requis' });
    }

    // Verify user is part of the game
    const game = await pool.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );

    if (game.rows.length === 0) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }

    const gameData = game.rows[0];
    if (gameData.player1_id !== userId && gameData.player2_id !== userId) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à jouer dans cette partie' });
    }

    // TODO: Add move validation logic here
    
    // Record the move
    await pool.query(
      'INSERT INTO game_moves (game_id, player_id, from_row, from_col, to_row, to_col) VALUES ($1, $2, $3, $4, $5, $6)',
      [gameId, userId, from.row, from.col, to.row, to.col]
    );

    // Update game state in database
    // TODO: Implement proper game state update logic

    // Broadcast move to all players in the game room via WebSocket
    broadcastToGameRoom(gameId, {
      type: 'GAME_MOVE',
      data: { userId, from, to, gameId }
    });

    res.json({ success: true, move: { from, to } });
  } catch (err) {
    console.error('Erreur lors du mouvement:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Send chat message
app.post('/api/games/:gameId/chat', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId et message requis' });
    }

    // Verify user is part of the game or watching
    const game = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);

    if (game.rows.length === 0) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }

    // Record chat message
    const result = await pool.query(
      'INSERT INTO chat_messages (game_id, user_id, message) VALUES ($1, $2, $3) RETURNING id, created_at',
      [gameId, userId, message]
    );

    const chatMsg = result.rows[0];

    // Broadcast to all players in game room via WebSocket
    broadcastToGameRoom(gameId, {
      type: 'CHAT_MESSAGE',
      data: {
        gameId,
        userId,
        message,
        id: chatMsg.id,
        createdAt: chatMsg.created_at
      }
    });

    res.json({ success: true, messageId: chatMsg.id });
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== WEBSOCKET ====================

wss.on('connection', (ws, req) => {
  console.log('📱 Nouveau client WebSocket connecté');
  let userId = null;
  let isInLobby = false;
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
      if (userId && isRateLimited(userId)) {
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
          break;

        case 'LOBBY_JOIN':
          isInLobby = true;
          await handleLobbyJoin(ws, userId);
          break;

        case 'LOBBY_LEAVE':
          isInLobby = false;
          handleLobbyLeave(ws, userId);
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
      // Retirer du lobby si présent
      if (isInLobby && lobbyUsers.get(userId) === ws) {
        lobbyUsers.delete(userId);
        await updateUserStatus(userId, 'offline');
        broadcastToLobby({
          type: 'LOBBY_UPDATE',
          data: { users: await getUsersOnline() }
        });
      }

      // Retirer du game room si présent
      if (currentGameId && gameRooms.has(currentGameId)) {
        gameRooms.get(currentGameId).delete(ws);
        if (gameRooms.get(currentGameId).size === 0) {
          gameRooms.delete(currentGameId);
        }
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

// ==================== WEBSOCKET HANDLERS ====================

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
  // Add user to lobby (replace if already exists from another connection)
  lobbyUsers.set(userId, ws);

  const users = await getUsersOnline();

  ws.send(JSON.stringify({
    type: 'LOBBY_UPDATE',
    data: { users }
  }));

  // Broadcast to all other lobby users that a new user joined
  broadcastToLobby({
    type: 'USER_STATUS',
    data: { userId, status: 'online' }
  }, userId);
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

    broadcastToGameRoom(gameId, {
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
    // Add WebSocket to game room
    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, new Set());
    }
    gameRooms.get(gameId).add(ws);

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

    ws.send(JSON.stringify({
      type: 'GAME_STATE',
      data: gameStateToSend
    }));

    // Broadcast to other players in the game room
    broadcastToGameRoom(gameId, {
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

    broadcastToGameRoom(gameId, {
      type: 'VIEWER_COUNT_UPDATE',
      data: { gameId, count: viewerCount.rows[0].count }
    });
  } catch (err) {
    console.error('Erreur lors de la mise à jour des viewers:', err);
  }
}

// ==================== BROADCAST FUNCTIONS ====================

function broadcastToGameRoom(gameId, message, excludeWs = null) {
  const room = gameRooms.get(gameId);
  if (!room) return;

  room.forEach(ws => {
    if (excludeWs && ws === excludeWs) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

// ==================== HELPER FUNCTIONS ====================

function initializeBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) board[row][col] = BLACK;
        if (row > 4) board[row][col] = RED;
      }
    }
  }
  return board;
}

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🎮 Dame Projet - Server Started      ║
╠════════════════════════════════════════╣
║  HTTP: http://localhost:${PORT}
║  WebSocket: ws://localhost:${PORT}
║  PgAdmin: http://localhost:5050
║════════════════════════════════════════╝
  `);
});

module.exports = { app, wss };
