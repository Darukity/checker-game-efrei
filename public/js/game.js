// ==================== GAME.JS ====================

const BOARD_SIZE = 8;
let gameState = {
    gameId: null,
    currentPlayerId: null,
    board: [],
    selectedSquare: null,
    validMoves: [],
    isPlayerTurn: false,
    playerColor: null,
    opponentId: null,
    gameStatus: 'waiting'
};

document.addEventListener('DOMContentLoaded', async () => {
    const gameId = new URLSearchParams(window.location.search).get('gameId');

    if (!gameId) {
        alert('Aucune partie spécifiée');
        window.location.href = 'myGames.html';
        return;
    }

    gameState.gameId = gameId;
    gameState.currentPlayerId = parseInt(localStorage.getItem('userId'));

    // Rejoindre la partie via WebSocket
    wsManager.on('AUTH_SUCCESS', () => {
        console.log(`🎮 Rejoindre la partie ${gameId}`);
        wsManager.send('GAME_JOIN', { gameId });
    });

    wsManager.on('GAME_STATE', (data) => {
        console.log('État de la partie reçu:', data);
        gameState.board = JSON.parse(data.game_state).board || initializeBoard();
        gameState.opponentId = data.player1_id === gameState.currentPlayerId ? data.player2_id : data.player1_id;
        gameState.playerColor = data.player1_id === gameState.currentPlayerId ? 1 : 2;
        gameState.gameStatus = data.status;

        document.getElementById('player1Name').textContent = data.player1_username || 'Joueur 1';
        document.getElementById('player2Name').textContent = data.player2_username || 'Joueur 2';

        renderBoard();

        if (data.status === 'waiting_for_opponent' && gameState.currentPlayerId === data.player1_id) {
            document.getElementById('startGameBtn').disabled = false;
        }
    });

    wsManager.on('GAME_MOVE', (data) => {
        console.log('Mouvement reçu:', data);
        applyMove(data.from, data.to);
        renderBoard();
    });

    wsManager.on('GAME_START', (data) => {
        gameState.gameStatus = 'in_progress';
        gameState.isPlayerTurn = gameState.playerColor === 1;
        renderBoard();
        updateGameStatus();
    });

    wsManager.on('PLAYER_JOINED', (data) => {
        if (data.userId !== gameState.currentPlayerId) {
            console.log('Adversaire connecté, partie peut commencer');
            if (gameState.currentPlayerId === gameState.playerColor) {
                document.getElementById('startGameBtn').disabled = false;
            }
        }
    });

    wsManager.on('CHAT_MESSAGE', (data) => {
        addChatMessage(data);
    });

    wsManager.on('VIEWER_COUNT_UPDATE', (data) => {
        document.getElementById('viewerCount').textContent = data.count;
    });

    // Event listeners pour le jeu
    document.getElementById('startGameBtn').addEventListener('click', startGame);
    document.getElementById('abandonBtn').addEventListener('click', abandonGame);
    document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);

    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // Initialiser le plateau
    renderBoard();

    // Rejoindre en tant que spectateur
    wsManager.on('AUTH_SUCCESS', () => {
        wsManager.send('VIEW_GAME', { gameId });
    });
});

function initializeBoard() {
    const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));

    // Pions noirs (joueur 1) - haut
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = 1;
            }
        }
    }

    // Pions blancs (joueur 2) - bas
    for (let row = 5; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if ((row + col) % 2 === 1) {
                board[row][col] = 2;
            }
        }
    }

    return board;
}

function renderBoard() {
    const board = document.getElementById('gameBoard');
    board.innerHTML = '';

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const square = document.createElement('div');
            const isBlack = (row + col) % 2 === 1;
            const piece = gameState.board[row][col];

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

            board.appendChild(square);
        }
    }

    updateGameStatus();
}

function handleSquareClick(row, col) {
    if (!gameState.isPlayerTurn || gameState.gameStatus !== 'in_progress') {
        return;
    }

    // Si une case est déjà sélectionnée
    if (gameState.selectedSquare) {
        // Vérifier si c'est un mouvement valide
        if (gameState.validMoves.some(m => m.row === row && m.col === col)) {
            makeMove(gameState.selectedSquare, { row, col });
            gameState.selectedSquare = null;
            gameState.validMoves = [];
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

    renderBoard();
}

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

function makeMove(from, to) {
    // Appliquer le mouvement localement
    applyMove(from, to);

    // Envoyer le mouvement au serveur
    wsManager.send('GAME_MOVE', {
        gameId: gameState.gameId,
        from: { row: from.row, col: from.col },
        to: { row: to.row, col: to.col }
    });

    gameState.isPlayerTurn = false;
    renderBoard();
}

function applyMove(from, to) {
    const piece = gameState.board[from.row][from.col];
    gameState.board[to.row][to.col] = piece;
    gameState.board[from.row][from.col] = 0;

    // Vérifier s'il faut devenir une dame
    if ((piece === 1 && to.row === BOARD_SIZE - 1) || (piece === 2 && to.row === 0)) {
        // Marquer comme dame (dans une vraie implémentation)
    }
}

function startGame() {
    wsManager.send('GAME_START', { gameId: gameState.gameId });
}

function abandonGame() {
    if (confirm('Êtes-vous sûr de vouloir abandonner?')) {
        window.location.href = 'myGames.html';
    }
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (!message) return;

    wsManager.send('CHAT_MESSAGE', {
        gameId: gameState.gameId,
        message: message
    });

    // Afficher le message localement
    addChatMessage({
        userId: gameState.currentPlayerId,
        message: message,
        createdAt: new Date().toISOString()
    }, true);

    chatInput.value = '';
}

function addChatMessage(data, isOwn = false) {
    const chatMessages = document.getElementById('chatMessages');
    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${isOwn ? 'own' : ''}`;
    msgEl.innerHTML = `<strong>Vous</strong>: ${escapeHtml(data.message)}`;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateGameStatus() {
    const status = gameState.isPlayerTurn ? '🎮 À votre tour' : '⏳ Attente du mouvement adversaire';
    // Vous pouvez ajouter un élément d'état de jeu si souhaité
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
