// ==================== MAIN SERVER FILE ====================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

// Load environment variables
require('dotenv').config();

// Imports
const { PORT } = require('./config/constants');
const pool = require('./db/pool');

// Routes
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const gamesRoutes = require('./routes/games');

// WebSocket
const WebSocketHandlers = require('./websocket/handlers');

// ==================== EXPRESS SETUP ====================

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '8kb' }));
app.use(express.static('public'));

// ==================== HTTP ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Mount route handlers
app.use('/api/auth', authRoutes);
app.use('/api/user', usersRoutes);
app.use('/api/games', gamesRoutes);

// ==================== WEBSOCKET SETUP ====================

wss.on('connection', (ws) => {
  console.log('📱 Nouveau client WebSocket connecté');

  // Handle incoming messages
  ws.on('message', (data) => {
    WebSocketHandlers.handleMessage(ws, data);
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log(`👋 Client déconnecté (userId: ${ws.userId})`);
    WebSocketHandlers.handleDisconnect(ws);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('❌ Erreur WebSocket:', error);
  });
});

// ==================== 404 HANDLER ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// ==================== ERROR HANDLER ====================

app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).json({ error: 'Erreur serveur' });
});

// ==================== SERVER START ====================

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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM reçu, arrêt du serveur...');
  server.close(() => {
    console.log('Serveur arrêté');
    pool.end();
    process.exit(0);
  });
});

module.exports = { app, server, wss };
