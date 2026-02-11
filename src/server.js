const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

// Import routes and websocket setup
const { router: apiRouter, setSharedData: setApiSharedData } = require('./routes/api');
const { setupWebSocket } = require('./websocket/connection');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '8kb' })); // Limite de 8KB pour sécurité
app.use(express.static('public'));

// ==================== DATA STRUCTURES ====================
const userConnections = new Map(); // userId -> { ws, status, lastMessageTime, messageCount }
const gameRooms = new Map(); // gameId -> Set of WebSocket connections
const lobbyUsers = new Map(); // userId -> WebSocket for lobby

// ==================== ROUTES ====================
// Share data structures with routes
setApiSharedData(userConnections, gameRooms);

// Mount API routes
app.use('/api', apiRouter);


// ==================== WEBSOCKET ====================
setupWebSocket(wss, userConnections, gameRooms, lobbyUsers);

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

