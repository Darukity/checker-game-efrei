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

    // Event listeners for game controls - with null safety
    const abandonBtn = document.getElementById('abandonBtn');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');
    const cancelAbandonBtn = document.getElementById('cancelAbandonBtn');
    const closeNotificationBtn = document.getElementById('closeNotificationBtn');

    if (abandonBtn) {
        abandonBtn.addEventListener('click', abandonGame);
    }

    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', sendChatMessage);
    }

    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }

    // Modal controls - attach to window for global access
    if (cancelAbandonBtn) {
        cancelAbandonBtn.addEventListener('click', closeAbandonModal);
    }

    if (closeNotificationBtn) {
        closeNotificationBtn.addEventListener('click', closeNotificationModal);
    }

    // Initial render
    renderBoard(handleSquareClick);
});
