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

    // Afficher les pions
    if (piece) {
        let pieceLetter, pieceClass;
        
        if (piece === 1) {
            // Pion joueur 1 (bleu)
            pieceLetter = '●';
            pieceClass = 'player1 pion';
        } else if (piece === 3) {
            // Dame joueur 1 (bleu)
            pieceLetter = '★';
            pieceClass = 'player1 dame';
        } else if (piece === 2) {
            // Pion joueur 2 (orange)
            pieceLetter = '○';
            pieceClass = 'player2 pion';
        } else if (piece === 4) {
            // Dame joueur 2 (orange)
            pieceLetter = '✦';
            pieceClass = 'player2 dame';
        }
        
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

    if (gameState.gameStatus === 'waiting' || gameState.gameStatus === 'waiting_for_opponent') {
        turnStatus.textContent = '⏳ En attente de l\'adversaire...';
        turnIndicator.className = 'turn-indicator waiting';
    } else if (gameState.gameStatus === 'in_progress') {
        if (gameState.isSpectator) {
            // Show which player's turn it is for spectators
            const currentPlayerName = gameState.currentTurn === 1 
                ? gameState.player1Name 
                : gameState.player2Name;
            turnStatus.textContent = `⏳ Au tour de ${currentPlayerName}`;
            turnIndicator.className = 'turn-indicator opponent-turn';
        } else if (gameState.isPlayerTurn) {
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

function updateSpectatorUI(isSpectator) {
    const abandonBtn = document.getElementById('abandonBtn');
    if (abandonBtn) {
        if (isSpectator) {
            abandonBtn.style.display = 'none';
        } else {
            abandonBtn.style.display = '';
        }
    }
}

export {
    renderBoard,
    updateGameStatus,
    updatePlayerNames,
    updateSpectatorUI
};
