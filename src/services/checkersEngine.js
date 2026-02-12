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

function isOpponentPiece(piece, playerColor) {
  if (!piece) return false;
  return !isPlayerPiece(piece, playerColor);
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
  const gameState = gameData.game_state;
  const { board, currentTurn } = gameState;
  const { player1_id } = gameData;

  const playerColor = player1_id === playerId ? 1 : 2;

  // 🔹 Validation: C'est le tour du joueur?
  if (currentTurn !== playerColor)
    return { success: false, error: "Ce n'est pas votre tour" };

  // 🔹 Validation: Position valide?
  if (!isInsideBoard(from.row, from.col) || !isInsideBoard(to.row, to.col))
    return { success: false, error: "Position invalide" };

  const piece = board[from.row][from.col];

  // 🔹 Validation: Pièce valide?
  if (!isPlayerPiece(piece, playerColor))
    return { success: false, error: "Piece invalide" };

  const mustCapture = playerHasCapture(board, playerColor);
  const captures = getCaptures(board, from.row, from.col, playerColor);

  // 🔥 CAPTURE OBLIGATOIRE
  if (mustCapture && captures.length === 0)
    return { success: false, error: "Capture obligatoire" };

  let isValid = false;

  if (captures.length > 0) {
    isValid = captures.some(
      c => c.to.row === to.row && c.to.col === to.col
    );
  } else {
    const directions = getDirections(piece);
    for (const [dr, dc] of directions) {
      if (from.row + dr === to.row && from.col + dc === to.col) {
        if (board[to.row][to.col] === 0) isValid = true;
      }
    }
  }

  // 🔹 Validation: Mouvement valide?
  if (!isValid)
    return { success: false, error: "Mouvement invalide" };

  // 🔥 Appliquer le mouvement
  applyMoveWithMultiCapture(board, from, to, playerColor);

  // 🔍 Vérifier la victoire
  const winner = checkVictory(board);

  if (winner) {
    console.log(`Player ${winner} wins!`);
    gameState.status = "finished";
    gameState.winner = winner;
    return { success: true, gameData, winner };
  } else {
    gameState.currentTurn = playerColor === 1 ? 2 : 1;
    console.log(`Turn switched. Next player: ${gameState.currentTurn}`);
    return { success: true, gameData };
  }
}

function getCaptures(board, row, col, playerColor) {
  const piece = board[row][col];
  const directions = getDirections(piece);
  const captures = [];

  for (const [dr, dc] of directions) {
    const midRow = row + dr;
    const midCol = col + dc;
    const jumpRow = row + dr * 2;
    const jumpCol = col + dc * 2;

    if (
      isInsideBoard(jumpRow, jumpCol) &&
      isOpponentPiece(board[midRow][midCol], playerColor) &&
      board[jumpRow][jumpCol] === 0
    ) {
      captures.push({
        to: { row: jumpRow, col: jumpCol },
        captured: { row: midRow, col: midCol }
      });
    }
  }

  return captures;
}

function playerHasCapture(board, playerColor) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (isPlayerPiece(board[r][c], playerColor)) {
        if (getCaptures(board, r, c, playerColor).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function applyMoveWithMultiCapture(board, from, to, playerColor) {
  const piece = board[from.row][from.col];
  board[to.row][to.col] = piece;
  board[from.row][from.col] = 0;

  // Si capture
  if (Math.abs(to.row - from.row) === 2) {
    const capturedRow = (from.row + to.row) / 2;
    const capturedCol = (from.col + to.col) / 2;
    board[capturedRow][capturedCol] = 0;

    // 🔥 MULTI SAUT AUTOMATIQUE
    let nextCaptures = getCaptures(board, to.row, to.col, playerColor);

    while (nextCaptures.length > 0) {
      const next = nextCaptures[0]; // prend la première capture possible
      const newFrom = { row: to.row, col: to.col };
      const newTo = next.to;

      board[newTo.row][newTo.col] = board[newFrom.row][newFrom.col];
      board[newFrom.row][newFrom.col] = 0;
      board[next.captured.row][next.captured.col] = 0;

      to = newTo;
      nextCaptures = getCaptures(board, to.row, to.col, playerColor);
    }
  }

  // Promotion
  if (piece === 1 && to.row === BOARD_SIZE - 1)
    board[to.row][to.col] = 3;
  if (piece === 2 && to.row === 0)
    board[to.row][to.col] = 4;

  return board;
}

function checkVictory(board) {
  let player1Pieces = 0;
  let player2Pieces = 0;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 1 || board[r][c] === 3) player1Pieces++;
      if (board[r][c] === 2 || board[r][c] === 4) player2Pieces++;
    }
  }
  console.log(`Player 1 pieces: ${player1Pieces}, Player 2 pieces: ${player2Pieces}`);

  if (player1Pieces === 0) return 2;
  if (player2Pieces === 0) return 1;

  return null;
}

module.exports = {
  calculateValidMoves,
  applyMove,
  validateAndApplyMove,
  isPlayerPiece,
  isInsideBoard,
  playerHasCapture,
  getCaptures,
  applyMoveWithMultiCapture,
  checkVictory
};
