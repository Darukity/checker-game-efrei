// ==================== UI HANDLERS MODULE ====================

import { gameState } from './gameState.js';

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addChatMessage(data) {
    const chatMessages = document.getElementById('chatMessages');
    const msgEl = document.createElement('div');
    
    const isFromCurrentUser = data.userId === gameState.currentPlayerId;
    msgEl.className = `chat-message ${isFromCurrentUser ? 'own' : ''}`;
    
    // 🔥 AFFICHAGE PROPRE DU NOM
    let sender;

    if (isFromCurrentUser) {
        sender = 'Vous';
    } else if (data.username) {
        sender = data.username;
    } else {
        sender = `Utilisateur ${data.userId}`;
    }
    
    msgEl.innerHTML = `<strong>${sender}</strong>: ${escapeHtml(data.message)}`;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();

    if (!message) return;

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
        chatInput.value = '';
    })
    .catch(err => {
        console.error('Erreur lors de l\'envoi du message:', err);
        alert('Erreur lors de l\'envoi du message');
    });
}

function abandonGame() {
    // 🔥 BLOQUER ABANDON SI SPECTATEUR
    if (gameState.isSpectator) return;

    document.getElementById('abandonModal').classList.remove('hidden');
    
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
        .then(() => {
            closeAbandonModal();
            showNotification(
                'Abandon confirmé',
                'Vous avez abandonné la partie. Votre adversaire a gagné!',
                () => {
                    window.location.href = 'myGames.html';
                }
            );
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
        if (callback) callback();
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
