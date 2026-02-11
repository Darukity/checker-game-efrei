// ==================== GAMES ROUTES ====================

const express = require('express');
const router = express.Router();

const gameQueries = require('../db/queries/gameQueries');
const userQueries = require('../db/queries/userQueries');
const WebSocketManager = require('../websocket/manager');
const { initializeBoard } = require('../utils/gameUtils');

// Get user's games
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const games = await gameQueries.getGamesByUserId(userId);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create a new game
router.post('/', async (req, res) => {
  try {
    const { player1Id, player2Id } = req.body;

    if (!player1Id || !player2Id) {
      return res.status(400).json({ error: 'player1Id et player2Id requis' });
    }

    const game = await gameQueries.createGame(
      player1Id,
      player2Id,
      { board: initializeBoard() }
    );

    if (!game) {
      return res.status(500).json({ error: 'Erreur lors de la création du jeu' });
    }

    // Send invitation to player 2 via WebSocket
    const player2Conn = WebSocketManager.getUserConnection(parseInt(player2Id));

    if (player2Conn && player2Conn.ws.readyState === 1) { // WebSocket.OPEN
      player2Conn.ws.send(JSON.stringify({
        type: 'GAME_INVITATION',
        data: {
          fromUserId: player1Id,
          gameId: game.id
        }
      }));
    }

    res.status(201).json(game);
  } catch (err) {
    console.error('Erreur lors de la création du jeu:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Accept game invitation
router.post('/:gameId/accept', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId requis' });
    }

    const game = await gameQueries.acceptGameInvitation(gameId, userId);

    if (!game) {
      return res.status(404).json({ error: 'Partie non trouvée ou non autorisée' });
    }

    // Broadcast to both players
    const gameData = await gameQueries.getGameById(gameId);
    const player1Conn = WebSocketManager.getUserConnection(gameData.player1_id);
    const player2Conn = WebSocketManager.getUserConnection(gameData.player2_id);

    const message = JSON.stringify({
      type: 'GAME_ACCEPTED',
      data: { gameId: game.id }
    });

    if (player1Conn && player1Conn.ws.readyState === 1) {
      player1Conn.ws.send(message);
    }

    if (player2Conn && player2Conn.ws.readyState === 1) {
      player2Conn.ws.send(message);
    }

    res.json(game);
  } catch (err) {
    console.error('Erreur lors de l\'acceptation de l\'invitation:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Abandon a game
router.post('/:gameId/abandon', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId requis' });
    }

    const game = await gameQueries.getGameById(gameId);

    if (!game) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }

    // Verify user is part of the game
    if (game.player1_id !== userId && game.player2_id !== userId) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à abandonner cette partie' });
    }

    // Determine the winner
    const winnerId = game.player1_id === userId ? game.player2_id : game.player1_id;

    // Update game status
    const updatedGame = await gameQueries.updateGameStatus(gameId, 'finished', winnerId);

    // Notify both players via WebSocket
    const player1Conn = WebSocketManager.getUserConnection(game.player1_id);
    const player2Conn = WebSocketManager.getUserConnection(game.player2_id);

    const notificationMessage = JSON.stringify({
      type: 'GAME_ABANDONED',
      data: {
        gameId: game.id,
        abandonedByUserId: userId,
        winnerId: winnerId,
        message: 'Le joueur a abandonné. Vous avez gagné!'
      }
    });

    if (player1Conn && player1Conn.ws.readyState === 1) {
      player1Conn.ws.send(notificationMessage);
    }

    if (player2Conn && player2Conn.ws.readyState === 1) {
      player2Conn.ws.send(notificationMessage);
    }

    res.json({ success: true, game: updatedGame });
  } catch (err) {
    console.error('Erreur lors de l\'abandon:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Make a game move
router.post('/:gameId/move', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, from, to } = req.body;

    if (!userId || !from || !to) {
      return res.status(400).json({ error: 'userId, from et to requis' });
    }

    const game = await gameQueries.getGameById(gameId);

    if (!game) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }

    if (game.player1_id !== userId && game.player2_id !== userId) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à jouer dans cette partie' });
    }

    // Record the move
    await gameQueries.recordMove(gameId, userId, from, to);

    // Broadcast move to all players in the game room
    WebSocketManager.broadcastToGameRoom(gameId, {
      type: 'GAME_MOVE',
      data: { userId, from, to, gameId }
    });

    res.json({ success: true, move: { from, to } });
  } catch (err) {
    console.error('Erreur lors du mouvement:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Send a chat message
router.post('/:gameId/chat', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId et message requis' });
    }

    const game = await gameQueries.getGameById(gameId);

    if (!game) {
      return res.status(404).json({ error: 'Partie non trouvée' });
    }

    if (game.player1_id !== userId && game.player2_id !== userId) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à envoyer un message dans cette partie' });
    }

    // Get the username of the sender
    const user = await userQueries.getUserById(userId);

    // Broadcast message to all players in the game room
    WebSocketManager.broadcastToGameRoom(gameId, {
      type: 'CHAT_MESSAGE',
      data: { userId, message, username: user?.username }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
