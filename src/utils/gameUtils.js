// ==================== GAME UTILITIES ====================

const EMPTY = 0;
const BLACK = 1;
const RED = 2;
const BLACKKING = 3;
const REDKING = 4;

function initializeBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) board[row][col] = BLACK;
        if (row > 4) board[row][col] = RED;
      }
    }
  }
  return board;
}

module.exports = {
  EMPTY,
  BLACK,
  RED,
  BLACKKING,
  REDKING,
  initializeBoard
};
