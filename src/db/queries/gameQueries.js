// ==================== GAME QUERIES ====================

const pool = require('../pool');

async function getGamesByUserId(userId) {
  try {
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
    return result.rows;
  } catch (err) {
    console.error('Erreur lors de la récupération des jeux:', err);
    return [];
  }
}

async function createGame(player1Id, player2Id, gameState) {
  try {
    const result = await pool.query(
      `INSERT INTO games (player1_id, player2_id, game_state, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [player1Id, player2Id, gameState, 'waiting_for_opponent']
    );
    return result.rows[0];
  } catch (err) {
    console.error('Erreur lors de la création du jeu:', err);
    return null;
  }
}

async function getGameById(gameId) {
  try {
    const result = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
    return result.rows[0] || null;
  } catch (err) {
    console.error('Erreur lors de la récupération du jeu:', err);
    return null;
  }
}

async function updateGameStatus(gameId, status, winnerId = null) {
  try {
    const query = winnerId
      ? 'UPDATE games SET status = $1, ended_at = CURRENT_TIMESTAMP, winner_id = $2 WHERE id = $3 RETURNING *'
      : 'UPDATE games SET status = $1, started_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    
    const params = winnerId ? [status, winnerId, gameId] : [status, gameId];
    const result = await pool.query(query, params);
    return result.rows[0];
  } catch (err) {
    console.error('Erreur lors de la mise à jour du jeu:', err);
    return null;
  }
}

async function acceptGameInvitation(gameId, userId) {
  try {
    const result = await pool.query(
      `UPDATE games 
       SET status = 'in_progress', started_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND player2_id = $2
       RETURNING *`,
      [gameId, userId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('Erreur lors de l\'acceptation de l\'invitation:', err);
    return null;
  }
}

async function recordMove(gameId, userId, from, to) {
  try {
    await pool.query(
      'INSERT INTO game_moves (game_id, player_id, from_row, from_col, to_row, to_col) VALUES ($1, $2, $3, $4, $5, $6)',
      [gameId, userId, from.row, from.col, to.row, to.col]
    );
    return true;
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement du mouvement:', err);
    return false;
  }
}

module.exports = {
  getGamesByUserId,
  createGame,
  getGameById,
  updateGameStatus,
  acceptGameInvitation,
  recordMove
};
