# Architecture Implementation - WebSocket Dual-Channel System

## 📋 Overview

This document describes the implementation of the dual-channel WebSocket architecture for the checker game application, ensuring users maintain persistent connection to a general channel while optionally connecting to game-specific rooms.

## 🎯 Architecture Goals

1. **General Channel Persistence**: All authenticated users remain connected to a general channel at all times
2. **Game Namespace Support**: Users can join game-specific rooms while maintaining general channel connection
3. **Cross-Page Invitations**: Users can receive game invitations on any page (except when actively in a game)
4. **Automatic Channel Management**: Server automatically manages channel membership

## 🏗️ Implementation Details

### Server-Side Changes

#### 1. Automatic General Channel Membership (`src/websocket/connection.js`)

```javascript
// Users automatically join general channel after authentication
case 'AUTH':
  userId = await handleAuth(ws, msgData);
  if (userId) {
    await handleLobbyJoin(ws, userId); // Auto-join general channel
  }
  break;
```

**Key Changes:**
- Removed `isInLobby` flag - users are always in general channel once authenticated
- Deprecated `LOBBY_LEAVE` - users only leave general channel on disconnect
- Added `GAME_LEAVE` message type for leaving game rooms

#### 2. Dual-Channel Connection Management (`src/websocket/handlers.js`)

**General Channel (lobbyUsers Map):**
- Stores all authenticated users
- Persists across page navigation
- Used for broadcasting invitations and status updates

**Game Rooms (gameRooms Map):**
- Stores users actively in a specific game
- Users can be in both general channel AND a game room simultaneously
- Cleaned up when users leave or disconnect

```javascript
// Example: User joins game room while staying in general channel
async function handleGameJoin(ws, userId, data) {
  // Add to game room (user already in general channel)
  if (!gameRooms.has(gameId)) {
    gameRooms.set(gameId, new Set());
  }
  gameRooms.get(gameId).add(ws);
  // ... send game state
}
```

#### 3. Enhanced Disconnect Handling

```javascript
ws.on('close', async () => {
  // Remove from general channel
  if (lobbyUsers.get(userId) === ws) {
    lobbyUsers.delete(userId);
    broadcastToLobby(lobbyUsers, {
      type: 'USER_STATUS',
      data: { userId, status: 'offline' }
    });
  }
  
  // Remove from game room if present
  if (currentGameId && gameRooms.has(currentGameId)) {
    gameRooms.get(currentGameId).delete(ws);
    broadcastToGameRoom(gameRooms, currentGameId, {
      type: 'PLAYER_DISCONNECTED',
      data: { userId, gameId: currentGameId }
    });
  }
});
```

### Client-Side Changes

#### 1. WebSocket Manager Enhancements (`public/js/websocket.js`)

**New State Tracking:**
```javascript
constructor() {
  // ... existing code
  this.isInGeneralChannel = false; // Track general channel status
  this.currentGameId = null;       // Track current game room
  
  // Auto-connect if user is logged in
  if (localStorage.getItem('token')) {
    this.connect();
  }
}
```

**New Methods:**
```javascript
// Join a game room (game namespace) while staying in general channel
joinGameRoom(gameId) {
  this.currentGameId = gameId;
  this.send('GAME_JOIN', { gameId });
}

// Leave game room while staying in general channel
leaveGameRoom() {
  this.send('GAME_LEAVE', { gameId: this.currentGameId });
  // currentGameId cleared on GAME_LEAVE_SUCCESS
}

// Check if user is in a game (used to filter invitations)
isInGame() {
  return this.currentGameId !== null;
}
```

#### 2. Global Invitation Handler (`public/js/navbar.js`)

**Cross-Page Invitation Support:**
- Loaded on all pages (navbar.js is included everywhere)
- Listens for `GAME_INVITATION` events on general channel
- Automatically ignores invitations when user is in a game
- Shows modal or fallback to confirm dialog

```javascript
function setupGlobalInvitationHandler() {
  wsManager.on('GAME_INVITATION', (data) => {
    // Only show if NOT in game
    if (wsManager.isInGame()) {
      console.log('⚠️ User is in game, ignoring invitation');
      return;
    }
    handleGlobalInvitation(data);
  });
  
  wsManager.on('GAME_ACCEPTED', (data) => {
    // Redirect both players to game
    window.location.href = `game.html?gameId=${data.gameId}`;
  });
}
```

#### 3. Page-Specific Updates

**Lobby Page (`public/js/lobby.js`):**
- Removed manual `LOBBY_JOIN` call (now automatic)
- Uses global invitation modal for consistency

