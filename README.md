# Dame Projet - Jeu de Dame en Temps Réel

Application web complète de jeu de Dame avec authentification, système multi-joueurs en temps réel via WebSocket, chat intégré, et système de visualisation des parties.

## 📋 Table des matières

- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage](#démarrage)
- [Structure du Projet](#structure-du-projet)
- [Architecture](#architecture)
- [Flux de Communication](#flux-de-communication)
- [Protocole WebSocket](#protocole-websocket)
- [Fonctionnalités](#fonctionnalités)
- [Dépannage](#dépannage)

## 🔧 Prérequis

- Node.js v16+ 
- PostgreSQL 12+
- npm ou yarn
- Docker & Docker Compose (optionnel)

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

#### Option A: Avec Docker Compose (Recommandé)

```bash
# Démarrer tous les services (PostgreSQL + pgAdmin + App)
docker-compose up -d

# Ou seulement PostgreSQL et pgAdmin
docker-compose up -d postgres pgadmin
```

Accès:
- **Application**: http://localhost:3000
- **pgAdmin**: http://localhost:5050
  - Email: `admin@admin.com`
  - Mot de passe: `admin`
- **PostgreSQL**: localhost:5432

#### Option B: PostgreSQL local

```bash
# 1. Installer et démarrer PostgreSQL localement

# 2. Créer la base et les tables
npm run db:init
```

## 🚀 Démarrage

### Avec Docker Compose

```bash
# Démarrer tous les services
docker-compose up -d

# Voir les logs
docker-compose logs -f app

# Arrêter les services
docker-compose down
```

### Sans Docker

```bash
# 1. S'assurer que PostgreSQL est démarré

# 2. Initialiser la base de données (première fois uniquement)
npm run db:init

# 3. Démarrer le serveur
npm start

# Ou en mode développement (auto-reload)
npm run dev
```

L'application sera accessible sur **http://localhost:3000**

## 📁 Structure du Projet

```
checker-game-efrei/
├── public/                         # Frontend (assets statiques)
│   ├── index.html                 # Page d'accueil / Login / Register
│   ├── lobby.html                 # Liste des adversaires en ligne
│   ├── game.html                  # Interface de jeu
│   ├── myGames.html               # Liste des parties de l'utilisateur
│   ├── spectator.html             # Observer des parties en cours
│   │
│   ├── css/                       # Styles CSS
│   │   ├── auth.css              # Styles authentification
│   │   ├── game.css              # Styles plateau de jeu
│   │   ├── lobby.css             # Styles lobby
│   │   ├── main.css              # Styles globaux
│   │   ├── myGames.css           # Styles liste parties
│   │   └── navbar.css            # Styles navigation
│   │
│   └── js/                        # Scripts JavaScript
│       ├── auth.js               # Gestion authentification
│       ├── game.js               # Point d'entrée jeu
│       ├── lobby.js              # Gestion lobby
│       ├── myGames.js            # Gestion mes parties
│       ├── navbar.js             # Navigation
│       ├── spectator.js          # Mode spectateur
│       ├── websocket.js          # Client WebSocket (Singleton)
│       │
│       └── modules/              # Modules du jeu
│           ├── boardRenderer.js  # Rendu du plateau
│           ├── gameState.js      # État du jeu
│           ├── moveLogic.js      # Logique des mouvements
│           ├── uiHandlers.js     # Gestionnaires UI
│           └── wsEventHandlers.js # Événements WebSocket
│
├── src/                           # Backend (Node.js)
│   ├── server.js                 # Serveur principal (Express + WebSocket)
│   │
│   ├── db/                       # Base de données
│   │   ├── init.js              # Initialisation BD (tables)
│   │   └── pool.js              # Pool de connexions PostgreSQL
│   │
│   ├── routes/                   # Routes HTTP (API REST)
│   │   └── api.js               # Tous les endpoints REST
│   │
│   ├── services/                 # Logique métier
│   │   ├── checkersEngine.js   # Moteur de jeu (règles Dame)
│   │   └── userService.js      # Gestion utilisateurs
│   │
│   ├── utils/                    # Utilitaires
│   │   ├── auth.js             # JWT (génération/vérification)
│   │   ├── game.js             # Helpers jeu (broadcast, init)
│   │   └── validation.js       # Validation données
│   │
│   └── websocket/                # WebSocket
│       ├── connection.js        # Configuration WebSocket
│       └── handlers.js          # Gestionnaires messages WS
│
├── docker-compose.yml             # Configuration Docker
├── Dockerfile                     # Image Docker de l'app
├── package.json                   # Dépendances Node.js
├── .env                          # Variables d'environnement (à créer)
├── ARCHITECTURE.md                # Documentation architecture
└── README.md                      # Ce fichier

```

## 🏗️ Architecture

### Stack Technique

- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, CSS3
- **Backend**: Node.js + Express.js
- **Real-time**: WebSocket natif (ws library)
- **Base de données**: PostgreSQL 15
- **Admin DB**: pgAdmin 4
- **Authentification**: JWT (stocké en localStorage)
- **Conteneurisation**: Docker & Docker Compose

### Composants Principaux

#### Backend (src/)
- **server.js**: Serveur HTTP/WebSocket, point d'entrée
- **routes/api.js**: 15+ endpoints REST (auth, games, invitations, moves, chat)
- **websocket/**: Gestion temps réel (AUTH, LOBBY, GAME_JOIN, MOVE, etc.)
- **services/checkersEngine.js**: Logique du jeu (règles, validation, détection victoire)
- **db/**: Pool PostgreSQL + scripts d'initialisation

#### Frontend (public/)
- **websocket.js**: Client WebSocket Singleton avec reconnexion automatique
- **lobby.js**: Liste utilisateurs en ligne + invitations
- **game.js**: Coordination modules de jeu
- **modules/**: Découpage modulaire (état, rendu, logique, handlers)

### Schéma de Base de Données

```sql
users (id, username, email, password, online_status, created_at)
games (id, player1_id, player2_id, status, game_state, current_turn, winner_id, created_at, started_at, ended_at)
game_moves (id, game_id, player_id, from_row, from_col, to_row, to_col, created_at)
game_invitations (id, from_user_id, to_user_id, status, created_at)
game_viewers (id, game_id, user_id, joined_at)
chat_messages (id, game_id, user_id, message, created_at)
```

## 📡 Flux de Communication

### 1. Flux d'Authentification

```
CLIENT (index.html)                  SERVER (api.js)
     │                                     │
     ├─── POST /api/register ───────────> │
     │    (username, email, password)     │
     │                                     ├─── Hash password (bcrypt)
     │                                     ├─── INSERT INTO users
     │ <─── 201 { token, user } ──────────┤
     │                                     │
     ├─── localStorage.setItem('token')   │
     ├─── localStorage.setItem('userId')  │
     │                                     │
     └─── redirect to lobby.html          │
```

### 2. Flux Lobby (Liste d'adversaires)

#### 2.1. Connexion WebSocket
```
CLIENT (websocket.js)                SERVER (handlers.js)
     │                                     │
     ├─── WS Connect ws://localhost:3000 ─> │
     │                                     │
     ├─── AUTH { token } ───────────────> │
     │                                     ├─── verifyToken(token)
     │                                     ├─── userConnections.set(userId, ws)
     │                                     ├─── updateUserStatus(userId, 'online')
     │                                     ├─── lobbyUsers.set(userId, ws) [auto LOBBY_JOIN]
     │                                     │
     │ <─── AUTH_SUCCESS { userId } ──────┤
     │ <─── LOBBY_UPDATE { users } ───────┤ (liste complète)
     │                                     │
     │                                     ├─── broadcast to others
     │                                     └─── USER_STATUS { userId, status: 'online' }
```

#### 2.2. Invitation de Partie
```
CLIENT (lobby.js)                    SERVER (api.js + handlers.js)
     │                                     │
     ├─── POST /api/games/invite ────────> │
     │    { player1Id, player2Id }         │
     │                                     ├─── INSERT INTO game_invitations
     │                                     │    (status: 'pending')
     │                                     │
     │                                     ├─── Find player2's WebSocket
     │                                     └─── WS: GAME_INVITATION { fromUserId, invitationId }
     │                                            ↓
     │                                       [Player 2]
     │                                            │
     │                                            ├─── Show modal
     │                                            │
     │                                            ├─── POST /api/invitations/:id/accept
     │                                            │    { userId }
     │                                            │
     │                                            ├─── INSERT INTO games (status: 'in_progress')
     │                                            │    UPDATE game_invitations SET status = 'accepted'
     │                                            │
     │                                            └─── WS broadcast to both players
     │ <─── GAME_ACCEPTED { gameId } ─────────────────┤
[Player 1] <─── GAME_ACCEPTED { gameId } ─────────┤
     │                                     │
     └─── redirect to game.html?gameId=X  │
```

### 3. Flux Jeu (Game Flow)

#### 3.1. Rejoindre une Partie
```
CLIENT (game.js)                     SERVER (handlers.js)
     │                                     │
     ├─── WS already connected            │
     │    (from lobby, persistent)         │
     │                                     │
     ├─── GAME_JOIN { gameId } ──────────> │
     │                                     ├─── gameRooms.get(gameId).add(ws)
     │                                     ├─── SELECT * FROM games WHERE id = gameId
     │                                     ├─── UPDATE users SET online_status = 'in_game'
     │                                     │
     │ <─── GAME_STATE { gameData } ───────┤
     │      (board, currentTurn, players)   │
     │                                     │
     ├─── VIEW_GAME { gameId } ──────────> │
     │                                     ├─── INSERT INTO game_viewers
     │                                     └─── broadcast VIEWER_COUNT_UPDATE
     │                                     │
     ├─── GAME_START { gameId } ─────────> │
     │    (si pas déjà started)            │
     │                                     ├─── UPDATE games SET status='in_progress',
     │                                     │    current_turn=1, started_at=NOW()
     │                                     │
     │ <─── GAME_STATE (updated) ──────────┤
     │ <─── GAME_START { gameId } ─────────┤ (broadcast to room)
```

#### 3.2. Effectuer un Mouvement
```
CLIENT (moveLogic.js)                SERVER (api.js + checkersEngine.js)
     │                                     │
     ├─── POST /api/games/:gameId/move ──> │
     │    { userId, from: {row, col},      │
     │      to: {row, col} }               │
     │                                     ├─── SELECT * FROM games WHERE id = gameId
     │                                     ├─── Verify user is player
     │                                     ├─── validateAndApplyMove(gameData, userId, from, to)
     │                                     │    • Check if correct turn
     │                                     │    • Validate move (diagonal, capture, etc.)
     │                                     │    • Apply move to board
     │                                     │    • Check for king promotion
     │                                     │    • Detect captures
     │                                     │    • Switch turn
     │                                     │    • Check for winner
     │                                     │
     │                                     ├─── BEGIN TRANSACTION
     │                                     ├───   UPDATE games SET game_state, current_turn
     │                                     │     [+ status='finished', winner_id if game over]
     │                                     ├───   INSERT INTO game_moves
     │                                     ├─── COMMIT
     │                                     │
     │                                     └─── WS broadcast to gameRoom
     │ <─── GAME_STATE (updated) ──────────────── { board, currentTurn, winner }
[All players in room]                     │
     │                                     │
     └─── renderBoard()                   │
          updateTurnIndicator()            │
          [if winner: show modal]          │
```

#### 3.3. Chat en Temps Réel
```
CLIENT (uiHandlers.js)               SERVER (api.js)
     │                                     │
     ├─── POST /api/games/:gameId/chat ──> │
     │    { userId, message }              │
     │                                     ├─── INSERT INTO chat_messages
     │                                     │
     │                                     └─── WS broadcast to gameRoom
     │ <─── CHAT_MESSAGE ──────────────────────── { userId, message, createdAt }
[All in room]                             │
     │                                     │
     └─── appendMessage(username, msg)    │
```

#### 3.4. Abandon de Partie
```
CLIENT (uiHandlers.js)               SERVER (api.js)
     │                                     │
     ├─── POST /api/games/:gameId/abandon ─> │
     │    { userId }                       │
     │                                     ├─── SELECT * FROM games WHERE id = gameId
     │                                     ├─── Determine winner (opponent)
     │                                     ├─── UPDATE games SET status='finished',
     │                                     │    winner_id=winnerId, ended_at=NOW()
     │                                     │
     │                                     └─── WS broadcast to both players
     │ <─── GAME_ABANDONED ────────────────────── { winnerId, message }
[Both players]                            │
     │                                     │
     └─── Show notification modal         │
          redirect or reload               │
```

### 4. Flux Frontend Global

```
┌─────────────────────────────────────────────────────────────┐
│                    WEBSOCKET SINGLETON                       │
│                    (websocket.js)                           │
│  • Persistent connection across all pages                   │
│  • Auto-reconnection (5 attempts)                           │
│  • Heartbeat (PING every 30s)                              │
│  • Event emitter pattern                                    │
│  • Message queue for offline messages                       │
└─────────────────────────────────────────────────────────────┘
     ↓                    ↓                    ↓
┌─────────┐      ┌─────────────┐      ┌─────────────┐
│ LOBBY   │      │    GAME     │      │  SPECTATOR  │
│         │      │             │      │             │
│ • List  │      │ • Board     │      │ • Watch     │
│ • Invite│      │ • Chat      │      │ • Chat      │
│         │      │ • Moves     │      │ • Updates   │
└─────────┘      └─────────────┘      └─────────────┘
     │                    │                    │
     └────────────────────┴────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   navbar.js         │
              │  • User info        │
              │  • Disconnect       │
              │  • Navigation       │
              └─────────────────────┘
```

## 🔌 Protocole WebSocket

### Format des messages

```json
{
  "type": "MESSAGE_TYPE",
  "data": {},
  "token": "jwt_token_here"
}
```

### Messages Client → Serveur

| Type | Data | Description |
|------|------|-------------|
| `AUTH` | `{ token }` | Authentification initiale |
| `LOBBY_JOIN` | `{}` | Rejoindre le lobby (auto après AUTH) |
| `GAME_JOIN` | `{ gameId }` | Rejoindre une partie |
| `GAME_START` | `{ gameId }` | Démarrer une partie |
| `GAME_LEAVE` | `{ gameId }` | Quitter une partie |
| `VIEW_GAME` | `{ gameId }` | Observer une partie (spectateur) |
| `PING` | `{}` | Heartbeat (keep-alive) |

### Messages Serveur → Client

| Type | Data | Description |
|------|------|-------------|
| `AUTH_SUCCESS` | `{ userId }` | Authentification réussie |
| `AUTH_ERROR` | `{ message }` | Échec authentification |
| `LOBBY_UPDATE` | `{ users: [] }` | Liste complète utilisateurs en ligne |
| `USER_STATUS` | `{ userId, status }` | Changement statut utilisateur |
| `GAME_INVITATION` | `{ fromUserId, invitationId }` | Invitation reçue |
| `GAME_ACCEPTED` | `{ gameId }` | Invitation acceptée |
| `GAME_INVITATION_REJECTED` | `{ invitationId }` | Invitation refusée |
| `GAME_STATE` | `{ gameData }` | État complet du jeu |
| `GAME_START` | `{ gameId }` | Partie démarrée |
| `PLAYER_JOINED` | `{ userId, gameId }` | Joueur a rejoint |
| `PLAYER_LEFT` | `{ userId, gameId }` | Joueur a quitté |
| `GAME_LEAVE_SUCCESS` | `{ gameId }` | Confirmation sortie partie |
| `GAME_ABANDONED` | `{ winnerId, message }` | Partie abandonnée |
| `VIEWER_COUNT_UPDATE` | `{ gameId, count }` | Nombre spectateurs |
| `CHAT_MESSAGE` | `{ userId, message, createdAt }` | Message de chat |
| `ERROR` | `{ message }` | Erreur générique |

### Espaces de Noms (Namespaces)

Le serveur utilise deux espaces logiques:

1. **Lobby (General Channel)**: `lobbyUsers` Map
   - Tous les utilisateurs connectés et authentifiés
   - Reçoit `USER_STATUS`, `LOBBY_UPDATE`, `GAME_INVITATION`
   
2. **Game Rooms**: `gameRooms` Map (gameId → Set<WebSocket>)
   - Utilisateurs dans une partie spécifique
   - Reçoit `GAME_STATE`, `CHAT_MESSAGE`, `VIEWER_COUNT_UPDATE`
   - Un utilisateur peut être dans les deux simultanément

## ✨ Fonctionnalités

### 🔐 Authentification
- ✅ Login/Register avec validation
- ✅ Token JWT stocké en localStorage
- ✅ Hachage bcrypt des mots de passe
- ✅ Vérification token avant chaque action
- ✅ Auto-reconnexion WebSocket

### 🎨 Interface
- ✅ Navbar responsive sur toutes les pages
- ✅ Design moderne et intuitif
- ✅ Indicateurs de statut en temps réel
- ✅ Modaux pour invitations et notifications
- ✅ Messages d'erreur contextuels

### 🏠 Lobby (Liste d'adversaires)
- ✅ Liste utilisateurs en ligne en temps réel
- ✅ Statut: Disponible / En Partie / Hors ligne
- ✅ Système d'invitations avec acceptation/refus
- ✅ Mises à jour instantanées via WebSocket
- ✅ Filtrage automatique (masque utilisateurs en partie)

### 🎮 Jeu de Dame
- ✅ **Règles complètes du jeu de Dame**:
  - Mouvements diagonaux
  - Captures obligatoires (simple et multiple)
  - Promotion en Dame (roi)
  - Dames peuvent se déplacer/capturer en arrière
  - Détection automatique de victoire
- ✅ Plateau 8×8 avec rendu visuel
- ✅ Indication du tour (Joueur 1 / Joueur 2)
- ✅ Validation côté serveur (anti-triche)
- ✅ Synchronisation temps réel entre joueurs
- ✅ Chat intégré
- ✅ Abandon de partie
- ✅ Historique des mouvements en BD

### 👀 Mode Spectateur
- ✅ Observer parties en cours
- ✅ Compteur de spectateurs
- ✅ Mises à jour en temps réel
- ✅ Lecture seule (pas d'interaction avec le jeu)

### 📜 Mes Parties
- ✅ Liste complète des parties (en cours + terminées)
- ✅ Informations: adversaire, statut, date, gagnant
- ✅ Accès direct aux parties en cours
- ✅ Compteur de spectateurs par partie

### 🛡️ Sécurité
- ✅ Rate limiting (max 30 msg/min par utilisateur)
- ✅ Limite taille messages (8KB)
- ✅ Validation JSON stricte
- ✅ Authentification JWT sur tous les endpoints
- ✅ Autorisation par rôle (joueur/spectateur)
- ✅ Protection CORS
- ✅ Nettoyage automatique connexions mortes

## 📚 API REST Endpoints

### Authentification
- `POST /api/register` - Créer un compte
- `POST /api/login` - Se connecter
- `POST /api/verify` - Vérifier un token
- `GET /api/user/:userId` - Infos utilisateur

### Utilisateurs
- `GET /api/users/online` - Liste utilisateurs en ligne

### Parties
- `GET /api/games` - Parties en cours (spectateur)
- `GET /api/games/:userId` - Mes parties
- `POST /api/games/invite` - Inviter un joueur
- `POST /api/games/:gameId/move` - Effectuer un mouvement
- `POST /api/games/:gameId/abandon` - Abandonner

### Invitations
- `POST /api/invitations/:invitationId/accept` - Accepter
- `POST /api/invitations/:invitationId/reject` - Refuser

### Chat
- `POST /api/games/:gameId/chat` - Envoyer un message

## 🐛 Dépannage

### Port 3000 déjà utilisé (Windows)
```powershell
# Trouver le processus utilisant le port
netstat -ano | findstr :3000

# Tuer le processus (remplacer PID par le numéro trouvé)
taskkill /PID <PID> /F
```

### Port 3000 déjà utilisé (Linux/Mac)
```bash
# Trouver et tuer le processus
lsof -ti:3000 | xargs kill -9
```

### Erreur de connexion à PostgreSQL
```bash
# Vérifier que PostgreSQL tourne
docker-compose ps

# Voir les logs
docker-compose logs postgres

# Restart propre
docker-compose down
docker-compose up -d postgres

# Vérifier les credentials dans .env
```

### WebSocket refuse la connexion
1. Vérifier que le serveur est démarré (`npm start`)
2. Ouvrir la console navigateur (F12)
3. Vérifier le token: `localStorage.getItem('token')`
4. Recharger la page et observer les logs WebSocket
5. Vérifier le statut: `wsManager.isReady()`

### La base ne s'initialise pas
```bash
# Réinitialiser complètement
docker-compose down -v  # Supprime volumes
docker-compose up -d postgres
npm run db:init

# Ou avec Docker complet
docker-compose down -v
docker-compose up -d --build
```

### Les mouvements ne fonctionnent pas
1. Vérifier que c'est votre tour (indicateur en haut)
2. Vérifier les logs navigateur (F12)
3. Vérifier les logs serveur
4. S'assurer que la partie est démarrée (`status: 'in_progress'`)

### Déconnexions fréquentes
- Vérifier la connexion réseau
- Le heartbeat envoie un PING toutes les 30s
- Max 5 tentatives de reconnexion automatique
- Vérifier les logs serveur pour erreurs

## 🔧 Scripts NPM

```bash
npm start              # Démarrer le serveur (production)
npm run dev            # Mode développement avec nodemon
npm run db:init        # Initialiser la base de données
npm run db:reset       # Réinitialiser la base (si implémenté)
```

## 🐳 Commandes Docker

```bash
# Démarrer tout
docker-compose up -d

# Voir les logs
docker-compose logs -f
docker-compose logs -f app        # Seulement l'app
docker-compose logs -f postgres   # Seulement PostgreSQL

# Redémarrer un service
docker-compose restart app

# Arrêter tout
docker-compose down

# Arrêter et supprimer volumes (reset complet)
docker-compose down -v

# Rebuild après changement Dockerfile
docker-compose up -d --build
```

## 📖 Règles du Jeu de Dame

1. **Mouvement de base**: Les pions se déplacent en diagonal d'une case vers l'avant
2. **Capture**: Si un pion adverse est sur une diagonale adjacente avec une case vide derrière, capture obligatoire
3. **Captures multiples**: Si après une capture, une autre capture est possible, elle doit être effectuée
4. **Dame (promotion)**: Un pion atteignant la dernière rangée devient une Dame (roi)
5. **Mouvement Dame**: Les Dames peuvent se déplacer en diagonal avant et arrière
6. **Victoire**: Capturer tous les pions adverses ou bloquer tous leurs mouvements

## 🤝 Contribution

Ce projet est développé dans le cadre d'un cours EFREI. Pour contribuer:
1. Fork le projet
2. Créer une branche (`git checkout -b feature/amelioration`)
3. Commit les changements (`git commit -m 'Ajout fonctionnalité'`)
4. Push vers la branche (`git push origin feature/amelioration`)
5. Ouvrir une Pull Request

## 📝 Licence

MIT License - Voir le fichier LICENSE pour plus de détails

---

**Auteur**: Loris  
**Établissement**: EFREI Paris  
**Dernière mise à jour**: Février 2026  
**Version**: 1.0.0

