// ==================== MYGAMES.JS ====================

document.addEventListener('DOMContentLoaded', async () => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');

    // Charger les parties de l'utilisateur
    try {
        const response = await fetch(`/api/games/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const games = await response.json();
        renderGames(games);
    } catch (err) {
        console.error('Erreur lors du chargement des parties:', err);
        document.getElementById('errorAlert').textContent = 'Erreur lors du chargement des parties';
        document.getElementById('errorAlert').classList.remove('hidden');
    }
});

function renderGames(games) {
    const gamesList = document.getElementById('gamesList');
    const emptyState = document.getElementById('emptyState');

    if (!games || games.length === 0) {
        gamesList.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    gamesList.classList.remove('hidden');
    emptyState.classList.add('hidden');

    gamesList.innerHTML = games.map(game => {
        const statusText = getStatusText(game.status, game.winner_username);
        const statusClass = game.status;
        const createdDate = new Date(game.created_at).toLocaleDateString('fr-FR');

        return `
            <div class="game-card ${statusClass}">
                <div class="game-card-header">
                    <span class="game-status ${statusClass}">${statusText}</span>
                </div>

                <div class="game-players">
                    <div class="player">
                        <div class="player-name">${escapeHtml(game.player1_username)}</div>
                        <div class="player-color player1"></div>
                    </div>
                    <div class="vs-text">VS</div>
                    <div class="player">
                        <div class="player-name">${game.player2_username ? escapeHtml(game.player2_username) : 'En attente'}</div>
                        <div class="player-color player2"></div>
                    </div>
                </div>

                <div class="game-info">
                    <span>👥 Spectateurs: <strong>${game.viewer_count}</strong></span>
                    ${game.started_at ? `<span>🕐 Commencée le ${new Date(game.started_at).toLocaleDateString('fr-FR')}</span>` : ''}
                </div>

                <div class="game-date">
                    Créée le ${createdDate}
                </div>

                <div class="game-actions">
                    ${game.status === 'in_progress' ? `
                        <button class="btn-continue" onclick="continueGame(${game.id})">Continuer</button>
                        <button class="btn-view" onclick="viewGame(${game.id})">Regarder</button>
                    ` : game.status === 'waiting_for_opponent' ? `
                        <button class="btn-continue" onclick="inviteOpponent(${game.id})">Inviter adversaire</button>
                    ` : `
                        <button class="btn-view" onclick="viewGame(${game.id})">Voir la partie</button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function getStatusText(status, winnerUsername) {
    if (status === 'finished' && winnerUsername) {
        return `🏆 Victoire de ${escapeHtml(winnerUsername)}`;
    }
    
    const statusMap = {
        'waiting_for_opponent': '⏳ En attente',
        'in_progress': '🎮 En cours',
        'finished': '✅ Terminée',
        'completed': '✅ Terminée' // Backward compatibility
    };
    return statusMap[status] || status;
}

function continueGame(gameId) {
    window.location.href = `game.html?gameId=${gameId}`;
}

function viewGame(gameId) {
    window.location.href = `game.html?gameId=${gameId}`;
}

function inviteOpponent(gameId) {
    // Rediriger vers la page de jeu qui gérera l'invitation
    window.location.href = `game.html?gameId=${gameId}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