**Game Page (`public/js/modules/wsEventHandlers.js`):**
- Uses `joinGameRoom()` instead of direct `GAME_JOIN` send
- Calls `leaveGameRoom()` when abandoning or when game ends
- Added handlers for `PLAYER_DISCONNECTED` and `PLAYER_LEFT`

**My Games Page (`public/myGames.html`):**
- Added global invitation modal HTML
- Inherits global invitation handler from navbar.js

## 📊 Message Flow Diagrams

### Invitation Flow
```
User1 (Lobby) → Send Invite → POST /api/games
                                     ↓
Server → Create Game → Broadcast GAME_INVITATION → User2 (Any Page)
                                     ↓
User2 → Accept → POST /api/games/:id/accept
                                     ↓
Server → Update Game → Broadcast GAME_ACCEPTED → Both Users
                                     ↓
                      Both Users Redirect to game.html
                                     ↓
                      Users call joinGameRoom(gameId)
                                     ↓
                      Connected to BOTH general + game channels
```

### Connection States
```
User Logs In → AUTH → Server adds to general channel (automatic)
                           ↓
              User stays in general channel across all pages
                           ↓
              Can receive invitations (if not in game)
                           ↓
              User accepts invite → Joins game room
                           ↓
              User now in BOTH channels
                           ↓
              Invitations ignored while in game
                           ↓
              User leaves/abandons → Calls leaveGameRoom()
                           ↓
              User back to general channel only
                           ↓
              Can receive invitations again
```

## ✅ Verification Checklist

- [x] **Architecture Respected**: Users always in general channel when authenticated
- [x] **Persistent Connection**: General channel persists across page navigation
- [x] **Dual-Channel Support**: Users can be in both general + game channels
- [x] **Cross-Page Invitations**: Invitations work on lobby, myGames, and other pages
- [x] **In-Game Protection**: Invitations blocked when user is actively in a game
- [x] **Clean Disconnection**: Proper cleanup of both channels on disconnect
- [x] **Game Room Management**: Users can join and leave game rooms independently

## 🔧 Key Files Modified

### Server-Side
- `src/websocket/connection.js` - Automatic general channel join, message routing
- `src/websocket/handlers.js` - Dual-channel management, game room lifecycle
- `src/routes/api.js` - Invitation creation and acceptance (unchanged)

### Client-Side
- `public/js/websocket.js` - Enhanced state tracking, room management methods
- `public/js/navbar.js` - Global invitation handler for all pages
- `public/js/lobby.js` - Removed manual lobby join, uses global modal
- `public/js/modules/wsEventHandlers.js` - Uses joinGameRoom/leaveGameRoom
- `public/js/modules/uiHandlers.js` - Calls leaveGameRoom on abandon
- `public/lobby.html` - Updated modal to use global naming
- `public/myGames.html` - Added global invitation modal

## 🚀 Usage Examples

### Sending an Invitation
```javascript
// From lobby or any page (via API)
fetch('/api/games', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    player1Id: currentUserId,
    player2Id: invitedUserId
  })
});
// Server broadcasts GAME_INVITATION to invitedUser via general channel
```

### Receiving an Invitation
```javascript
// navbar.js (loaded on all pages) automatically handles this
wsManager.on('GAME_INVITATION', (data) => {
  if (!wsManager.isInGame()) {
    // Show invitation modal
    handleGlobalInvitation(data);
  }
});
```

### Joining a Game
```javascript
// game.js
wsManager.joinGameRoom(gameId); // Adds to game room, stays in general channel
```

### Leaving a Game
```javascript
// When abandoning or game ends
wsManager.leaveGameRoom(); // Removes from game room, stays in general channel
```

## 🐛 Known Limitations

1. **No Formal Namespaces**: Using virtual namespaces via Map structures instead of socket.io namespaces
2. **Single WebSocket Connection**: All channels use the same WebSocket connection
3. **No Game End Handler**: Game completion doesn't automatically call leaveGameRoom (should be added)

## 🔮 Future Improvements

1. Add automatic `leaveGameRoom()` call on game completion
2. Implement reconnection to game room after disconnect during active game
3. Add spectator-specific namespace for viewers
4. Implement rate limiting per channel type
5. Add channel-specific authentication for security

## 📝 Notes

- The singleton pattern in `WebSocketManager` ensures connection persistence across page navigation
- Auto-connect on instantiation if token exists means users are always connected when logged in
- The `isInGame()` check is the key protection against unwanted invitations during gameplay
- All invitation logic goes through the general channel, game-specific messages through game rooms

---

**Implementation Date**: February 2026  
**Version**: 2.0  
**Status**: ✅ Complete
