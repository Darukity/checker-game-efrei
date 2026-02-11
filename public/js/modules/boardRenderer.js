// ==================== BOARD RENDERER MODULE ====================

import { BOARD_SIZE, gameState } from './gameState.js';

function renderBoard(handleSquareClick) {
    const board = document.getElementById('gameBoard');
    if (!board) {
        console.error('gameBoard element not found');
        return;
    }
    
    // Ensure gameState.board is initialized
    if (!gameState.board || !Array.isArray(gameState.board) || gameState.board.length === 0) {
        console.warn('Board not initialized');
        return;
    }
    
    // Add or remove loading class based on state
    if (gameState.isLoading) {
        board.classList.add('loading');
    } else {
        board.classList.remove('loading');
    }
    
    board.innerHTML = '';

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const square = createSquare(row, col, handleSquareClick);
            board.appendChild(square);
        }
    }
}

function createSquare(row, col, handleSquareClick) {
    const square = document.createElement('div');
    const isBlack = (row + col) % 2 === 1;
    const piece = gameState.board[row]?.[col] || 0;

    square.className = `game-square ${isBlack ? 'black' : 'white'}`;

    // Marquer les cases en ligne pour le design classique de dame
    if ((row + col) % 2 === 1) {
        square.style.backgroundColor = '#333';
    }

    // Vérifier si c'est la case sélectionnée
    if (gameState.selectedSquare && gameState.selectedSquare.row === row && gameState.selectedSquare.col === col) {
        square.classList.add('selected');
    }

    // Vérifier si c'est un mouvement valide
    if (gameState.validMoves.some(m => m.row === row && m.col === col)) {
        square.classList.add('valid-move');
    }

    // Afficher les pions
    if (piece) {
        const pieceLetter = piece === 1 ? '●' : '○';
        const pieceClass = piece === 1 ? 'player1' : 'player2';
        square.innerHTML = `<div class="piece ${pieceClass}">${pieceLetter}</div>`;
    }

    // Événement click
    square.addEventListener('click', () => handleSquareClick(row, col));

    return square;
}

function updateGameStatus() {
    const turnIndicator = document.getElementById('turnIndicator');
    const turnStatus = document.getElementById('turnStatus');
    
    if (!turnIndicator || !turnStatus) return;

    // Show loading state
    if (gameState.isLoading) {
        turnStatus.textContent = '⏳ Chargement de la partie...';
        turnIndicator.className = 'turn-indicator waiting';
        return;
    }

    if (gameState.gameStatus === 'waiting' || gameState.gameStatus === 'waiting_for_opponent') {
        turnStatus.textContent = '⏳ En attente de l\'adversaire...';
        turnIndicator.className = 'turn-indicator waiting';
    } else if (gameState.gameStatus === 'in_progress') {
        if (gameState.isPlayerTurn) {
            turnStatus.textContent = '🎮 C\'est votre tour de jouer !';
            turnIndicator.className = 'turn-indicator your-turn';
        } else {
            turnStatus.textContent = '⏳ Au tour de l\'adversaire...';
            turnIndicator.className = 'turn-indicator opponent-turn';
        }
    } else if (gameState.gameStatus === 'finished') {
        turnStatus.textContent = '🏁 Partie terminée';
        turnIndicator.className = 'turn-indicator finished';
    }
}

function updatePlayerNames(player1Name, player2Name) {
    document.getElementById('player1Name').textContent = player1Name;
    document.getElementById('player2Name').textContent = player2Name;
}

export {
    renderBoard,
    updateGameStatus,
    updatePlayerNames
};
