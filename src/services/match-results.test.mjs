import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import standingsModule from './standings.js';
import matchResultsModule from './match-results.js';

const { calculateStandings } = standingsModule;
const { normalizeMatchResultInput, saveMatchResult } = matchResultsModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, '../db/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

function seedTournament(db) {
    db.exec(schema);

    db.prepare(`
        INSERT INTO users (id, username, display_name, password_hash, role)
        VALUES
            (1, 'alice', 'Alice', 'x', 'host'),
            (2, 'bruno', 'Bruno', 'x', 'player'),
            (3, 'cora', 'Cora', 'x', 'player')
    `).run();

    db.prepare(`
        INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
        VALUES (10, 'Three Player Test', 'JOINME', 'complete', 3, 3, 1)
    `).run();

    db.prepare(`
        INSERT INTO tournament_players (tournament_id, user_id)
        VALUES (10, 1), (10, 2), (10, 3)
    `).run();

    db.prepare(`
        INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, draws, status, result_submitted_by, completed_at)
        VALUES
            (100, 10, 1, 1, 2, 2, 0, 0, 'complete', 1, datetime('now')),
            (101, 10, 2, 3, 2, 2, 0, 0, 'complete', 1, datetime('now')),
            (102, 10, 3, 1, 3, 2, 1, 0, 'complete', 1, datetime('now'))
    `).run();
}

function seedByeMatch(db) {
    db.exec(schema);

    db.prepare(`
        INSERT INTO users (id, username, display_name, password_hash, role)
        VALUES
            (1, 'alice', 'Alice', 'x', 'host'),
            (2, 'bruno', 'Bruno', 'x', 'player')
    `).run();

    db.prepare(`
        INSERT INTO tournaments (id, name, join_code, status, total_rounds, current_round, created_by)
        VALUES (20, 'BYE Test', 'BYE123', 'complete', 1, 1, 1)
    `).run();

    db.prepare(`
        INSERT INTO tournament_players (tournament_id, user_id)
        VALUES (20, 1), (20, 2)
    `).run();

    db.prepare(`
        INSERT INTO matches (id, tournament_id, round_number, player1_id, player2_id, player1_wins, player2_wins, draws, status, result_submitted_by, completed_at)
        VALUES (103, 20, 1, 1, NULL, 2, 0, 0, 'complete', 1, datetime('now'))
    `).run();
}

describe('match result correction helpers', () => {
    it('rejects invalid result payloads', () => {
        expect(() => normalizeMatchResultInput({ player1Wins: -1, player2Wins: 0, draws: 0 }))
            .toThrow('player1Wins must be a non-negative integer');
        expect(() => normalizeMatchResultInput({ player1Wins: 2.5, player2Wins: 0, draws: 0 }))
            .toThrow('player1Wins must be a non-negative integer');
    });

    it('updates completed match scores and standings deterministically', () => {
        const db = new Database(':memory:');
        seedTournament(db);

        const before = calculateStandings(10, db);
        expect(before[0].displayName).toBe('Alice');
        expect(before[0].matchPoints).toBe(6);

        saveMatchResult(db, {
            matchId: 102,
            player1Wins: 0,
            player2Wins: 2,
            draws: 0,
            submittedBy: 1,
            preserveCompletedAt: true
        });

        const correctedMatch = db.prepare('SELECT * FROM matches WHERE id = 102').get();
        expect(correctedMatch.player1_wins).toBe(0);
        expect(correctedMatch.player2_wins).toBe(2);
        expect(correctedMatch.status).toBe('complete');

        const after = calculateStandings(10, db);
        expect(after[0].displayName).toBe('Cora');
        expect(after[0].matchPoints).toBe(6);
        expect(after.find(player => player.displayName === 'Alice').matchPoints).toBe(3);

        db.close();
    });

    it('rejects impossible edits for completed BYE matches', () => {
        const db = new Database(':memory:');
        seedByeMatch(db);

        expect(() => saveMatchResult(db, {
            matchId: 103,
            player1Wins: 1,
            player2Wins: 1,
            draws: 0,
            submittedBy: 1,
            preserveCompletedAt: true
        })).toThrow('BYE matches must remain a 2-0 win with 0 draws');

        const byeMatch = db.prepare('SELECT * FROM matches WHERE id = 103').get();
        expect(byeMatch.player1_wins).toBe(2);
        expect(byeMatch.player2_wins).toBe(0);
        expect(byeMatch.draws).toBe(0);

        db.close();
    });
});
