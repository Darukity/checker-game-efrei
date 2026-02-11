// ==================== AUTH.JS ====================

function toggleForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    loginForm.classList.toggle('active');
    registerForm.classList.toggle('active');
}

// Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const spinner = document.getElementById('loadingSpinner');

    errorDiv.classList.remove('show');

    if (!username || !password) {
        showError('Veuillez remplir tous les champs', errorDiv);
        return;
    }

    try {
        spinner.classList.remove('hidden');

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(data.error || 'Erreur lors de la connexion', errorDiv);
            return;
        }

        // Stocker le token et les infos utilisateur
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.user.id);
        localStorage.setItem('username', data.user.username);

        // Redirection vers le lobby
        window.location.href = 'lobby.html';
    } catch (err) {
        console.error('Erreur:', err);
        showError('Erreur serveur', errorDiv);
    } finally {
        spinner.classList.add('hidden');
    }
});

// Register Form Handler
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const errorDiv = document.getElementById('registerError');
    const spinner = document.getElementById('loadingSpinner');

    errorDiv.classList.remove('show');

    if (!username || !email || !password) {
        showError('Veuillez remplir tous les champs', errorDiv);
        return;
    }

    if (password.length < 6) {
        showError('Le mot de passe doit contenir au moins 6 caractères', errorDiv);
        return;
    }

    try {
        spinner.classList.remove('hidden');

        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showError(data.error || 'Erreur lors de l\'inscription', errorDiv);
            return;
        }

        // Stocker le token et les infos utilisateur
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.user.id);
        localStorage.setItem('username', data.user.username);

        // Redirection vers le lobby
        window.location.href = 'lobby.html';
    } catch (err) {
        console.error('Erreur:', err);
        showError('Erreur serveur', errorDiv);
    } finally {
        spinner.classList.add('hidden');
    }
});

function showError(message, errorDiv) {
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}
