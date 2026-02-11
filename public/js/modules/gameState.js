// ==================== GAME STATE MODULE ====================

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

const gameState = {
    gameId: null,
    currentPlayerId: null,
    board: initializeBoard(),
    selectedSquare: null,
    validMoves: [],
    isPlayerTurn: false,
    playerColor: null,
    opponentId: null,
    gameStatus: 'waiting'
};

function resetGameState() {
    gameState.board = initializeBoard();
    gameState.selectedSquare = null;
    gameState.validMoves = [];
    gameState.isPlayerTurn = false;
    gameState.gameStatus = 'waiting';
}

function updateGameStateFromServer(data) {
    try {
        // PostgreSQL JSONB is returned as an object by the pg library
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

        // Initialize turn state based on game status
        // Player 1 (black pieces) always goes first when game is in progress
        if (data.status === 'in_progress') {
            gameState.isPlayerTurn = gameState.playerColor === 1;
            console.log(`🎮 Game in progress - Player ${gameState.currentPlayerId} (color ${gameState.playerColor}), isPlayerTurn: ${gameState.isPlayerTurn}`);
        } else {
            // For waiting or other statuses, no one has a turn yet
            gameState.isPlayerTurn = false;
            console.log(`⏳ Game status: ${data.status} - waiting for game to start`);
        }

        return {
            player1Name: data.player1_username || 'Joueur 1',
            player2Name: data.player2_username || 'Joueur 2'
        };
    } catch (error) {
        console.error('Error processing game state:', error);
        gameState.board = initializeBoard();
        throw error;
    }
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

function clearSelection() {
    gameState.selectedSquare = null;
    gameState.validMoves = [];
}

export {
    BOARD_SIZE,
    gameState,
    initializeBoard,
    resetGameState,
    updateGameStateFromServer,
    applyMove,
    clearSelection
};
