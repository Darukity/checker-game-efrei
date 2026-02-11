// ==================== WEBSOCKET EVENT HANDLERS MODULE ====================

import { gameState, updateGameStateFromServer, applyMove } from './gameState.js';
import { renderBoard, updateGameStatus, updatePlayerNames } from './boardRenderer.js';
import { handleSquareClick } from './moveLogic.js';
import { addChatMessage, showNotification, updateViewerCount } from './uiHandlers.js';

function setupWebSocketHandlers(wsManager) {
    // Auth success - join the game
    wsManager.on('AUTH_SUCCESS', () => {
        console.log(`🎮 Rejoindre la partie ${gameState.gameId}`);
        wsManager.send('GAME_JOIN', { gameId: gameState.gameId });
    });

    // Receive game state from server
    wsManager.on('GAME_STATE', (data) => {
        console.log('État de la partie reçu:', data);
        console.log('Type of game_state:', typeof data.game_state);
        
        try {
            const playerNames = updateGameStateFromServer(data);
            updatePlayerNames(playerNames.player1Name, playerNames.player2Name);
            
            console.log('Board after initialization:', gameState.board);
            renderBoard(handleSquareClick);
            updateGameStatus();
        } catch (error) {
            console.error('Error processing GAME_STATE:', error);
            console.error('data:', data);
            renderBoard(handleSquareClick);
        }
    });

    // Receive opponent's move
    wsManager.on('GAME_MOVE', (data) => {
        console.log('Mouvement reçu:', data);
        // Only apply move if it's from the opponent
        if (data.userId !== gameState.currentPlayerId) {
            applyMove(data.from, data.to);
            gameState.isPlayerTurn = true; // Now it's our turn
        }
        renderBoard(handleSquareClick);
        updateGameStatus();
    });

    // Game started
    wsManager.on('GAME_START', (data) => {
        gameState.gameStatus = 'in_progress';
        gameState.isPlayerTurn = gameState.playerColor === 1;
        renderBoard(handleSquareClick);
        updateGameStatus();
        console.log('🎮 La partie a commencé !');
    });

    // Player joined the game
    wsManager.on('PLAYER_JOINED', (data) => {
        if (data.userId !== gameState.currentPlayerId) {
            console.log('Adversaire connecté, partie peut commencer');
            // Automatically start the game when both players are connected
            // Only player 1 (the one with playerColor === 1) should send GAME_START
            if (gameState.playerColor === 1) {
                console.log('Je suis le joueur 1, je démarre la partie automatiquement');
                setTimeout(() => {
                    wsManager.send('GAME_START', { gameId: gameState.gameId });
                }, 500);
            } else {
                console.log('Je suis le joueur 2, j\'attends que le joueur 1 démarre');
            }
        }
    });

    // Game abandoned by opponent
    wsManager.on('GAME_ABANDONED', (data) => {
        console.log('Partie abandonnée:', data);
        showNotification(
            '🎉 Victoire!',
            'Votre adversaire a abandonné! Vous avez gagné!',
            () => {
                window.location.href = 'myGames.html';
            }
        );
    });

    // Chat message received
    wsManager.on('CHAT_MESSAGE', (data) => {
        addChatMessage(data);
    });

    // Viewer count updated
    wsManager.on('VIEWER_COUNT_UPDATE', (data) => {
        updateViewerCount(data.count);
    });

    // Setup view game (spectator mode)
    wsManager.on('AUTH_SUCCESS', () => {
        wsManager.send('VIEW_GAME', { gameId: gameState.gameId });
    });
}

export { setupWebSocketHandlers };
