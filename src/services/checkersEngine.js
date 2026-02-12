const BOARD_SIZE = 8;

function isInsideBoard(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isPlayerPiece(piece, playerColor) {
  // playerColor 1 has pieces 1 (pion) and 3 (dame)
  // playerColor 2 has pieces 2 (pion) and 4 (dame)
  if (playerColor === 1) return piece === 1 || piece === 3;
  if (playerColor === 2) return piece === 2 || piece === 4;
  return false;
}

function getDirections(piece) {
  // Piece types: 1 = pion player1, 2 = pion player2, 3 = dame player1, 4 = dame player2
  if (piece === 1) return [[1, -1], [1, 1]]; // pion player1 goes down
  if (piece === 2) return [[-1, -1], [-1, 1]]; // pion player2 goes up
  if (piece === 3 || piece === 4) {
    // Dames can go in 4 directions
    return [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  }
  return [];
}

function calculateValidMoves(board, row, col, playerColor) {
  const moves = [];
  const piece = board[row][col];

  if (!piece || !isPlayerPiece(piece, playerColor)) return moves;

  const directions = getDirections(piece);

  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;

    // 🔹 Mouvement simple
    if (isInsideBoard(newRow, newCol) && board[newRow][newCol] === 0) {
        moves.push({ row: newRow, col: newCol });
    }

    // 🔥 Capture
    const jumpRow = row + dr * 2;
    const jumpCol = col + dc * 2;

    if (
        isInsideBoard(jumpRow, jumpCol) &&
        board[newRow][newCol] !== 0 &&
        !isPlayerPiece(board[newRow][newCol], playerColor) &&
        board[jumpRow][jumpCol] === 0
    ) {
        moves.push({
        row: jumpRow,
        col: jumpCol,
        capture: { row: newRow, col: newCol }
        });
    }
    }

  return moves;
}

function applyMove(board, from, to) {
  const piece = board[from.row][from.col];
  
  if (!piece) {
    throw new Error('Pas de piece a deplacer');
  }
  
  board[to.row][to.col] = piece;
  board[from.row][from.col] = 0;

  if (Math.abs(to.row - from.row) === 2) {
    const capturedRow = (from.row + to.row) / 2;
    const capturedCol = (from.col + to.col) / 2;
    board[capturedRow][capturedCol] = 0;
  }

  // Promotion to dame
  if (piece === 1 && to.row === BOARD_SIZE - 1) {
    board[to.row][to.col] = 3; // pion player1 becomes dame
  }
  if (piece === 2 && to.row === 0) {
    board[to.row][to.col] = 4; // pion player2 becomes dame
  }

  return board;
}

function validateAndApplyMove(gameData, playerId, from, to) {
  // Validate input
  if (!gameData || !gameData.game_state) {
    throw new Error('Donnees de jeu invalides');
  }
  
  const gameState = gameData.game_state;
  const { board, currentTurn } = gameState;
  const { player1_id } = gameData;

  const playerColor = player1_id === playerId ? 1 : 2;

  // Verify it's player's turn
  if (currentTurn !== playerColor) {
    throw new Error("Ce n'est pas votre tour");
  }

  // Verify valid positions
  if (!from || !to || from.row === undefined || from.col === undefined || to.row === undefined || to.col === undefined) {
    throw new Error("Positions invalides");
  }

  // Verify position is on board
  if (!isInsideBoard(from.row, from.col) || !isInsideBoard(to.row, to.col)) {
    throw new Error("Position en dehors du plateau");
  }

  // Verify piece belongs to player
  const piece = board[from.row][from.col];
  if (!isPlayerPiece(piece, playerColor)) {
    throw new Error("Piece invalide");
  }

  // Verify valid move
  const validMoves = calculateValidMoves(board, from.row, from.col, playerColor);
  const isValid = validMoves.some(m => m.row === to.row && m.col === to.col);

  if (!isValid) {
    throw new Error("Mouvement invalide");
  }

  // Apply move (modifies board in-place)
  applyMove(board, from, to);

  // Change turn
  gameState.currentTurn = playerColor === 1 ? 2 : 1;

  return gameData;
}

module.exports = {
  calculateValidMoves,
  applyMove,
  validateAndApplyMove,
  isPlayerPiece,
  isInsideBoard
};
