// ==================== UI HANDLERS MODULE ====================

import { gameState } from './gameState.js';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clearChat() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '';
}

async function loadChatHistory() {
    try {
        const response = await fetch(`/api/games/${gameState.gameId}/chat`);
        const messages = await response.json();

        clearChat();

        messages.forEach(msg => {
            addChatMessage({
                userId: msg.user_id,
                username: msg.username,
                message: msg.message
            });
        });

    } catch (err) {
        console.error('Erreur chargement historique chat:', err);
    }
}

function addChatMessage(data) {
    const chatMessages = document.getElementById('chatMessages');
    const msgEl = document.createElement('div');
    
    // Check if message is from current user
    const isFromCurrentUser = data.userId === gameState.currentPlayerId;
    msgEl.className = `chat-message ${isFromCurrentUser ? 'own' : ''}`;
    
    const sender = isFromCurrentUser
    ? 'Vous'
    : (data.username || `Utilisateur ${data.userId}`);

    
    msgEl.innerHTML = `<strong>${sender}</strong>: ${escapeHtml(data.message)}`;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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

function updateViewerCount(count) {
    const viewerCountEl = document.getElementById('viewerCount');
    if (viewerCountEl) {
        viewerCountEl.textContent = count;
    }
}

export {
    addChatMessage,
    sendChatMessage,
    abandonGame,
    closeAbandonModal,
    closeNotificationModal,
    showNotification,
    updateViewerCount
};
