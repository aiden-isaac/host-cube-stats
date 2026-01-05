const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Database path
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'cube-stats.db');

let db = null;

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS cube_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            data_json TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    saveDatabase();
    return db;
}

// Save database to file
function saveDatabase() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
}

// Database operations
function findUserByUsername(username) {
    if (!db) return null;
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    stmt.bind([username]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

function createUser(username, passwordHash) {
    if (!db) return null;
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
    saveDatabase();
    return { lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0].values[0][0] };
}

function getUserData(userId) {
    if (!db) return null;
    const stmt = db.prepare('SELECT data_json FROM cube_data WHERE user_id = ?');
    stmt.bind([userId]);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return JSON.parse(row.data_json);
    }
    stmt.free();
    return null;
}

function saveUserData(userId, data) {
    if (!db) return;
    // Check if exists
    const stmt = db.prepare('SELECT id FROM cube_data WHERE user_id = ?');
    stmt.bind([userId]);
    const exists = stmt.step();
    stmt.free();

    if (exists) {
        db.run('UPDATE cube_data SET data_json = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [JSON.stringify(data), userId]);
    } else {
        db.run('INSERT INTO cube_data (user_id, data_json) VALUES (?, ?)',
            [userId, JSON.stringify(data)]);
    }
    saveDatabase();
}

module.exports = {
    initDatabase,
    findUserByUsername,
    createUser,
    getUserData,
    saveUserData
};
