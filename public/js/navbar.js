// ==================== NAVBAR.JS ====================

// Global state for invitations
let currentGlobalInvite = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier l'authentification
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    // Afficher le pseudo
    const userPseudoEl = document.getElementById('userPseudo');
    if (userPseudoEl) {
        userPseudoEl.textContent = username || 'Utilisateur';
    }

    // Connecter WebSocket
    try {
        await wsManager.connect();
    } catch (err) {
        console.error('Erreur connexion WebSocket:', err);
    }

    // Setup global invitation handler (works on all pages except in-game)
    setupGlobalInvitationHandler();

    // Bouton déconnexion
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

function setupGlobalInvitationHandler() {
    // Listen for incoming invitations on the general channel
    wsManager.on('GAME_INVITATION', (data) => {
        console.log('🎯 GAME_INVITATION received globally:', data);
        
        // Don't handle if we're on lobby page (lobby.js handles it)
        if (window.location.pathname.includes('lobby')) {
            console.log('⚠️ On lobby page, skipping navbar handler');
            return;
        }
        
        // Only show invitation if user is NOT currently in a game
        if (wsManager.isInGame()) {
            console.log('⚠️ User is in game, ignoring invitation');
            return;
        }

        handleGlobalInvitation(data);
    });

    // Listen for game accepted (redirect both players)
    wsManager.on('GAME_ACCEPTED', (data) => {
        console.log('✅ Game accepted, redirecting to game:', data.gameId);
        window.location.href = `game.html?gameId=${data.gameId}`;
    });
}

async function handleGlobalInvitation(data) {
    const { fromUserId, invitationId } = data;

    // Get the inviter's username
    try {
        const response = await fetch(`/api/user/${fromUserId}`);
        const inviter = await response.json();

        currentGlobalInvite = { fromUserId, invitationId, inviterName: inviter.username };

        // Show modal
        const modal = document.getElementById('globalInviteModal');
        const inviteText = document.getElementById('globalInviteText');
        
        if (modal && inviteText) {
            inviteText.textContent = `${inviter.username} vous invite à jouer!`;
            modal.classList.remove('hidden');
        } else {
            // Fallback to confirm dialog if modal not available
            const accept = confirm(`${inviter.username} vous invite à jouer! Accepter?`);
            if (accept) {
                acceptGlobalInvitation();
            }
        }
    } catch (err) {
        console.error('Erreur lors de la récupération des infos de l\'inviteur:', err);
    }
}

async function acceptGlobalInvitation() {
    if (!currentGlobalInvite) return;

    try {
        const response = await fetch(`/api/invitations/${currentGlobalInvite.invitationId}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                userId: parseInt(localStorage.getItem('userId'))
            })
        });

        if (response.ok) {
            // Server will send GAME_ACCEPTED event to both players
            // which will redirect them to the game page
            closeGlobalInviteModal();
        } else {
            alert('Erreur lors de l\'acceptation de l\'invitation');
        }
    } catch (err) {
        console.error('Erreur:', err);
        alert('Erreur lors de l\'acceptation de l\'invitation');
    }
}

async function rejectGlobalInvitation() {
    if (!currentGlobalInvite) return;

    try {
        const response = await fetch(`/api/invitations/${currentGlobalInvite.invitationId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                userId: parseInt(localStorage.getItem('userId'))
            })
        });

        if (response.ok) {
            closeGlobalInviteModal();
            console.log('✅ Invitation refusée');
        } else {
            alert('Erreur lors du refus de l\'invitation');
        }
    } catch (err) {
        console.error('Erreur:', err);
        alert('Erreur lors du refus de l\'invitation');
    }
}

function closeGlobalInviteModal() {
    const modal = document.getElementById('globalInviteModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentGlobalInvite = null;
}

// Make functions globally available
window.acceptGlobalInvitation = acceptGlobalInvitation;
window.rejectGlobalInvitation = rejectGlobalInvitation;
window.closeGlobalInviteModal = closeGlobalInviteModal;

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    wsManager.disconnect();
    window.location.href = 'index.html';
}
