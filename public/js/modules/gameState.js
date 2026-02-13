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
    currentTurn: null,
    isSpectator: false,
    player1Name: 'Joueur 1',
    player2Name: 'Joueur 2'
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
        /* console.log('🔍 updateGameStateFromServer called with:', {
            current_turn: data.current_turn,
            game_state: data.game_state,
            status: data.status,
            player1_id: data.player1_id,
            player2_id: data.player2_id
        }); */
        
        // PostgreSQL JSONB is returned as an object by the pg library
        let gameStateData = data.game_state;
        
        // If for some reason it's a string, parse it
        if (typeof gameStateData === 'string') {
            // console.log('Parsing game_state string:', gameStateData);
            gameStateData = JSON.parse(gameStateData);
        }
        
        // Extract board and currentTurn from game_state
        if (gameStateData && gameStateData.board && Array.isArray(gameStateData.board)) {
            // console.log('Using board from game_state');
            gameState.board = gameStateData.board;
        } else {
            // console.log('Initializing new board');
            gameState.board = initializeBoard();
        }
        
        // Get currentTurn - prefer the column value over JSONB value for accuracy
        if (typeof data.current_turn === 'number') {
            gameState.currentTurn = data.current_turn;
            // console.log('Using currentTurn from database column:', data.current_turn);
        } else if (gameStateData && typeof gameStateData.currentTurn !== 'undefined') {
            gameState.currentTurn = gameStateData.currentTurn;
            // console.log('Using currentTurn from game_state JSONB:', gameStateData.currentTurn);
        } else {
            gameState.currentTurn = null;
            // console.log('No currentTurn value found, setting to null');
        }
        
        // 🔥 AJOUT MODE SPECTATEUR - Detect if user is neither player1 nor player2
        const isPlayer = (data.player1_id === gameState.currentPlayerId || 
                         data.player2_id === gameState.currentPlayerId);
        gameState.isSpectator = !isPlayer;

        // Only set opponent and color if actually a player
        if (isPlayer) {
            gameState.opponentId =
                data.player1_id === gameState.currentPlayerId
                    ? data.player2_id
                    : data.player1_id;

            gameState.playerColor =
                data.player1_id === gameState.currentPlayerId ? 1 : 2;
        } else {
            // Spectator - no opponent or color
            gameState.opponentId = null;
            gameState.playerColor = null;
        }

        gameState.gameStatus = data.status;

        // 🔥 Gestion du tour
        if (gameState.isSpectator) {
            // En mode spectateur on ne joue jamais
            gameState.isPlayerTurn = false;
            // console.log('👁️ Spectator mode - isPlayerTurn = false');
        } else if (data.status === 'in_progress') {
            // Use currentTurn from server to determine whose turn it is
            // Extra safety check: ensure both values are valid numbers
            if (typeof gameState.currentTurn === 'number' && typeof gameState.playerColor === 'number') {
                gameState.isPlayerTurn = gameState.currentTurn === gameState.playerColor;
                /* console.log(
                    `🎮 Turn check - currentTurn: ${gameState.currentTurn}, playerColor: ${gameState.playerColor}, isPlayerTurn: ${gameState.isPlayerTurn}`
                ); */
            } else {
                // If either value is invalid, default to not your turn
                gameState.isPlayerTurn = false;
                console.warn(`⚠️ Invalid turn data - currentTurn: ${gameState.currentTurn}, playerColor: ${gameState.playerColor}`);
            }
            /* console.log(
                `🎮 Game in progress - Player ${gameState.currentPlayerId} (color ${gameState.playerColor}), currentTurn: ${gameState.currentTurn}, isPlayerTurn: ${gameState.isPlayerTurn}`
            ); */
        } else {
            gameState.isPlayerTurn = false;
            // console.log('Game status:', data.status, '- waiting for game to start');
        }

        // Store player names in gameState
        gameState.player1Name = data.player1_username || 'Joueur 1';
        gameState.player2Name = data.player2_username || 'Joueur 2';

        return {
            player1Name: gameState.player1Name,
            player2Name: gameState.player2Name
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
