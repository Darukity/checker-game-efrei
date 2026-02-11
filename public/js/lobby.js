// ==================== LOBBY.JS ====================

let currentLobbyInvite = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Rejoindre le lobby
    wsManager.on('AUTH_SUCCESS', () => {
        console.log('👥 Rejoindre le lobby');
        wsManager.send('LOBBY_JOIN', {});
    });

    // Écouter les mises à jour du lobby
    wsManager.on('LOBBY_UPDATE', (data) => {
        renderUsers(data.users || []);
        updateStatusInfo('connecté');
    });

    wsManager.on('USER_STATUS', (data) => {
        console.log(`Statut utilisateur ${data.userId}: ${data.status}`);
        // Recharger la liste des utilisateurs
        wsManager.send('LOBBY_JOIN', {});
    });

    wsManager.on('GAME_INVITATION', (data) => {
        handleIncomingInvitation(data);
    });

    wsManager.on('ERROR', (data) => {
        console.error('Erreur WebSocket:', data);
        updateStatusInfo('erreur', true);
    });
});

function renderUsers(users) {
    const usersList = document.getElementById('usersList');
    const currentUserId = localStorage.getItem('userId');

    if (!users || users.length === 0) {
        usersList.innerHTML = '<div class="loading">Aucun utilisateur en ligne</div>';
        return;
    }

    // Filtrer les utilisateurs (sauf soi-même)
    const otherUsers = users.filter(u => u.id.toString() !== currentUserId);

    usersList.innerHTML = otherUsers.map(user => `
        <div class="user-card ${user.online_status === 'online' ? '' : 'offline'}">
            <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="user-name">${escapeHtml(user.username)}</div>
            <span class="user-status ${user.online_status}">
                ${user.online_status === 'online' ? '🟢 En ligne' : '⚫ Hors ligne'}
            </span>
            <div class="user-actions">
                <button class="btn-invite" onclick="inviteUser(${user.id}, '${escapeHtml(user.username)}')">
                    Inviter
                </button>
            </div>
        </div>
    `).join('');
}

function inviteUser(userId, username) {
    currentLobbyInvite = { userId, username };
    const inviteText = document.getElementById('inviteText');
    inviteText.textContent = `Êtes-vous sûr de vouloir inviter ${username} à jouer?`;
    document.getElementById('inviteModal').classList.remove('hidden');
}

function closeInviteModal() {
    document.getElementById('inviteModal').classList.add('hidden');
    currentLobbyInvite = null;
}

document.getElementById('confirmInviteBtn').addEventListener('click', async () => {
    if (!currentLobbyInvite) return;

    try {
        // Créer une nouvelle partie
        const response = await fetch('/api/games', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                player1Id: localStorage.getItem('userId'),
                player2Id: currentLobbyInvite.userId
            })
        });

        const game = await response.json();

        // Envoyer l'invitation via WebSocket
        wsManager.send('INVITE_GAME', {
            toUserId: currentLobbyInvite.userId,
            gameId: game.id
        });

        closeInviteModal();
        alert('Invitation envoyée à ' + currentLobbyInvite.username);

        // Rediriger vers la page du jeu
        setTimeout(() => {
            window.location.href = `game.html?gameId=${game.id}`;
        }, 1000);
    } catch (err) {
        console.error('Erreur lors de la création de la partie:', err);
        alert('Erreur lors de la création de la partie');
    }
});

function handleIncomingInvitation(data) {
    const { fromUserId, gameId } = data;
    const accepted = confirm('Vous avez reçu une invitation à jouer! Accepter?');

    if (accepted) {
        window.location.href = `game.html?gameId=${gameId}`;
    }
}

function updateStatusInfo(status, isError = false) {
    const statusInfo = document.getElementById('statusInfo');
    if (!statusInfo) return;

    if (isError) {
        statusInfo.classList.add('error');
        statusInfo.innerHTML = `<p>❌ ${status}</p>`;
    } else {
        statusInfo.classList.remove('error');
        statusInfo.innerHTML = `<p>✅ ${status}</p>`;
    }

    setTimeout(() => {
        statusInfo.classList.add('hidden');
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
