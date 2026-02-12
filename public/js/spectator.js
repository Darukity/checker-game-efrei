document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const response = await fetch('/api/games', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const games = await response.json();
        renderGames(games);

    } catch (err) {
        console.error('Erreur chargement parties:', err);
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

    gamesList.innerHTML = games.map(game => `
        <div class="game-card in_progress">
            <div class="game-card-header">
                <span class="game-status in_progress">🎮 En cours</span>
            </div>

            <div class="game-players">
                <div class="player">
                    <div class="player-name">${escapeHtml(game.player1_username)}</div>
                    <div class="player-color player1"></div>
                </div>

                <div class="vs-text">VS</div>

                <div class="player">
                    <div class="player-name">${escapeHtml(game.player2_username)}</div>
                    <div class="player-color player2"></div>
                </div>
            </div>

            <div class="game-info">
                <span>👁️ Spectateurs: <strong>${game.viewer_count}</strong></span>
                <span>🕐 Commencée le ${new Date(game.started_at).toLocaleDateString('fr-FR')}</span>
            </div>

            <div class="game-actions">
                <button class="btn-view" onclick="viewGame(${game.id})">
                    Regarder
                </button>
            </div>
        </div>
    `).join('');
}

function viewGame(gameId) {
    window.location.href = `game.html?gameId=${gameId}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
