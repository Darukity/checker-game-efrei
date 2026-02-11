// ==================== WEBSOCKET.JS ====================

class WebSocketManager {
    static instance = null;

    constructor() {
        // Singleton pattern - réutiliser l'instance existante
        if (WebSocketManager.instance) {
            return WebSocketManager.instance;
        }

        this.ws = null;
        this.url = `ws://${window.location.hostname}:${window.location.port || 3000}`;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.listeners = new Map();
        this.messageQueue = [];
        this.isConnected = false;
        this.isAuthenticated = false;
        this.connectingPromise = null;
        this.heartbeatInterval = null;

        WebSocketManager.instance = this;
    }

    connect() {
        // Si déjà connecté, retourner promesse résolue
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('✅ WebSocket déjà connecté');
            return Promise.resolve();
        }

        // Si une connexion est en cours, attendre
        if (this.connectingPromise) {
            return this.connectingPromise;
        }

        // Créer une nouvelle promesse de connexion
        this.connectingPromise = new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);

                this.ws.onopen = () => {
                    console.log('✅ WebSocket connecté');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.updateConnectionStatus('online');

                    // Démarrer le heartbeat (ping toutes les 30 secondes)
                    this.startHeartbeat();

                    // Authentifier automatiquement
                    const token = localStorage.getItem('token');
                    if (token) {
                        this.authenticate(token);
                    }

                    // Envoyer les messages en attente
                    while (this.messageQueue.length > 0) {
                        const msg = this.messageQueue.shift();
                        this.send(msg.type, msg.data);
                    }

                    this.connectingPromise = null;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (err) {
                        console.error('Erreur parsing WebSocket:', err);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('Erreur WebSocket:', error);
                    this.updateConnectionStatus('error');
                    this.connectingPromise = null;
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('❌ WebSocket déconnecté');
                    this.isConnected = false;
                    this.isAuthenticated = false;
                    this.updateConnectionStatus('offline');
                    this.stopHeartbeat();
                    this.connectingPromise = null;
                    this.attemptReconnect();
                };
            } catch (err) {
                console.error('Erreur connexion WebSocket:', err);
                this.connectingPromise = null;
                reject(err);
            }
        });

        return this.connectingPromise;
    }
    authenticate(token) {
        this.send('AUTH', { token });
    }

    send(type, data = {}) {
        const message = {
            type,
            data,
            token: localStorage.getItem('token')
        };

        if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
            console.warn(`⚠️ Message ${type} mis en queue (pas connecté)`);
            this.messageQueue.push({ type, data });
            return;
        }

        try {
            this.ws.send(JSON.stringify(message));
        } catch (err) {
            console.error('Erreur envoi message:', err);
            this.messageQueue.push({ type, data });
        }
    }

    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(callback);
    }

    off(type, callback) {
        if (!this.listeners.has(type)) return;
        const listeners = this.listeners.get(type);
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    handleMessage(message) {
        const { type, data } = message;
        console.log(`📨 WebSocket received message:`, type, data);

        switch (type) {
            case 'AUTH_SUCCESS':
                console.log('✅ Authentification réussie');
                this.isAuthenticated = true;
                this.emit('AUTH_SUCCESS', data);
                break;

            case 'AUTH_ERROR':
                console.error('❌ Erreur authentification:', data);
                this.emit('AUTH_ERROR', data);
                break;

            default:
                this.emit(type, data);
        }
    }

    emit(type, data) {
        if (!this.listeners.has(type)) return;
        this.listeners.get(type).forEach(callback => {
            try {
                callback(data);
            } catch (err) {
                console.error(`Erreur callback ${type}:`, err);
            }
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Nombre max de reconnexions atteint');
            this.updateConnectionStatus('error');
            return;
        }

        this.reconnectAttempts++;
        this.updateConnectionStatus('reconnecting');
        console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

        setTimeout(() => {
            this.connect().catch(() => {
                this.attemptReconnect();
            });
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connStatus');
        if (!statusEl) return;

        statusEl.classList.remove('online', 'offline', 'reconnecting');

        switch (status) {
            case 'online':
                statusEl.classList.add('online');
                statusEl.textContent = '● En ligne';
                break;
            case 'offline':
                statusEl.classList.add('offline');
                statusEl.textContent = '● Hors ligne';
                break;
            case 'reconnecting':
                statusEl.classList.add('reconnecting');
                statusEl.textContent = '● Reconnexion...';
                break;
            case 'error':
                statusEl.classList.add('offline');
                statusEl.textContent = '● Erreur connexion';
                break;
        }
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) return;
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({
                        type: 'PING',
                        data: {},
                        token: localStorage.getItem('token')
                    }));
                } catch (err) {
                    console.error('Erreur envoi heartbeat:', err);
                }
            }
        }, 30000); // Toutes les 30 secondes
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    isReady() {
        return this.isConnected && this.isAuthenticated;
    }
}

// Instance globale
const wsManager = new WebSocketManager();
