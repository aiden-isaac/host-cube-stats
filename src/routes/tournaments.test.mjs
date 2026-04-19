import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, '../db/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

// --- Helper: create an in-memory DB with schema ---
function createTestDb() {
    const db = new Database(':memory:');
    db.exec(schema);
    return db;
}

// --- Replicate calculateTotalRounds from tournaments.js ---
function calculateTotalRounds(playerCount) {
    if (playerCount === 2) return 1;
    if (playerCount === 3) return 3;
    return Math.ceil(Math.log2(playerCount));
}

// --- Replicate repair-round logic from tournaments.js ---
function repairRound(db, tournamentId) {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) throw new Error('Tournament not found');
    if (tournament.status !== 'complete') {
        throw new Error('Only completed tournaments can be repaired');
    }
    const matchCount = db.prepare(
        'SELECT COUNT(*) as count FROM matches WHERE tournament_id = ? AND status = ?'
    ).get(tournamentId, 'complete').count;
    if (matchCount === 0) {
        throw new Error('Cannot repair a tournament with no completed matches');
    }
    const newTotalRounds = (tournament.total_rounds || 0) + 1;
    db.prepare(`
        UPDATE tournaments 
        SET status = 'playing', 
            total_rounds = ?, 
            completed_at = NULL 
        WHERE id = ?
    `).run(newTotalRounds, tournamentId);
    return newTotalRounds;
}

describe('3-player tournament total_rounds defaults', () => {
    it('returns 3 rounds for a 3-player tournament', () => {
        expect(calculateTotalRounds(3)).toBe(3);
    });

    it('returns 1 round for a 2-player tournament', () => {
        expect(calculateTotalRounds(2)).toBe(1);
    });

    it('returns ceil(log2(n)) for n >= 4', () => {
        expect(calculateTotalRounds(4)).toBe(2);
        expect(calculateTotalRounds(5)).toBe(3);
        expect(calculateTotalRounds(8)).toBe(3);
        expect(calculateTotalRounds(9)).toBe(4);
    });
});

describe('repair-round flow', () => {
    it('reopens a completed 3-player tournament and increments total_rounds', () => {
        const db = createTestDb();

        // Seed users (need player2_id user for FK)
        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES
                (1, 'alice', 'Alice', 'x', 'host'),
                (2, 'bruno', 'Bruno', 'x', 'player')
        `).run();

        // Seed a completed 3-player tournament with stale total_rounds = 2
        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (10, 'Broken 3-Player', 'JOINME', 'complete', 2, 2, 1)
        `).run();

        db.prepare(`
            INSERT INTO tournament_players (tournament_id, user_id)
            VALUES (10, 1), (10, 2)
        `).run();

        // Seed one completed match
        db.prepare(`
            INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, status, completed_at)
            VALUES (100, 10, 1, 1, 2, 2, 0, 'complete', datetime('now'))
        `).run();

        // Repair
        const newTotal = repairRound(db, 10);

        expect(newTotal).toBe(3);

        const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(10);
        expect(updated.status).toBe('playing');
        expect(updated.total_rounds).toBe(3);
        expect(updated.completed_at).toBeNull();
    });

    it('rejects repair on a non-completed tournament', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES (1, 'alice', 'Alice', 'x', 'host')
        `).run();

        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (20, 'Active Tournament', 'JOINME', 'playing', 3, 2, 1)
        `).run();

        expect(() => repairRound(db, 20)).toThrow('Only completed tournaments can be repaired');
    });

    it('rejects repair on a tournament with no completed matches', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES (1, 'alice', 'Alice', 'x', 'host')
        `).run();

        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (30, 'Empty Tournament', 'JOINME', 'complete', 2, 0, 1)
        `).run();

        expect(() => repairRound(db, 30)).toThrow('Cannot repair a tournament with no completed matches');
    });

    it('rejects repair on a non-existent tournament', () => {
        const db = createTestDb();
        expect(() => repairRound(db, 999)).toThrow('Tournament not found');
    });

    it('can repair multiple times (stacking rounds)', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES (1, 'alice', 'Alice', 'x', 'host')
        `).run();

        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (40, 'Multi-Repair', 'JOINME', 'complete', 2, 2, 1)
        `).run();

        db.prepare(`
            INSERT INTO tournament_players (tournament_id, user_id)
            VALUES (40, 1)
        `).run();

        db.prepare(`
            INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, status, completed_at)
            VALUES (100, 40, 1, 1, NULL, 2, 0, 'complete', datetime('now'))
        `).run();

        // First repair: 2 -> 3
        expect(repairRound(db, 40)).toBe(3);
        let t = db.prepare('SELECT total_rounds, status FROM tournaments WHERE id = ?').get(40);
        expect(t.total_rounds).toBe(3);
        expect(t.status).toBe('playing');

        // Simulate completing the repaired round and going back to complete
        db.prepare(`
            UPDATE tournaments SET status = 'complete', completed_at = datetime('now'), current_round = 3
            WHERE id = ?
        `).run(40);

        // Second repair: 3 -> 4
        expect(repairRound(db, 40)).toBe(4);
        t = db.prepare('SELECT total_rounds, status FROM tournaments WHERE id = ?').get(40);
        expect(t.total_rounds).toBe(4);
        expect(t.status).toBe('playing');
    });
});
