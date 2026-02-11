// ==================== GAME.JS ====================

const BOARD_SIZE = 8;

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

let gameState = {
    gameId: null,
    currentPlayerId: null,
    board: initializeBoard(), // Initialize with empty board
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
        console.log('Type of game_state:', typeof data.game_state);
        
        try {
            // PostgreSQL JSONB is returned as an object by the pg library
            // When sent via WebSocket with JSON.stringify, it remains an object
            let gameStateData = data.game_state;
            
            // If for some reason it's a string, parse it
            if (typeof gameStateData === 'string') {
                console.log('Parsing game_state string:', gameStateData);
                gameStateData = JSON.parse(gameStateData);
            }
            
            // Extract board or initialize new one
            if (gameStateData && gameStateData.board && Array.isArray(gameStateData.board)) {
                console.log('Using board from game_state');
                gameState.board = gameStateData.board;
            } else {
                console.log('Initializing new board');
                gameState.board = initializeBoard();
            }
            
            gameState.opponentId = data.player1_id === gameState.currentPlayerId ? data.player2_id : data.player1_id;
            gameState.playerColor = data.player1_id === gameState.currentPlayerId ? 1 : 2;
            gameState.gameStatus = data.status;

            document.getElementById('player1Name').textContent = data.player1_username || 'Joueur 1';
            document.getElementById('player2Name').textContent = data.player2_username || 'Joueur 2';

            console.log('Board after initialization:', gameState.board);
            renderBoard();
            updateGameStatus();
        } catch (error) {
            console.error('Error processing GAME_STATE:', error);
            console.error('data:', data);
            // Initialize with default board on error
            gameState.board = initializeBoard();
            renderBoard();
        }
    });

    wsManager.on('GAME_MOVE', (data) => {
        console.log('Mouvement reçu:', data);
        // Only apply move if it's from the opponent
        if (data.userId !== gameState.currentPlayerId) {
            applyMove(data.from, data.to);
            gameState.isPlayerTurn = true; // Now it's our turn
        }
        renderBoard();
        updateGameStatus();
    });

    wsManager.on('GAME_START', (data) => {
        gameState.gameStatus = 'in_progress';
        gameState.isPlayerTurn = gameState.playerColor === 1;
        renderBoard();
        updateGameStatus();
        console.log('🎮 La partie a commencé !');
    });

    wsManager.on('PLAYER_JOINED', (data) => {
        if (data.userId !== gameState.currentPlayerId) {
            console.log('Adversaire connecté, partie peut commencer');
            // Automatically start the game when both players are connected
            if (gameState.currentPlayerId === data.player1_id || gameState.playerColor === 1) {
                // Player 1 starts the game automatically
                setTimeout(() => {
                    wsManager.send('GAME_START', { gameId: gameState.gameId });
                }, 500);
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

function renderBoard() {
    const board = document.getElementById('gameBoard');
    if (!board) {
        console.error('gameBoard element not found');
        return;
    }
    
    // Ensure gameState.board is initialized
    if (!gameState.board || !Array.isArray(gameState.board) || gameState.board.length === 0) {
        console.warn('Board not initialized, using default board');
        gameState.board = initializeBoard();
    }
    
    board.innerHTML = '';

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
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
    // Apply move locally (optimistic update)
    applyMove(from, to);
    renderBoard();

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
            throw new Error('Mouvement invalide');
        }
        return res.json();
    })
    .then(() => {
        // Move validated by server
        // Server will broadcast to other players via WebSocket
        gameState.isPlayerTurn = false;
        renderBoard();
        updateGameStatus();
    })
    .catch(err => {
        console.error('Erreur lors du mouvement:', err);
        // Revert move if server rejected it
        gameState.board = JSON.parse(JSON.stringify(gameState.board)); // Reset
        alert('Mouvement invalide');
        renderBoard();
        updateGameStatus();
    });
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

function abandonGame() {
    // Afficher le modal de confirmation
    document.getElementById('abandonModal').classList.remove('hidden');
    
    // Gérer le clic sur le bouton de confirmation
    const confirmBtn = document.getElementById('confirmAbandonBtn');
    const handler = () => {
        confirmBtn.removeEventListener('click', handler);
        
        fetch(`/api/games/${gameState.gameId}/abandon`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                userId: gameState.currentPlayerId
            })
        })
        .then(res => {
            if (!res.ok) {
                throw new Error('Erreur lors de l\'abandon');
            }
            return res.json();
        })
        .then(data => {
            closeAbandonModal();
            showNotification('Abandon confirmé', 'Vous avez abandonné la partie. Votre adversaire a gagné!', () => {
                window.location.href = 'myGames.html';
            });
        })
        .catch(err => {
            console.error('Erreur lors de l\'abandon:', err);
            closeAbandonModal();
            showNotification('Erreur', 'Erreur lors de l\'abandon de la partie');
        });
    };
    
    confirmBtn.addEventListener('click', handler);
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (!message) return;

    // Send chat message via POST request
    fetch(`/api/games/${gameState.gameId}/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
            userId: gameState.currentPlayerId,
            message: message
        })
    })
    .then(res => res.json())
    .then(() => {
        // Server will broadcast to all players via WebSocket
        chatInput.value = '';
    })
    .catch(err => {
        console.error('Erreur lors de l\'envoi du message:', err);
        alert('Erreur lors de l\'envoi du message');
    });
}

function addChatMessage(data, isOwn = false) {
    const chatMessages = document.getElementById('chatMessages');
    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${isOwn ? 'own' : ''}`;
    
    // Check if message is from current user
    const isFromCurrentUser = data.userId === gameState.currentPlayerId;
    const sender = isFromCurrentUser ? 'Vous' : `Joueur ${data.userId}`;
    
    msgEl.innerHTML = `<strong>${sender}</strong>: ${escapeHtml(data.message)}`;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateGameStatus() {
    const turnIndicator = document.getElementById('turnIndicator');
    const turnStatus = document.getElementById('turnStatus');
    
    if (!turnIndicator || !turnStatus) return;

    if (gameState.gameStatus === 'waiting') {
        turnStatus.textContent = '⏳ En attente des joueurs...';
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== MODAL FUNCTIONS ====================

function closeAbandonModal() {
    document.getElementById('abandonModal').classList.add('hidden');
}

function closeNotificationModal() {
    document.getElementById('notificationModal').classList.add('hidden');
}

function showNotification(title, message, callback = null) {
    document.getElementById('notificationTitle').textContent = title;
    document.getElementById('notificationText').textContent = message;
    document.getElementById('notificationModal').classList.remove('hidden');
    
    const notificationBtn = document.getElementById('notificationBtn');
    const handler = () => {
        notificationBtn.removeEventListener('click', handler);
        closeNotificationModal();
        if (callback) {
            callback();
        }
    };
    notificationBtn.addEventListener('click', handler);
}
