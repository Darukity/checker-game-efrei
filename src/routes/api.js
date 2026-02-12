const express = require('express');
const bcryptjs = require('bcryptjs');
const WebSocket = require('ws');
const pool = require('../db/pool');
const { verifyToken, generateToken } = require('../utils/auth');
const { getUsersOnline } = require('../services/userService');
const { initializeBoard, broadcastToGameRoom } = require('../utils/game');
const { validateAndApplyMove } = require('../services/checkersEngine');


const router = express.Router();

// This will be set by server.js
let userConnections = null;
let gameRooms = null;

function setSharedData(connections, rooms) {
  userConnections = connections;
  gameRooms = rooms;
}

// Endpoint de santé
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Register
router.post('/register', async (req, res) => {
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
router.post('/login', async (req, res) => {
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
router.post('/verify', (req, res) => {
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
router.get('/user/:userId', async (req, res) => {
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
router.get('/users/online', async (req, res) => {
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
router.get('/games/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(`
      SELECT 
        g.id, g.status, g.created_at, g.started_at, g.ended_at,
        g.winner_id,
        u1.username as player1_username,
        u2.username as player2_username,
        u_winner.username as winner_username,
        (SELECT COUNT(*) FROM game_viewers WHERE game_id = g.id) as viewer_count
      FROM games g
      LEFT JOIN users u1 ON g.player1_id = u1.id
      LEFT JOIN users u2 ON g.player2_id = u2.id
      LEFT JOIN users u_winner ON g.winner_id = u_winner.id
      WHERE g.player1_id = $1 OR g.player2_id = $1
      ORDER BY g.created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create a new game
router.post('/games', async (req, res) => {
  try {
    const { player1Id, player2Id } = req.body;

    if (!player1Id || !player2Id) {
      return res.status(400).json({ error: 'player1Id et player2Id requis' });
    }

    const result = await pool.query(
      `INSERT INTO games (player1_id, player2_id, game_state, current_turn, status) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [player1Id, player2Id, { board: initializeBoard(), currentTurn: null }, null, 'waiting_for_opponent']
    ); //HERE

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
router.post('/games/:gameId/accept', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId requis' });
    }

    // Update game status to in_progress, set current_turn to 1 (player1 starts), and update game_state JSONB
    const result = await pool.query(
      `UPDATE games 
       SET status = 'in_progress', 
           current_turn = 1, 
           game_state = jsonb_set(game_state, '{currentTurn}', '1'),
           started_at = CURRENT_TIMESTAMP 
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
router.post('/games/:gameId/abandon', async (req, res) => {
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

// Spectateur
router.get('/games', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        g.id,
        g.status,
        g.created_at,
        g.started_at,
        u1.username as player1_username,
        u2.username as player2_username,
        (SELECT COUNT(*) FROM game_viewers WHERE game_id = g.id) as viewer_count
      FROM games g
      LEFT JOIN users u1 ON g.player1_id = u1.id
      LEFT JOIN users u2 ON g.player2_id = u2.id
      WHERE g.status = 'in_progress'
      ORDER BY g.started_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Erreur récupération parties en cours:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/games/:gameId/move', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, from, to } = req.body;

    if (!userId || !from || !to) {
      return res.status(400).json({ error: 'userId, from et to requis' });
    }

    // 1. Load game from DB
    const gameResult = await pool.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Partie non trouvee' });
    }

    const gameData = gameResult.rows[0];

    // 2. Verify user is part of the game
    if (gameData.player1_id !== userId && gameData.player2_id !== userId) {
      return res.status(403).json({ error: 'Vous n\'etes pas autorise a jouer dans cette partie' });
    }

    // 3. Validate and apply move (server-side authoritative)
    const moveResult = validateAndApplyMove(gameData, userId, from, to);

    if (!moveResult.success) {
      return res.status(400).json({ error: moveResult.error });
    }

    // 4-5. Persist updated game_state and current_turn and record move in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const newCurrentTurn = (gameData.game_state && gameData.game_state.currentTurn) ? gameData.game_state.currentTurn : null;

      let updateRes;

      // 🏆 Si victoire détectée, mettre à jour le statut et le gagnant
      if (moveResult.winner) {
        const winnerId = moveResult.winner === 1 ? gameData.player1_id : gameData.player2_id;
        updateRes = await client.query(
          `UPDATE games 
           SET game_state = $1, current_turn = $2, status = 'finished', ended_at = CURRENT_TIMESTAMP, winner_id = $3
           WHERE id = $4 
           RETURNING *`,
          [gameData.game_state, newCurrentTurn, winnerId, gameId]
        );
      } else {
        updateRes = await client.query(
          `UPDATE games 
           SET game_state = $1, current_turn = $2
           WHERE id = $3 
           RETURNING *`,
          [gameData.game_state, newCurrentTurn, gameId]
        );
      }

      await client.query(
        'INSERT INTO game_moves (game_id, player_id, from_row, from_col, to_row, to_col) VALUES ($1, $2, $3, $4, $5, $6)',
        [gameId, userId, from.row, from.col, to.row, to.col]
      );

      await client.query('COMMIT');

      const updatedGame = updateRes.rows[0];

      // 6. Broadcast full GAME_STATE (use updated row so current_turn is present)
      broadcastToGameRoom(gameRooms, gameId, {
        type: 'GAME_STATE',
        data: updatedGame
      });

      res.json({ success: true, move: { from, to }, game: updatedGame });
    } catch (dbErr) {
      await client.query('ROLLBACK');
      console.error('Erreur lors de la sauvegarde du mouvement:', dbErr);
      res.status(500).json({ error: 'Erreur serveur' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Erreur lors du mouvement:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Send chat message
router.post('/games/:gameId/chat', async (req, res) => {
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
    broadcastToGameRoom(gameRooms, gameId, {
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

module.exports = { router, setSharedData };
