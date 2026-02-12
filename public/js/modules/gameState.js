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
    isPlayerTurn: false,
    playerColor: null,
    opponentId: null,
    gameStatus: 'waiting',
    currentTurn: null
};

function resetGameState() {
    gameState.board = initializeBoard();
    gameState.selectedSquare = null;
    gameState.isPlayerTurn = false;
    gameState.gameStatus = 'waiting';
    gameState.currentTurn = null;
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
        
        // Extract board and currentTurn from game_state
        if (gameStateData && gameStateData.board && Array.isArray(gameStateData.board)) {
            console.log('Using board from game_state');
            gameState.board = gameStateData.board;
        } else {
            console.log('Initializing new board');
            gameState.board = initializeBoard();
        }
        
        // Get currentTurn from game_state; if missing, leave null so server defines it
        if (gameStateData && typeof gameStateData.currentTurn !== 'undefined') {
            gameState.currentTurn = gameStateData.currentTurn;
        } else {
            gameState.currentTurn = null; // unknown - server must provide
        }
        
        gameState.opponentId = data.player1_id === gameState.currentPlayerId ? data.player2_id : data.player1_id;
        gameState.playerColor = data.player1_id === gameState.currentPlayerId ? 1 : 2;
        gameState.gameStatus = data.status;

        // Determine if it's our turn based on currentTurn from server
        if (data.status === 'in_progress') {
            // Only grant turn if server explicitly provided currentTurn
            gameState.isPlayerTurn = (gameState.currentTurn !== null && gameState.currentTurn === gameState.playerColor);
            console.log('Game in progress - Player', gameState.currentPlayerId, '(color', gameState.playerColor, '), currentTurn:', gameState.currentTurn, ', isPlayerTurn:', gameState.isPlayerTurn);
        } else {
            // For waiting or other statuses, no one has a turn yet
            gameState.isPlayerTurn = false;
            console.log('Game status:', data.status, '- waiting for game to start');
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

function clearSelection() {
    gameState.selectedSquare = null;
}

export {
    BOARD_SIZE,
    gameState,
    initializeBoard,
    resetGameState,
    updateGameStateFromServer,
    clearSelection
};
