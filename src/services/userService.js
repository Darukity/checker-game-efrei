const pool = require('../db/pool');

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

module.exports = {
  getUsersOnline,
  updateUserStatus
};
