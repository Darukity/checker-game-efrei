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
    gameStatus: 'waiting',
    isLoading: true // Prevent interactions until game state is loaded from server
};

function resetGameState() {
    gameState.board = initializeBoard();
    gameState.selectedSquare = null;
    gameState.validMoves = [];
    gameState.isPlayerTurn = false;
    gameState.gameStatus = 'waiting';
    gameState.isLoading = true; // Reset loading state when resetting game
}

function updateGameStateFromServer(data) {
    try {
        console.log('🔄 Updating game state from server:');
        console.log('  - Game ID:', data.id);
        console.log('  - Status:', data.status);
        
        // PostgreSQL JSONB is returned as an object by the pg library
        let gameStateData = data.game_state;
        
        // If for some reason it's a string, parse it
        if (typeof gameStateData === 'string') {
            console.log('⚠️ Parsing game_state string:', gameStateData);
            gameStateData = JSON.parse(gameStateData);
        }
        
        // Extract board or initialize new one
        if (gameStateData && gameStateData.board && Array.isArray(gameStateData.board)) {
            console.log('✅ Using board from game_state (size:', gameStateData.board.length, ')');
            gameState.board = gameStateData.board;
        } else {
            console.warn('⚠️ No valid board in game_state, initializing new board');
            console.log('  - gameStateData:', gameStateData);
            gameState.board = initializeBoard();
        }
        
        gameState.opponentId = data.player1_id === gameState.currentPlayerId ? data.player2_id : data.player1_id;
        gameState.playerColor = data.player1_id === gameState.currentPlayerId ? 1 : 2;
        gameState.gameStatus = data.status;

        console.log('👥 Player Info:');
        console.log('  - Current Player ID:', gameState.currentPlayerId);
        console.log('  - Opponent ID:', gameState.opponentId);
        console.log('  - Player Color:', gameState.playerColor);
        console.log('  - Player 1 ID:', data.player1_id);
        console.log('  - Player 2 ID:', data.player2_id);
        console.log('  - Current Turn Player ID (from DB):', data.current_turn_player_id);

        // Initialize turn state based on game status
        if (data.status === 'in_progress') {
            // Use server's authoritative current_turn_player_id
            if (data.current_turn_player_id !== undefined && data.current_turn_player_id !== null) {
                gameState.isPlayerTurn = data.current_turn_player_id === gameState.currentPlayerId;
                console.log('🎮 Turn determined from database:');
                console.log('  - current_turn_player_id === currentPlayerId?', data.current_turn_player_id === gameState.currentPlayerId);
                console.log('  - Result: isPlayerTurn =', gameState.isPlayerTurn);
            } else {
                // Fallback: use lastMove if current_turn_player_id is not set
                if (gameStateData && gameStateData.lastMove) {
                    console.log('📝 Last Move Info (fallback):');
                    console.log('  - lastMove.userId:', gameStateData.lastMove.userId);
                    console.log('  - lastMove.from:', gameStateData.lastMove.from);
                    console.log('  - lastMove.to:', gameStateData.lastMove.to);
                    console.log('  - lastMove.timestamp:', gameStateData.lastMove.timestamp);
                    
                    // If the last move was made by the opponent, it's our turn
                    gameState.isPlayerTurn = gameStateData.lastMove.userId === gameState.opponentId;
                    console.log('🎮 Turn Logic (fallback):');
                    console.log('  - lastMove.userId === opponentId?', gameStateData.lastMove.userId === gameState.opponentId);
                    console.log('  - Result: isPlayerTurn =', gameState.isPlayerTurn);
                } else {
                    // No moves yet - Player 1 (black pieces) goes first
                    gameState.isPlayerTurn = gameState.playerColor === 1;
                    console.log('🎮 First turn - Player 1 starts, isPlayerTurn:', gameState.isPlayerTurn);
                }
            }
            console.log('🎮 Final Turn State: Player', gameState.currentPlayerId, '(color', gameState.playerColor + '), isPlayerTurn:', gameState.isPlayerTurn);
        } else {
            // For waiting or other statuses, no one has a turn yet
            gameState.isPlayerTurn = false;
            console.log('⏳ Game status:', data.status, '- waiting for game to start');
        }

        return {
            player1Name: data.player1_username || 'Joueur 1',
            player2Name: data.player2_username || 'Joueur 2'
        };
    } catch (error) {
        console.error('❌ Error processing game state:', error);
        gameState.board = initializeBoard();
        throw error;
    } finally {
        // Mark loading as complete regardless of success or failure
        gameState.isLoading = false;
        console.log('✅ Game state loading complete');
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
