const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'super_secret_key_123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '9780201379624';

// Store for hardware sessions mapping cartId -> { sessionKey, expiresAt, lastPasscodeScanTime }
const cartSessions = {};

const generateToken = () => {
    const payload = { role: 'admin', exp: Date.now() + 24 * 60 * 60 * 1000 }; // 24 hours
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto.createHmac('sha256', SECRET).update(base64Payload).digest('base64');
    return `${base64Payload}.${signature}`;
};

const verifyToken = (token) => {
    try {
        const [base64Payload, signature] = token.split('.');
        const expectedSignature = crypto.createHmac('sha256', SECRET).update(base64Payload).digest('base64');
        if (signature === expectedSignature) {
            const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
            if (payload.exp > Date.now()) return true;
        }
    } catch (e) { }
    return false;
};

router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ token: generateToken() });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (verifyToken(token)) {
            return next();
        }
    }
    return res.status(401).json({ error: 'Unauthorized. Invalid or missing token.' });
};

// --- Kiosk Login Routes ---

router.post('/cart-login', (req, res) => {
    const { cartId, passcode } = req.body;
    if (passcode === ADMIN_PASSWORD && cartId) {
        const sessionKey = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 18 * 60 * 60 * 1000; // 18 hours
        cartSessions[cartId] = { sessionKey, expiresAt, lastPasscodeScanTime: 0 };
        
        if (req.io) {
            req.io.to(cartId).emit('loginSuccess');
        }
        
        return res.json({ success: true, sessionKey, cartId });
    }
    return res.status(401).json({ error: 'Invalid cart ID or passcode' });
});

router.get('/cart-session', (req, res) => {
    const { cartId } = req.query;
    if (!cartId || !cartSessions[cartId]) {
        return res.status(404).json({ error: 'No active session' });
    }
    const session = cartSessions[cartId];
    if (Date.now() > session.expiresAt) {
        delete cartSessions[cartId];
        return res.status(401).json({ error: 'Session expired' });
    }
    res.json({ sessionKey: session.sessionKey });
});

const cartAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing session key' });
    }
    
    const token = authHeader.split(' ')[1];
    
    let validSession = false;
    for (const id in cartSessions) {
        if (cartSessions[id].sessionKey === token) {
            if (Date.now() < cartSessions[id].expiresAt) {
                validSession = true;
                req.authenticatedCartId = id;
                break;
            } else {
                delete cartSessions[id];
            }
        }
    }
    
    if (validSession) {
        return next();
    }
    return res.status(401).json({ error: 'Invalid or expired session key' });
};

module.exports = { router, authMiddleware, cartAuthMiddleware, cartSessions, ADMIN_PASSWORD };
