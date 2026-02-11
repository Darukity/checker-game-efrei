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
const gameRooms = new Map(); // gameId -> Set of userIds
const lobbyConnections = new Set(); // WebSockets connectés au lobby

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

function broadcastToLobby(message) {
  lobbyConnections.forEach(ws => {
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

    if (!player1Id) {
      return res.status(400).json({ error: 'player1Id requis' });
    }

    const result = await pool.query(
      `INSERT INTO games (player1_id, player2_id, game_state, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [player1Id, player2Id || null, JSON.stringify({ board: initializeBoard() }), player2Id ? 'in_progress' : 'waiting_for_opponent']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur lors de la création du jeu:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== WEBSOCKET ====================

wss.on('connection', (ws, req) => {
  console.log('📱 Nouveau client WebSocket connecté');
  let userId = null;
  let isInLobby = false;
  let isInGame = null;

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

        userId = decoded.userId;
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
          await handleAuth(ws, msgData);
          break;

        case 'LOBBY_JOIN':
          await handleLobbyJoin(ws, userId);
          break;

        case 'LOBBY_LEAVE':
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
          await handleGameJoin(ws, userId, msgData);
          break;

        case 'INVITE_GAME':
          await handleInviteGame(ws, userId, msgData);
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
      await updateUserStatus(userId, 'offline');
      userConnections.delete(userId);
      if (isInLobby) {
        lobbyConnections.delete(ws);
      }
      broadcastToLobby({
        type: 'LOBBY_UPDATE',
        data: { users: await getUsersOnline() }
      });
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
  await updateUserStatus(userId, 'online');

  if (!userConnections.has(userId)) {
    userConnections.set(userId, {
      ws,
      status: 'online',
      lastMessageTime: Date.now(),
      messageCount: 0
    });
  }

  ws.send(JSON.stringify({
    type: 'AUTH_SUCCESS',
    data: { userId, message: 'Authentification réussie' }
  }));
}

async function handleLobbyJoin(ws, userId) {
  lobbyConnections.add(ws);

  const users = await getUsersOnline();

  ws.send(JSON.stringify({
    type: 'LOBBY_UPDATE',
    data: { users }
  }));

  broadcastToLobby({
    type: 'USER_STATUS',
    data: { userId, status: 'online' }
  });
}

function handleLobbyLeave(ws, userId) {
  lobbyConnections.delete(ws);
}

async function handleGameMove(ws, userId, data) {
  const { gameId, from, to } = data;

  if (!gameId || !from || !to) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Paramètres invalides' }
    }));
    return;
  }

  try {
    // Vérifier que l'utilisateur fait partie de la partie
    const game = await pool.query('SELECT player1_id, player2_id FROM games WHERE id = $1', [gameId]);

    if (game.rows.length === 0) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Partie non trouvée' }
      }));
      return;
    }

    const gameRow = game.rows[0];
    if (gameRow.player1_id !== userId && gameRow.player2_id !== userId) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Vous n\'êtes pas autorisé à jouer dans cette partie' }
      }));
      return;
    }

    // Enregistrer le mouvement
    await pool.query(
      'INSERT INTO game_moves (game_id, player_id, from_row, from_col, to_row, to_col) VALUES ($1, $2, $3, $4, $5, $6)',
      [gameId, userId, from.row, from.col, to.row, to.col]
    );

    // Broadcaster à tous les clients dans cette partie
    broadcastToGameRoom(gameId, {
      type: 'GAME_MOVE',
      data: { userId, from, to, gameId }
    });
  } catch (err) {
    console.error('Erreur lors du mouvement:', err);
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Erreur lors du mouvement' }
    }));
  }
}

async function handleChatMessage(ws, userId, data) {
  const { gameId, message } = data;

  if (!gameId || !message) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Paramètres invalides' }
    }));
    return;
  }

  try {
    const result = await pool.query(
      'INSERT INTO chat_messages (game_id, user_id, message) VALUES ($1, $2, $3) RETURNING id, created_at',
      [gameId, userId, message]
    );

    const chatMsg = result.rows[0];

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
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message:', err);
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Erreur lors de l\'envoi du message' }
    }));
  }
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
    // Ajouter l'utilisateur à la room du jeu
    if (!gameRooms.has(gameId)) {
      gameRooms.set(gameId, new Set());
    }
    gameRooms.get(gameId).add(userId);

    // Récupérer l'état du jeu
    const game = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);

    if (game.rows.length === 0) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        data: { message: 'Partie non trouvée' }
      }));
      return;
    }

    ws.send(JSON.stringify({
      type: 'GAME_STATE',
      data: game.rows[0]
    }));

    broadcastToGameRoom(gameId, {
      type: 'PLAYER_JOINED',
      data: { userId, gameId }
    }, userId);
  } catch (err) {
    console.error('Erreur lors de la connexion au jeu:', err);
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Erreur lors de la connexion au jeu' }
    }));
  }
}

async function handleInviteGame(ws, userId, data) {
  const { toUserId, gameId } = data;

  if (!toUserId || !gameId) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Paramètres invalides' }
    }));
    return;
  }

  try {
    await pool.query(
      'INSERT INTO game_invitations (from_user_id, to_user_id, game_id) VALUES ($1, $2, $3)',
      [userId, toUserId, gameId]
    );

    // Envoyer l'invitation si l'utilisateur est connecté
    const targetConn = userConnections.get(toUserId);
    if (targetConn && targetConn.ws.readyState === WebSocket.OPEN) {
      targetConn.ws.send(JSON.stringify({
        type: 'GAME_INVITATION',
        data: { fromUserId: userId, gameId }
      }));
    }

    ws.send(JSON.stringify({
      type: 'INVITE_SENT',
      data: { toUserId, gameId }
    }));
  } catch (err) {
    console.error('Erreur lors de l\'invitation:', err);
    ws.send(JSON.stringify({
      type: 'ERROR',
      data: { message: 'Erreur lors de l\'invitation' }
    }));
  }
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

function broadcastToGameRoom(gameId, message, excludeUserId = null) {
  const room = gameRooms.get(gameId);
  if (!room) return;

  room.forEach(uid => {
    if (excludeUserId && uid === excludeUserId) return;
    const conn = userConnections.get(uid);
    if (conn && conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  });
}

// ==================== HELPER FUNCTIONS ====================

function initializeBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(0));

  // Place les pions noirs en haut (joueur 1)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 0) {
        board[row][col] = 1; // pion joueur 1
      }
    }
  }

  // Place les pions blancs en bas (joueur 2)
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 0) {
        board[row][col] = 2; // pion joueur 2
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
