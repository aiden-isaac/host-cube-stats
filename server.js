const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const { generateToken, authenticateToken } = require('./auth');
const { initDatabase, findUserByUsername, createUser, getUserData, saveUserData } = require('./database');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow large data payloads

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ============ AUTH ROUTES ============

// Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user exists
        const existingUser = findUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash password with bcrypt (12 rounds)
        const passwordHash = await bcrypt.hash(password, 12);

        // Create user
        const result = createUser(username, passwordHash);
        const user = { id: result.lastInsertRowid, username };

        // Generate token
        const token = generateToken(user);

        res.json({
            message: 'Registration successful',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Find user
        const user = findUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate token
        const token = generateToken(user);

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ============ DATA ROUTES (Protected) ============

// Get user's cube data
app.get('/api/data', authenticateToken, (req, res) => {
    try {
        const data = getUserData(req.user.userId);
        res.json({
            success: true,
            data: data || { masterCubeList: [], games: [], imageOverrides: {} }
        });
    } catch (error) {
        console.error('Get data error:', error);
        res.status(500).json({ error: 'Failed to load data' });
    }
});

// Save user's cube data
app.post('/api/data', authenticateToken, (req, res) => {
    try {
        const { data } = req.body;
        if (!data) {
            return res.status(400).json({ error: 'No data provided' });
        }

        saveUserData(req.user.userId, data);
        res.json({ success: true, message: 'Data saved successfully' });
    } catch (error) {
        console.error('Save data error:', error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// Verify token (for checking if still logged in)
app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ============ FALLBACK ============

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ensure data directory exists and start server
async function startServer() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    await initDatabase();
    console.log('📦 Database initialized');

    // Start server
    app.listen(PORT, () => {
        console.log(`🎲 Cube Stats server running on port ${PORT}`);
        console.log(`📡 API available at http://localhost:${PORT}/api`);
        console.log(`🌐 Frontend at http://localhost:${PORT}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
