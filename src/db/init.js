const { Pool, Client } = require('pg');
require('dotenv').config();

const initDb = async () => {
  let adminClient = null;
  let tablePool = null;

  try {
    console.log('🔧 Initialisation de la base de données...');

    // Connexion à la base 'postgres' pour créer 'dame_db'
    // Utiliser une connexion simple d'abord
    const connectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/postgres`;
    adminClient = new Client({
      connectionString
    });

    console.log('📌 Création de la base de données si elle n\'existe pas...');

    await adminClient.connect();

    try {
      await adminClient.query(`CREATE DATABASE ${process.env.DB_NAME}`);
      console.log('✅ Base de données créée');
    } catch (err) {
      if (err.code === '42P04') {
        // La base existe déjà
        console.log('ℹ️  Base de données déjà existante');
      } else {
        throw err;
      }
    }

    await adminClient.end();

    // Connexion à la base 'dame_db' pour créer les tables
    tablePool = new Pool({
      connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
    });

    console.log('📌 Création des tables...');

    // Créer les tables
    await tablePool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        online_status VARCHAR(20) DEFAULT 'offline'
      );

      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        player1_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        player2_id INT REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        winner_id INT REFERENCES users(id) ON DELETE SET NULL,
        game_state JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'waiting_for_opponent'
      );

      CREATE TABLE IF NOT EXISTS game_moves (
        id SERIAL PRIMARY KEY,
        game_id INT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        player_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        from_row INT NOT NULL,
        from_col INT NOT NULL,
        to_row INT NOT NULL,
        to_col INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        game_id INT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_viewers (
        id SERIAL PRIMARY KEY,
        game_id INT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS game_invitations (
        id SERIAL PRIMARY KEY,
        from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id INT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending'
      );

      CREATE INDEX IF NOT EXISTS idx_games_player1 ON games(player1_id);
      CREATE INDEX IF NOT EXISTS idx_games_player2 ON games(player2_id);
      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
      CREATE INDEX IF NOT EXISTS idx_chat_game ON chat_messages(game_id);
      CREATE INDEX IF NOT EXISTS idx_viewers_game ON game_viewers(game_id);
    `);

    console.log('✅ Base de données initialisée avec succès!');
    await tablePool.end();
  } catch (err) {
    console.error('❌ Erreur lors de l\'initialisation:', err.message);
    if (tablePool) await tablePool.end();
    process.exit(1);
  }
};

initDb();
