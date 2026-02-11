// ==================== NAVBAR.JS ====================

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

    // Bouton déconnexion
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    wsManager.disconnect();
    window.location.href = 'index.html';
}
