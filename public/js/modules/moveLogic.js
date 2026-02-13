// ==================== MOVE LOGIC MODULE ====================

import { BOARD_SIZE, gameState, clearSelection } from './gameState.js';
import { renderBoard, updateGameStatus } from './boardRenderer.js';

function handleSquareClick(row, col) {
    // First check: block spectators
    if (gameState.isSpectator) {
        // console.log('Spectateur - impossible de jouer');
        return;
    }
    
    // Second check: ensure user has a valid player color (is actually a player)
    if (gameState.playerColor === null || gameState.playerColor === undefined) {
        // console.log('Pas un joueur - impossible de jouer');
        return;
    }
    
    // Third check: ensure it's the player's turn and game is in progress
    if (!gameState.isPlayerTurn || gameState.gameStatus !== 'in_progress') {
        return;
    }

  // Si une case est déjà sélectionnée
  if (gameState.selectedSquare) {
    // Vérifier si c'est un mouvement valide (destinataire vide)
    const targetPiece = gameState.board[row][col];
    
    if (targetPiece === 0) {
      // Case vide - envoyer le mouvement
      makeMove(gameState.selectedSquare, { row, col });
      clearSelection();
    } else if (targetPiece === gameState.playerColor || targetPiece === gameState.playerColor + 2) {
      // Sélectionner un autre pion de notre couleur
      gameState.selectedSquare = { row, col };
    }
  } else {
    // Sélectionner un pion
    const piece = gameState.board[row][col];
    if (piece === gameState.playerColor || piece === gameState.playerColor + 2) {
      gameState.selectedSquare = { row, col };
    }
  }

  renderBoard(handleSquareClick);
}

function makeMove(from, to) {
  // console.log(`🎯 Making move - from: (${from.row},${from.col}) to: (${to.row},${to.col})`);
  // console.log(`📊 Current state - playerColor: ${gameState.playerColor}, currentTurn: ${gameState.currentTurn}, isPlayerTurn: ${gameState.isPlayerTurn}`);
  
  // Send move to server via POST request (no local optimistic update)
  fetch(`/api/games/${gameState.gameId}/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      userId: gameState.currentPlayerId,
      from: { row: from.row, col: from.col },
      to: { row: to.row, col: to.col }
    })
  })
  .then(async res => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body && body.error ? body.error : 'Mouvement invalide';
      throw new Error(msg);
    }
    return body;
  })
  .then(() => {
    // Move validated by server, wait for GAME_STATE via WebSocket
    // console.log('Mouvement envoye au serveur, en attente de confirmation');
  })
  .catch(err => {
    console.error('Erreur lors du mouvement:', err);
    // Don't show an alert to the user; log instead and re-render
    // console.log('Mouvement invalide:', err.message);
    renderBoard(handleSquareClick);
    updateGameStatus();
  });
}

export {
  handleSquareClick,
  makeMove
};
