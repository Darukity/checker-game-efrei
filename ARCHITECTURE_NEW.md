# Architecture du Backend - Dame Projet (Refactorisé)

## Structure des fichiers

```
src/
├── server.js                 # Point d'entrée principal
├── config/
│   └── constants.js         # Constantes globales
├── db/
│   ├── pool.js              # Pool PostgreSQL
│   ├── init.js              # Initialisation DB
│   └── queries/
│       ├── userQueries.js   # Requêtes utilisateurs
│       └── gameQueries.js   # Requêtes jeux
├── routes/
│   ├── auth.js              # Authentification
│   ├── users.js             # Utilisateurs
│   └── games.js             # Jeux
├── utils/
│   ├── tokenUtils.js        # JWT
│   ├── validation.js        # Validation messages
│   ├── rateLimiter.js       # Rate limiting
│   └── gameUtils.js         # Utilitaires jeu
└── websocket/
    ├── manager.js           # Gestion connections
    └── handlers.js          # Handlers événements
```

## Avantages de cette architecture

✅ **Séparation des responsabilités** - Chaque fichier a un rôle unique  
✅ **Réutilisabilité** - Les modules peuvent être importés n'importe où  
✅ **Testabilité** - Facile de tester les fonctions isolées  
✅ **Maintenabilité** - Code lisible et organisé  
✅ **Scalabilité** - Simple d'ajouter de nouvelles features  

## Flux simplifié

1. **HTTP** → Routes → Queries → Réponse
2. **WebSocket** → Handlers → Manager → Broadcast

## Références des modules

- **config/constants.js** - Constantes globales (JWT_SECRET, limites)
- **db/queries/** - Isolent la logique BD (SELECT, INSERT, UPDATE)
- **utils/** - Fonctions réutilisables (tokens, validation, rate limit)
- **routes/** - Points d'entrée HTTP (middleware Express)
- **websocket/** - Gestion temps réel et broadcast
