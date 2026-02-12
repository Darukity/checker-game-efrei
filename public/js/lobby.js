// ==================== LOBBY.JS ====================

let currentLobbyInvite = null;
let lobbyUpdateTimeout = null;
let currentIncomingInvite = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Listen for general channel updates (automatic after AUTH)
    wsManager.on('AUTH_SUCCESS', () => {
        console.log('✅ Connected to general channel automatically');
        // No need to send LOBBY_JOIN - server does it automatically
    });

    // Écouter les mises à jour du lobby
    wsManager.on('LOBBY_UPDATE', (data) => {
        renderUsers(data.users || []);
        updateStatusInfo('connecté');
    });

    wsManager.on('USER_STATUS', (data) => {
        console.log(`Statut utilisateur ${data.userId}: ${data.status}`);
        // Debounce la récupération de la liste complète via API REST
        // Cela évite les boucles WebSocket
        clearTimeout(lobbyUpdateTimeout);
        lobbyUpdateTimeout = setTimeout(() => {
            fetch('/api/users/online')
                .then(res => res.json())
                .then(users => renderUsers(users))
                .catch(err => console.error('Erreur lors de la récupération des utilisateurs:', err));
        }, 300);
    });

    wsManager.on('GAME_INVITATION', (data) => {
        console.log('🎯 GAME_INVITATION received in lobby:', data);
        handleIncomingInvitation(data);
    });

    wsManager.on('GAME_ACCEPTED', (data) => {
        // Redirect both players to the game page
        window.location.href = `game.html?gameId=${data.gameId}`;
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

    // Filtrer les utilisateurs (sauf soi-même et ceux en partie)
    const otherUsers = users.filter(u => 
        u.id.toString() !== currentUserId && 
        u.online_status !== 'in_game'
    );

    if (otherUsers.length === 0) {
        usersList.innerHTML = '<div class="loading">Aucun adversaire disponible</div>';
        return;
    }

    usersList.innerHTML = otherUsers.map(user => `
        <div class="user-card ${user.online_status === 'online' ? '' : 'offline'}">
            <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="user-name">${escapeHtml(user.username)}</div>
            <span class="user-status ${user.online_status}">
                ${user.online_status === 'online' ? '🟢 Disponible' : '⚫ Hors ligne'}
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
        // Create a new game via POST request
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

        if (!response.ok) {
            throw new Error('Erreur lors de la création de la partie');
        }

        const game = await response.json();

        // Save username before closing modal (which sets currentLobbyInvite to null)
        const invitedUsername = currentLobbyInvite.username;
        closeInviteModal();

        // The server will broadcast the invitation to the other player
        // Wait for them to accept before redirecting
    } catch (err) {
        console.error('Erreur lors de la création de la partie:', err);
        alert('Erreur lors de la création de la partie');
    }
});

function handleIncomingInvitation(data) {
    const { fromUserId, gameId } = data;
    
    // Get the username of the inviter
    fetch(`/api/user/${fromUserId}`)
        .then(res => res.json())
        .then(user => {
            currentIncomingInvite = { fromUserId, gameId, username: user.username };
            document.getElementById('globalInviteText').textContent = `${user.username} vous invite à jouer! Acceptez-vous?`;
            document.getElementById('globalInviteModal').classList.remove('hidden');
        })
        .catch(err => {
            console.error('Erreur lors de la récupération de l\'utilisateur:', err);
            currentIncomingInvite = { fromUserId, gameId, username: 'Un adversaire' };
            document.getElementById('globalInviteText').textContent = 'Vous avez reçu une invitation à jouer! Acceptez-vous?';
            document.getElementById('globalInviteModal').classList.remove('hidden');
        });
}

function closeIncomingInviteModal() {
    document.getElementById('globalInviteModal').classList.add('hidden');
    currentIncomingInvite = null;
}

document.getElementById('confirmIncomingInviteBtn').addEventListener('click', async () => {
    if (!currentIncomingInvite) return;

    try {
        // Send POST request to accept the invitation
        const response = await fetch(`/api/games/${currentIncomingInvite.gameId}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                userId: localStorage.getItem('userId')
            })
        });

        if (!response.ok) {
            throw new Error('Erreur lors de l\'acceptation');
        }

        closeIncomingInviteModal();
        // Server will broadcast GAME_ACCEPTED to both players
        // Redirect handled by GAME_ACCEPTED listener
    } catch (err) {
        console.error('Erreur lors de l\'acceptation:', err);
        closeIncomingInviteModal();
        alert('Erreur lors de l\'acceptation de l\'invitation');
    }
});

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
