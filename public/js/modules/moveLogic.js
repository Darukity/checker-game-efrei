// ==================== MOVE LOGIC MODULE ====================

import { BOARD_SIZE, gameState, applyMove, clearSelection } from './gameState.js';
import { renderBoard, updateGameStatus } from './boardRenderer.js';

function calculateValidMoves(row, col) {
    const moves = [];
    const piece = gameState.board[row][col];

    if (!piece) return moves;

    // Mouvements simples
    const directions = piece === 1 ?
        [[row + 1, col - 1], [row + 1, col + 1]] : // pion va vers le bas
        [[row - 1, col - 1], [row - 1, col + 1]]; // pion va vers le haut

    directions.forEach(([newRow, newCol]) => {
        if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
            if (gameState.board[newRow][newCol] === 0) {
                moves.push({ row: newRow, col: newCol });
            }
        }
    });

    return moves;
}

function handleSquareClick(row, col) {
    // Prevent any interaction while loading or if game is not in progress
    if (gameState.isLoading) {
        console.log('⏳ Game is still loading, ignoring click');
        return;
    }
    
    if (!gameState.isPlayerTurn || gameState.gameStatus !== 'in_progress') {
        return;
    }

    // Si une case est déjà sélectionnée
    if (gameState.selectedSquare) {
        // Vérifier si c'est un mouvement valide
        if (gameState.validMoves.some(m => m.row === row && m.col === col)) {
            makeMove(gameState.selectedSquare, { row, col });
            clearSelection();
        } else if (gameState.board[row][col] === gameState.playerColor) {
            // Sélectionner un autre pion
            gameState.selectedSquare = { row, col };
            gameState.validMoves = calculateValidMoves(row, col);
        }
    } else {
        // Sélectionner un pion
        if (gameState.board[row][col] === gameState.playerColor) {
            gameState.selectedSquare = { row, col };
            gameState.validMoves = calculateValidMoves(row, col);
        }
    }

    renderBoard(handleSquareClick);
}

function makeMove(from, to) {
    // Save board state before optimistic update (for potential rollback)
    const previousBoard = JSON.parse(JSON.stringify(gameState.board));
    
    // Apply move locally (optimistic update)
    applyMove(from, to);
    renderBoard(handleSquareClick);

    // Send move to server via POST request
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
    .then(res => {
        if (!res.ok) {
            return res.json().then(err => {
                throw new Error(err.error || 'Mouvement invalide');
            });
        }
        return res.json();
    })
    .then((data) => {
        // Move validated by server
        // Update board from server response to ensure consistency
        if (data.board) {
            gameState.board = data.board;
        }
        // Server will broadcast to other players via WebSocket
        gameState.isPlayerTurn = false;
        renderBoard(handleSquareClick);
        updateGameStatus();
    })
    .catch(err => {
        console.error('Erreur lors du mouvement:', err);
        // Revert to previous board state if server rejected the move
        gameState.board = previousBoard;
        alert(err.message || 'Mouvement invalide');
        renderBoard(handleSquareClick);
        updateGameStatus();
    });
}

export {
    calculateValidMoves,
    handleSquareClick,
    makeMove
};
