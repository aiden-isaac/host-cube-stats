const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cube-stats-secret-key-change-in-production';
const JWT_EXPIRY = '7d';
const JWT_REMEMBER_EXPIRY = '30d';

function generateToken(user, remember = false) {
    return jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: remember ? JWT_REMEMBER_EXPIRY : JWT_EXPIRY }
    );
}

function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

function requireHost(req, res, next) {
    if (!req.user || req.user.role !== 'host') {
        return res.status(403).json({ error: 'Host privileges required' });
    }
    next();
}

// Optional auth — sets req.user if token present, but doesn't block
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            req.user = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            // Token invalid, continue without auth
        }
    }
    next();
}

module.exports = { generateToken, requireAuth, requireHost, optionalAuth, JWT_SECRET };
