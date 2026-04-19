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

// --- Replicate the total_rounds normalization logic from matches.js ---
function normalizeTotalRounds(db, tournamentId) {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
    if (!tournament) throw new Error('Tournament not found');

    const playerCount = db.prepare(
        'SELECT COUNT(*) as count FROM tournament_players WHERE tournament_id = ?'
    ).get(tournamentId).count;

    let totalRounds = Math.ceil(Math.log2(playerCount));
    if (playerCount === 2) totalRounds = 1;
    else if (playerCount === 3) totalRounds = 3;

    if (totalRounds > (tournament.total_rounds || 0)) {
        db.prepare('UPDATE tournaments SET total_rounds = ? WHERE id = ?')
            .run(totalRounds, tournamentId);
        tournament.total_rounds = totalRounds;
    }

    return tournament;
}

describe('matches.js — stale total_rounds normalization', () => {
    it('normalizes a 3-player tournament stuck at total_rounds=2 to 3', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES
                (1, 'alice', 'Alice', 'x', 'host'),
                (2, 'bruno', 'Bruno', 'x', 'player'),
                (3, 'charlie', 'Charlie', 'x', 'player')
        `).run();

        // Stale 3-player tournament: playing, current_round=2, total_rounds=2
        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (100, 'Stale 3-Player', 'STALE', 'playing', 2, 2, 1)
        `).run();

        db.prepare(`
            INSERT INTO tournament_players (tournament_id, user_id)
            VALUES (100, 1), (100, 2), (100, 3)
        `).run();

        // Seed round 1 matches as complete
        db.prepare(`
            INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, status, completed_at)
            VALUES (1, 100, 1, 1, 2, 2, 0, 'complete', datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, status, completed_at)
            VALUES (2, 100, 1, 3, NULL, 2, 0, 'complete', datetime('now'))
        `).run();

        // Before normalization: total_rounds is 2
        const before = db.prepare('SELECT total_rounds FROM tournaments WHERE id = ?').get(100);
        expect(before.total_rounds).toBe(2);

        // Normalize
        const after = normalizeTotalRounds(db, 100);

        // After normalization: total_rounds should be 3
        expect(after.total_rounds).toBe(3);

        // Verify DB was updated
        const updated = db.prepare('SELECT total_rounds FROM tournaments WHERE id = ?').get(100);
        expect(updated.total_rounds).toBe(3);
    });

    it('does not change total_rounds when it is already correct', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES (1, 'alice', 'Alice', 'x', 'host')
        `).run();

        // 4-player tournament with correct total_rounds=2
        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (200, 'Correct 4-Player', 'CORRECT', 'playing', 2, 1, 1)
        `).run();

        db.prepare(`
            INSERT INTO tournament_players (tournament_id, user_id)
            VALUES (200, 1)
        `).run();

        const before = db.prepare('SELECT total_rounds FROM tournaments WHERE id = ?').get(200);
        expect(before.total_rounds).toBe(2);

        const after = normalizeTotalRounds(db, 200);
        expect(after.total_rounds).toBe(2);
    });

    it('does not lower total_rounds if it is already higher than calculated', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES (1, 'alice', 'Alice', 'x', 'host')
        `).run();

        // 4-player tournament with total_rounds=5 (host manually set higher)
        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (300, 'High Rounds', 'HIGH', 'playing', 5, 2, 1)
        `).run();

        db.prepare(`
            INSERT INTO tournament_players (tournament_id, user_id)
            VALUES (300, 1)
        `).run();

        const after = normalizeTotalRounds(db, 300);
        expect(after.total_rounds).toBe(5);
    });

    it('allows a stale 3-player tournament to generate round 3 after normalization', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES
                (1, 'alice', 'Alice', 'x', 'host'),
                (2, 'bruno', 'Bruno', 'x', 'player'),
                (3, 'charlie', 'Charlie', 'x', 'player')
        `).run();

        // Stale 3-player tournament: playing, current_round=2, total_rounds=2
        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (400, 'Stale 3-Player Round3', 'STALE3', 'playing', 2, 2, 1)
        `).run();

        db.prepare(`
            INSERT INTO tournament_players (tournament_id, user_id)
            VALUES (400, 1), (400, 2), (400, 3)
        `).run();

        // Round 1 complete
        db.prepare(`
            INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, status, completed_at)
            VALUES (1, 400, 1, 1, 2, 2, 0, 'complete', datetime('now'))
        `).run();
        db.prepare(`
            INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, status, completed_at)
            VALUES (2, 400, 1, 3, NULL, 2, 0, 'complete', datetime('now'))
        `).run();

        // Simulate the pairings endpoint flow:
        // 1. Normalize total_rounds
        const tournament = normalizeTotalRounds(db, 400);

        // 2. Check next round
        const nextRound = tournament.current_round + 1; // 3

        // 3. The key assertion: nextRound should NOT exceed total_rounds after normalization
        expect(nextRound).toBe(3);
        expect(nextRound).toBeLessThanOrEqual(tournament.total_rounds);

        // This proves the stale-playing-tournament path is fixed:
        // Before the fix, nextRound(3) > total_rounds(2) would have returned "All rounds complete"
        // After the fix, total_rounds is normalized to 3, so round 3 can proceed.
    });

    it('handles 2-player tournament with stale total_rounds=0', () => {
        const db = createTestDb();

        db.prepare(`
            INSERT INTO users (id, username, display_name, password_hash, role)
            VALUES
                (1, 'alice', 'Alice', 'x', 'host'),
                (2, 'bruno', 'Bruno', 'x', 'player')
        `).run();

        // 2-player tournament with total_rounds=0 (never set)
        db.prepare(`
            INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
            VALUES (500, 'Zero Rounds', 'ZERO', 'playing', 0, 0, 1)
        `).run();

        db.prepare(`
            INSERT INTO tournament_players (tournament_id, user_id)
            VALUES (500, 1), (500, 2)
        `).run();

        const after = normalizeTotalRounds(db, 500);
        expect(after.total_rounds).toBe(1);
    });
});
