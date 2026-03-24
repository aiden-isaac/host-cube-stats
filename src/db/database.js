const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/cube-stats.db');

let db;

function getDb() {
    if (!db) {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function initDatabase() {
    const database = getDb();
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    database.exec(schema);
    console.log('📦 Database initialized');
    return database;
}

function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = { getDb, initDatabase, closeDatabase };
