// ==================== GAME.JS ====================
// Main entry point - imports all game modules

import { gameState } from './modules/gameState.js';
import { renderBoard } from './modules/boardRenderer.js';
import { handleSquareClick } from './modules/moveLogic.js';
import { sendChatMessage, abandonGame, closeAbandonModal, closeNotificationModal } from './modules/uiHandlers.js';
import { setupWebSocketHandlers } from './modules/wsEventHandlers.js';

document.addEventListener('DOMContentLoaded', async () => {
    const gameId = new URLSearchParams(window.location.search).get('gameId');

    if (!gameId) {
        alert('Aucune partie spécifiée');
        window.location.href = 'myGames.html';
        return;
    }

    gameState.gameId = gameId;
    gameState.currentPlayerId = parseInt(localStorage.getItem('userId'));

    // Setup WebSocket event handlers
    setupWebSocketHandlers(wsManager);

    // Event listeners for game controls
    document.getElementById('abandonBtn').addEventListener('click', abandonGame);
    document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);

    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // Modal controls - attach to window for global access
    document.getElementById('cancelAbandonBtn').addEventListener('click', closeAbandonModal);
    document.getElementById('closeNotificationBtn')?.addEventListener('click', closeNotificationModal);

    // Initial render
    renderBoard(handleSquareClick);
});
