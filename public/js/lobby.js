// ==================== LOBBY.JS ====================

let currentLobbyInvite = null;
let lobbyUpdateTimeout = null;

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

        closeInviteModal();
        alert('Invitation envoyée à ' + currentLobbyInvite.username);

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
            const accepted = confirm(`${user.username} vous invite à jouer! Accepter?`);

            if (accepted) {
                // Send POST request to accept the invitation
                fetch(`/api/games/${gameId}/accept`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        userId: localStorage.getItem('userId')
                    })
                })
                .then(res => res.json())
                .then(() => {
                    // Server will broadcast GAME_ACCEPTED to both players
                    // Redirect handled by GAME_ACCEPTED listener
                })
                .catch(err => {
                    console.error('Erreur lors de l\'acceptation:', err);
                    alert('Erreur lors de l\'acceptation de l\'invitation');
                });
            }
        })
        .catch(err => {
            console.error('Erreur lors de la récupération de l\'utilisateur:', err);
            const accepted = confirm('Vous avez reçu une invitation à jouer! Accepter?');
            
            if (accepted) {
                fetch(`/api/games/${gameId}/accept`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                        userId: localStorage.getItem('userId')
                    })
                })
                .then(res => res.json())
                .then(() => {
                    // Server will broadcast GAME_ACCEPTED to both players
                })
                .catch(err => {
                    console.error('Erreur lors de l\'acceptation:', err);
                    alert('Erreur lors de l\'acceptation de l\'invitation');
                });
            }
        });
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
