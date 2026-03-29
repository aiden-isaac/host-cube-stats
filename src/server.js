const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { initDatabase } = require('./db/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

const PORT = process.env.PORT || 8080;

// Security and utility middleware
app.use(helmet({
    contentSecurityPolicy: false, // Vite/React dev needs easier CSP or disabled in transit
    crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from 'public' (React build path if applicable)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve user uploaded avatars
const fs = require('fs');
const uploadsPath = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

// Inject IO into req for routes that need to emit events
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Setup sockets
require('./socket/tournament')(io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cube', require('./routes/cube'));
app.use('/api/tournaments', require('./routes/tournaments'));
app.use('/api/decklists', require('./routes/decklists'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/scanner', require('./routes/scanner'));

// Fallback for SPA
app.get('*', (req, res) => {
    // If client build exists, serve it. Otherwise simple message.
    const clientPath = path.join(__dirname, '../client/dist/index.html');
    require('fs').access(clientPath, require('fs').constants.F_OK, (err) => {
        if (!err) {
            res.sendFile(clientPath);
        } else {
            res.send('Cube Stats v2 - API Running (Frontend not built)');
        }
    });
});

// Start Server
async function start() {
    try {
        await initDatabase();
        server.listen(PORT, () => {
            console.log(`[Server] Cube Stats v2 backend running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
