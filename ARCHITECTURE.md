# Architecture du Projet - Jeu de Dames

## Vue d'ensemble

Ce projet utilise une architecture **hybride** combinant WebSockets pour la communication temps réel et des endpoints REST pour les actions métier.

## Architecture Réseau

### 1. Canal Lobby (Général)
- **WebSocket général** : Tous les utilisateurs connectés partagent ce canal
- Utilisé pour :
  - Voir la liste des utilisateurs en ligne
  - Recevoir les invitations à jouer
  - Notifications de statut des utilisateurs

### 2. Canaux de Jeu (Spécifiques)
- **WebSocket par partie** : Chaque partie a son propre canal WebSocket
- Utilisé pour :
  - Recevoir les mises à jour de mouvements en temps réel
  - Recevoir les messages de chat
  - Recevoir les notifications d'événements de jeu

## Flux de Jeu

### 1. Connexion au Lobby
1. L'utilisateur se connecte et s'authentifie
2. Le client établit une connexion WebSocket générale
3. Le client envoie `LOBBY_JOIN` via WebSocket
4. Le serveur renvoie la liste des utilisateurs connectés

### 2. Invitation à Jouer
1. Le joueur A clique sur le joueur B pour l'inviter
2. **POST /api/games** - Création de la partie
   ```json
   {
     "player1Id": "A",
     "player2Id": "B"
   }
   ```
3. Le serveur crée la partie et **broadcaste via le canal lobby** l'invitation au joueur B
4. Le joueur B reçoit l'invitation via WebSocket `GAME_INVITATION`

### 3. Acceptation de l'Invitation
1. Le joueur B accepte l'invitation (confirm dialog)
2. **POST /api/games/:gameId/accept** - Acceptation
   ```json
   {
     "userId": "B"
   }
   ```
3. Le serveur met à jour le statut de la partie
4. Le serveur **broadcaste `GAME_ACCEPTED`** aux deux joueurs via le canal lobby
5. Les deux joueurs sont redirigés vers `game.html?gameId=X`

### 4. Rejoindre la Partie
1. Les joueurs arrivent sur la page de jeu
2. Le client établit une connexion WebSocket pour cette partie
3. Le client envoie `GAME_JOIN` via WebSocket
4. Le serveur ajoute les WebSockets au room de la partie
5. Le serveur renvoie l'état initial du jeu `GAME_STATE`

### 5. Jouer un Coup
1. Le joueur fait un mouvement sur le plateau
2. **POST /api/games/:gameId/move** - Envoi du mouvement
   ```json
   {
     "userId": "A",
     "from": { "row": 2, "col": 1 },
     "to": { "row": 3, "col": 2 }
   }
   ```
3. Le serveur valide le mouvement
4. Le serveur enregistre le mouvement dans la DB
5. Le serveur **broadcaste `GAME_MOVE`** à tous les joueurs du room via WebSocket
6. Tous les clients mettent à jour leur plateau

### 6. Chat
1. Le joueur envoie un message dans le chat
2. **POST /api/games/:gameId/chat** - Envoi du message
   ```json
   {
     "userId": "A",
     "message": "Bon coup!"
   }
   ```
3. Le serveur enregistre le message dans la DB
4. Le serveur **broadcaste `CHAT_MESSAGE`** à tous les joueurs du room via WebSocket
5. Tous les clients affichent le message

## Structures de Données (Serveur)

### userConnections
```javascript
Map<userId, {
  ws: WebSocket,
  status: 'online' | 'offline',
  lastMessageTime: number,
  messageCount: number
}>
```
- Stocke la connexion WebSocket principale de chaque utilisateur
- Utilisé pour envoyer des invitations et notifications

### lobbyUsers
```javascript
Map<userId, WebSocket>
```
- Stocke les utilisateurs actuellement dans le lobby
- Utilisé pour broadcaster les mises à jour du lobby

### gameRooms
```javascript
Map<gameId, Set<WebSocket>>
```
- Stocke les WebSockets connectés à chaque partie
- Utilisé pour broadcaster les événements de jeu

## Messages WebSocket

### Canal Lobby
| Type | Direction | Description |
|------|-----------|-------------|
| `AUTH` | Client → Serveur | Authentification avec token JWT |
| `AUTH_SUCCESS` | Serveur → Client | Confirmation d'authentification |
| `LOBBY_JOIN` | Client → Serveur | Rejoindre le lobby |
| `LOBBY_UPDATE` | Serveur → Client | Liste des utilisateurs en ligne |
| `USER_STATUS` | Serveur → Client | Changement de statut d'un utilisateur |
| `GAME_INVITATION` | Serveur → Client | Invitation à jouer |
| `GAME_ACCEPTED` | Serveur → Client | Invitation acceptée, redirection |

### Canal de Jeu
| Type | Direction | Description |
|------|-----------|-------------|
| `GAME_JOIN` | Client → Serveur | Rejoindre une partie |
| `GAME_STATE` | Serveur → Client | État initial de la partie |
| `PLAYER_JOINED` | Serveur → Client | Un joueur a rejoint |
| `GAME_MOVE` | Serveur → Client | Broadcast d'un mouvement |
| `CHAT_MESSAGE` | Serveur → Client | Broadcast d'un message chat |
| `VIEWER_COUNT_UPDATE` | Serveur → Client | Nombre de spectateurs |

## Endpoints REST

### Authentification
- `POST /api/register` - Inscription
- `POST /api/login` - Connexion
- `POST /api/verify` - Vérification du token

### Utilisateurs
- `GET /api/user/:userId` - Infos utilisateur

### Parties
- `GET /api/games/:userId` - Liste des parties d'un utilisateur
- `POST /api/games` - Créer une partie (envoie invitation)
- `POST /api/games/:gameId/accept` - Accepter une invitation
- `POST /api/games/:gameId/move` - Faire un mouvement
- `POST /api/games/:gameId/chat` - Envoyer un message

## Avantages de cette Architecture

1. **Séparation des préoccupations**
   - REST pour les actions métier (création, validation)
   - WebSocket pour les notifications temps réel

2. **Scalabilité**
   - Les endpoints REST peuvent être mis en cache
   - Les WebSockets ne transportent que les notifications

3. **Fiabilité**
   - Les actions importantes (mouvements) passent par REST
   - Validation et autorisation centralisées

4. **Pas de conflits de connexion**
   - Chaque utilisateur a une connexion WebSocket unique
   - Les rooms de jeu sont basées sur les WebSockets, pas les userIds
   - Le refresh d'un utilisateur ne déconnecte pas les autres

## Gestion des Connexions

### Problème Résolu
Le problème initial était que lorsque deux utilisateurs étaient connectés au lobby et que l'un rafraîchissait sa page, l'autre perdait sa connexion. Cela était dû à :
- Les WebSockets étaient stockées par userId dans `userConnections`
- Un refresh créait une nouvelle WebSocket qui remplaçait l'ancienne
- Le système confondait les connexions des différents utilisateurs

### Solution
- `userConnections` : Map<userId, WebSocket> - Une seule connexion par utilisateur
- `lobbyUsers` : Map<userId, WebSocket> - Utilisateurs dans le lobby
- `gameRooms` : Map<gameId, Set<WebSocket>> - WebSockets par partie (pas userIds!)
- Chaque utilisateur a sa propre WebSocket, indépendante des autres
- Les broadcasts utilisent les bonnes structures (lobbyUsers pour le lobby, gameRooms pour les parties)
