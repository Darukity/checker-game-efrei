// ==================== USER QUERIES ====================

const pool = require('../pool');

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

async function getUserById(userId) {
  try {
    const result = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  } catch (err) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', err);
    return null;
  }
}

async function checkUserExists(username, email) {
  try {
    const result = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    return result.rows.length > 0;
  } catch (err) {
    console.error('Erreur lors de la vérification de l\'utilisateur:', err);
    return false;
  }
}

async function createUser(username, email, hashedPassword) {
  try {
    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Erreur lors de la création de l\'utilisateur:', err);
    return null;
  }
}

async function getUserByUsername(username) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
  } catch (err) {
    console.error('Erreur lors de la récupération de l\'utilisateur:', err);
    return null;
  }
}

module.exports = {
  getUsersOnline,
  updateUserStatus,
  getUserById,
  checkUserExists,
  createUser,
  getUserByUsername
};
