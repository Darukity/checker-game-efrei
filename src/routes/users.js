// ==================== USERS ROUTES ====================

const express = require('express');
const router = express.Router();

const userQueries = require('../db/queries/userQueries');

// Get current user info
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userQueries.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get all online users
router.get('/online', async (req, res) => {
  try {
    const users = await userQueries.getUsersOnline();
    res.json(users);
  } catch (err) {
    console.error('Erreur lors de la récupération des utilisateurs:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
