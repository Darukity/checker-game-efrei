const WebSocket = require('ws');

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

function broadcastToLobby(lobbyUsers, message, excludeUserId = null) {
  lobbyUsers.forEach((ws, userId) => {
    if (excludeUserId && userId === excludeUserId) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

function broadcastToGameRoom(gameRooms, gameId, message, excludeWs = null) {
  const room = gameRooms.get(gameId);
  if (!room) return;

  room.forEach(ws => {
    if (excludeWs && ws === excludeWs) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

module.exports = {
  initializeBoard,
  broadcastToLobby,
  broadcastToGameRoom
};
