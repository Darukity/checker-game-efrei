# Dame Projet - Jeu de Dame en Temps Réel

Application web complète de jeu de Dame avec authentification, système multi-joueurs en temps réel via WebSocket, chat intégré, et système de visualisation des parties.

## 📋 Table des matières

- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage](#démarrage)
- [Architecture](#architecture)
- [Protocole WebSocket](#protocole-websocket)
- [Fonctionnalités](#fonctionnalités)

## 🔧 Prérequis

- Node.js v16+ 
- PostgreSQL 12+
- npm ou yarn
- Docker & Docker Compose (optionnel pour PostgreSQL)

## 📦 Installation

### 1. Variables d'environnement
Créer un fichier `.env` à la racine du projet:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dame_db
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your_secret_key_here_change_in_production
NODE_ENV=development
```

### 2. Installation des dépendances

```bash
npm install
```

### 3. Base de données

#### Option A: Avec Docker Compose

```bash
docker-compose up -d
```

Cela démarre PostgreSQL sur le port 5432 et pgAdmin sur http://localhost:5050

#### Option B: PostgreSQL local

```bash
# Démarrer PostgreSQL localement
# Puis créer la base de données
npm run db:init
```

pgAdmin: http://localhost:5050
- Email: admin@admin.com
- Mot de passe: admin

## 🚀 Démarrage

```bash
# Démarrer le serveur
npm start

# Mode développement (auto-reload)
npm run dev
```

L'application sera accessible sur **http://localhost:3000**

## 🏗️ Architecture

### Stack Technique

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js + Express.js
- **Real-time**: WebSocket (brut)
- **Base de données**: PostgreSQL
- **Admin DB**: pgAdmin
- **Authentification**: JWT (localStorage)

### Structure

```
Dame_Projet/
├── public/              # Assets statiques
│   ├── index.html      # Login/Register
│   ├── lobby.html      # Liste d'adversaires
│   ├── game.html       # Jeu de Dame
│   ├── myGames.html    # Mes parties
│   ├── css/
│   └── js/
├── src/
│   ├── server.js       # Serveur principal
│   ├── routes/         # Endpoints HTTP
│   └── db/             # Configuration BD
├── docker-compose.yml
└── package.json
```

## 🔌 Protocole WebSocket

### Format des messages

Tous les messages JSON incluent:

```json
{
  "type": "string",
  "data": {}
}
```

### Types de messages

- **USER_STATUS**: État de connexion
- **LOBBY_UPDATE**: Liste des adversaires
- **GAME_MOVE**: Mouvement dans le jeu
- **CHAT_MESSAGE**: Message de chat
- **INVITE_GAME**: Invitation de partie
- **GAME_END**: Fin de partie

[→ Voir WEBSOCKET_PROTOCOL.md pour les détails complets]

## ✨ Fonctionnalités

### Authentification
- ✅ Login/Register avec POST
- ✅ Token JWT stocké en localStorage
- ✅ Vérification du token avant chaque action

### Interface
- ✅ Navbar sur toutes les pages (titre, pseudo, boutons, déconnexion)
- ✅ Redirection automatique vers Liste d'adversaires après login

### Lobby (Liste d'adversaires)
- ✅ WebSocket brut pour liste en temps réel
- ✅ Indication du statut (connecté/déconnecté/reconnexion en cours)
- ✅ Invitations de partie aux utilisateurs en ligne

### Jeu de Dame
- ✅ Logique complète du jeu
- ✅ Système de visualization (icones + compteur de viewers)
- ✅ Chat intégré en temps réel
- ✅ État synchronisé entre les joueurs via WebSocket

### Mes Parties
- ✅ Liste des parties en cours et terminées
- ✅ Continuer une partie en cours
- ✅ Invitation à l'autre joueur avec reconnexion auto si en ligne

### Sécurité
- ✅ Limite de taille des messages (8KB)
- ✅ Rate limiting par utilisateur
- ✅ Validation des messages JSON
- ✅ Authentification JWT requise
- ✅ Autorisation sur les actions (droits du joueur)

## 📚 Documentation

- [WEBSOCKET_PROTOCOL.md](./doc/WEBSOCKET_PROTOCOL.md) - Protocole d'échange détaillé
- [API.md](./doc/API.md) - Endpoints HTTP
- [DATABASE.md](./doc/DATABASE.md) - Schéma et migrations

## 🐛 Dépannage

### Port 3000 déjà utilisé
```bash
lsof -i :3000  # Voir quel processus
kill -9 <PID>
```

### Erreur de connexion à PostgreSQL
- Vérifier que PostgreSQL est lancé
- Vérifier les credentials dans `.env`
- `docker-compose logs postgres` pour les détails

### WebSocket refuse la connexion
- Vérifier que le serveur est lancé
- Vérifier la console du navigateur (F12)
- Vérifier que le token JWT est présent en localStorage

---

**Auteur**: Loris  
**Dernière mise à jour**: Février 2026
