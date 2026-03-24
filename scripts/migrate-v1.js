const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const V1_DB_PATH = path.join(__dirname, '../v1.sqlite');
const V2_DB_PATH = path.join(__dirname, '../database.sqlite');

/**
 * Data Migration Script: v1 -> v2
 * Note: You must place your old database at `v1.sqlite` in the project root.
 */
async function migrate() {
    console.log('--- Cube Stats V1 to V2 Migration ---');
    
    if (!fs.existsSync(V1_DB_PATH)) {
        console.error('ERROR: v1.sqlite not found in the project root.');
        process.exit(1);
    }
    
    const dbV1 = new Database(V1_DB_PATH, { fileMustExist: true });
    let dbV2;
    
    try {
        // Initialize the new database schema first (if it doesn't exist)
        require('../src/db/database').initDatabase();
        dbV2 = new Database(V2_DB_PATH);
        
        console.log('Successfully connected to both databases.');
        
        // 1. Migrate Users
        console.log('\nMigrating Users...');
        try {
            const oldUsers = dbV1.prepare('SELECT * FROM users').all();
            const insertUser = dbV2.prepare(`
                INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            dbV2.transaction(() => {
                for (const u of oldUsers) {
                    // Normalize v1 data to v2
                    insertUser.run(
                        u.id, 
                        u.username.toLowerCase(), 
                        u.password || bcrypt.hashSync('defaultpassword', 10), // Fallback if v1 wasn't secure
                        u.display_name || u.username,
                        u.role || 'player'
                    );
                }
            })();
            console.log(`✅ Migrated ${oldUsers.length} users.`);
        } catch (err) {
            console.log('⚠️ Skipping Users (table missing or structure incompatible)');
        }

        // 2. Migrate Historical Matches / Tournaments 
        console.log('\nMigrating Matches...');
        // Example: Map old matches to a dummy historical tournament or preserve ids
        // (Modify this section based on your exact v1 schema structure)
        
        console.log('\nMigration completed successfully!');
        
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        dbV1.close();
        if (dbV2) dbV2.close();
    }
}

migrate();
