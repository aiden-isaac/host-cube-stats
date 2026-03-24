const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../db/database');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Avatar upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `avatar-${req.user.userId}-${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const db = getDb();
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // First user ever registered becomes the host
        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const role = userCount === 0 ? 'host' : 'player';

        const result = db.prepare(
            'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
        ).run(username, passwordHash, displayName || username, role);

        const user = { id: result.lastInsertRowid, username, role };
        const token = generateToken(user);

        res.json({
            message: 'Registration successful',
            token,
            user: { id: user.id, username, displayName: displayName || username, role }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password, remember } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = generateToken(user, remember === true);

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                role: user.role,
                avatarUrl: user.avatar_url
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/auth/verify
router.get('/verify', requireAuth, (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT id, username, display_name, role, avatar_url FROM users WHERE id = ?')
        .get(req.user.userId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json({
        valid: true,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role,
            avatarUrl: user.avatar_url
        }
    });
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, (req, res) => {
    try {
        const { displayName } = req.body;
        const db = getDb();

        if (displayName !== undefined) {
            db.prepare('UPDATE users SET display_name = ? WHERE id = ?')
                .run(displayName, req.user.userId);
        }

        const user = db.prepare('SELECT id, username, display_name, role, avatar_url FROM users WHERE id = ?')
            .get(req.user.userId);

        res.json({
            message: 'Profile updated',
            user: {
                id: user.id,
                username: user.username,
                displayName: user.display_name,
                role: user.role,
                avatarUrl: user.avatar_url
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// POST /api/auth/avatar
router.post('/avatar', requireAuth, upload.single('avatar'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const avatarUrl = `/uploads/${req.file.filename}`;
        const db = getDb();
        db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
            .run(avatarUrl, req.user.userId);

        res.json({ message: 'Avatar updated', avatarUrl });
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

// PUT /api/auth/password
router.put('/password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        const db = getDb();
        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?')
            .get(req.user.userId);

        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            .run(newHash, req.user.userId);

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;
