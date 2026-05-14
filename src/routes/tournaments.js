const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, requireHost } = require('../middleware/auth');

const router = express.Router();

// Generate a 6-character alphanumeric join code
function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Calculate the correct total rounds for a given player count
function calculateTotalRounds(playerCount) {
    if (playerCount === 2) return 1;
    if (playerCount === 3) return 3; // 3-player draft: 3 rounds (all unique pairings)
    return Math.ceil(Math.log2(playerCount));
}

// POST /api/tournaments — create tournament (host-only)
router.post('/', requireAuth, requireHost, (req, res) => {
    try {
        const {
            name,
            format = 'bo1',
            maxPlayers = 8,
            draftTimerEnabled = false,
            draftTimerSeconds = 60,
            matchTimerEnabled = false,
            matchTimerMinutes = 50,
            totalRounds
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Tournament name required' });
        }

        const db = getDb();

        // Get current cube version
        const currentVersion = db.prepare(
            'SELECT id FROM cube_versions WHERE end_date IS NULL ORDER BY created_at DESC LIMIT 1'
        ).get();

        // Generate unique join code
        let joinCode;
        do {
            joinCode = generateJoinCode();
        } while (db.prepare('SELECT id FROM tournaments WHERE join_code = ?').get(joinCode));

        // Use provided totalRounds, or calculate the correct default
        const calculatedRounds = calculateTotalRounds(maxPlayers);
        const finalRounds = totalRounds || calculatedRounds;

        const result = db.prepare(`
            INSERT INTO tournaments (name, join_code, format, max_players, 
                draft_timer_enabled, draft_timer_seconds, match_timer_enabled, match_timer_minutes,
                total_rounds, cube_version_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            name, joinCode, format, maxPlayers,
            draftTimerEnabled ? 1 : 0, draftTimerSeconds,
            matchTimerEnabled ? 1 : 0, matchTimerMinutes,
            finalRounds,
            currentVersion ? currentVersion.id : null,
            req.user.userId
        );

        const tournamentId = result.lastInsertRowid;

        // Auto-join the host
        db.prepare(
            'INSERT INTO tournament_players (tournament_id, user_id) VALUES (?, ?)'
        ).run(tournamentId, req.user.userId);

        res.json({
            message: 'Tournament created',
            tournament: {
                id: tournamentId,
                name,
                joinCode,
                format,
                maxPlayers,
                status: 'lobby'
            }
        });
    } catch (error) {
        console.error('Create tournament error:', error);
        res.status(500).json({ error: 'Failed to create tournament' });
    }
});

// GET /api/tournaments — list tournaments
router.get('/', requireAuth, (req, res) => {
    try {
        const { status } = req.query; // optional filter: 'active' or 'past'
        const db = getDb();

        let query = `
            SELECT t.*, u.username as host_name,
                   (SELECT COUNT(*) FROM tournament_players WHERE tournament_id = t.id) as player_count
            FROM tournaments t
            LEFT JOIN users u ON t.created_by = u.id
        `;

        if (status === 'active') {
            query += ` WHERE t.status != 'complete'`;
        } else if (status === 'past') {
            query += ` WHERE t.status = 'complete'`;
        }

        query += ' ORDER BY t.created_at DESC';

        const tournaments = db.prepare(query).all();
        res.json({ tournaments });
    } catch (error) {
        console.error('List tournaments error:', error);
        res.status(500).json({ error: 'Failed to load tournaments' });
    }
});

// GET /api/tournaments/:id — tournament details
router.get('/:id', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const tournament = db.prepare(`
            SELECT t.*, u.username as host_name
            FROM tournaments t
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.id = ?
        `).get(req.params.id);

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }

        const players = db.prepare(`
            SELECT tp.*, u.username, u.display_name, u.avatar_url
            FROM tournament_players tp
            JOIN users u ON tp.user_id = u.id
            WHERE tp.tournament_id = ?
            ORDER BY tp.seat_number
        `).all(req.params.id);

        const matches = db.prepare(`
            SELECT m.*, 
                   u1.username as player1_name, u1.display_name as player1_display,
                   u2.username as player2_name, u2.display_name as player2_display
            FROM matches m
            LEFT JOIN users u1 ON m.player1_id = u1.id
            LEFT JOIN users u2 ON m.player2_id = u2.id
            WHERE m.tournament_id = ?
            ORDER BY m.round_number, m.id
        `).all(req.params.id);

        res.json({ tournament, players, matches });
    } catch (error) {
        console.error('Get tournament error:', error);
        res.status(500).json({ error: 'Failed to load tournament' });
    }
});

// POST /api/tournaments/join — join tournament by code
router.post('/join', requireAuth, (req, res) => {
    try {
        const { joinCode } = req.body;

        if (!joinCode) {
            return res.status(400).json({ error: 'Join code required' });
        }

        const db = getDb();
        const tournament = db.prepare(
            'SELECT * FROM tournaments WHERE join_code = ? AND status = ?'
        ).get(joinCode.toUpperCase(), 'lobby');

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found or not accepting players' });
        }

        // Check if already joined
        const existing = db.prepare(
            'SELECT id FROM tournament_players WHERE tournament_id = ? AND user_id = ?'
        ).get(tournament.id, req.user.userId);

        if (existing) {
            return res.json({ message: 'Already joined', tournamentId: tournament.id });
        }

        // Check player limit
        const playerCount = db.prepare(
            'SELECT COUNT(*) as count FROM tournament_players WHERE tournament_id = ?'
        ).get(tournament.id).count;

        if (playerCount >= tournament.max_players) {
            return res.status(400).json({ error: 'Tournament is full' });
        }

        db.prepare(
            'INSERT INTO tournament_players (tournament_id, user_id) VALUES (?, ?)'
        ).run(tournament.id, req.user.userId);

        req.io.of('/tournament').to(`tournament_${tournament.id}`).emit('tournament:refresh');

        res.json({ message: 'Joined tournament', tournamentId: tournament.id });
    } catch (error) {
        console.error('Join tournament error:', error);
        res.status(500).json({ error: 'Failed to join tournament' });
    }
});

// PUT /api/tournaments/:id/seating — set seating arrangement (host-only)
router.put('/:id/seating', requireAuth, requireHost, (req, res) => {
    try {
        const { seating } = req.body; // Array of { userId, seatNumber }

        if (!seating || !Array.isArray(seating)) {
            return res.status(400).json({ error: 'Seating array required' });
        }

        const db = getDb();
        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ? AND status = ?')
            .get(req.params.id, 'lobby');

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found or not in lobby' });
        }

        const updateSeat = db.prepare(
            'UPDATE tournament_players SET seat_number = ? WHERE tournament_id = ? AND user_id = ?'
        );

        const updateAll = db.transaction((seats) => {
            for (const { userId, seatNumber } of seats) {
                updateSeat.run(seatNumber, req.params.id, userId);
            }
        });
        updateAll(seating);

        req.io.of('/tournament').to(`tournament_${req.params.id}`).emit('tournament:refresh');

        res.json({ message: 'Seating updated' });
    } catch (error) {
        console.error('Seating update error:', error);
        res.status(500).json({ error: 'Failed to update seating' });
    }
});

// PUT /api/tournaments/:id/status — advance tournament status (host-only)
router.put('/:id/status', requireAuth, requireHost, (req, res) => {
    try {
        const { status } = req.body;
        const validTransitions = {
            'lobby': ['drafting'],
            'drafting': ['deckbuilding'],
            'deckbuilding': ['playing'],
            'playing': ['complete']
        };

        const db = getDb();
        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?')
            .get(req.params.id);

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }

        const allowed = validTransitions[tournament.status] || [];
        if (!allowed.includes(status)) {
            return res.status(400).json({
                error: `Cannot transition from '${tournament.status}' to '${status}'`
            });
        }

        const updates = { status };
        if (status === 'drafting') updates.started_at = new Date().toISOString();
        if (status === 'complete') updates.completed_at = new Date().toISOString();

        db.prepare(`
            UPDATE tournaments SET status = ?, 
            started_at = COALESCE(?, started_at),
            completed_at = COALESCE(?, completed_at)
            WHERE id = ?
        `).run(status, updates.started_at || null, updates.completed_at || null, req.params.id);

        req.io.of('/tournament').to(`tournament_${req.params.id}`).emit('tournament:refresh');

        res.json({ message: `Tournament status changed to '${status}'` });
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ error: 'Failed to update tournament status' });
    }
});

// POST /api/tournaments/:id/repair-round — reopen a completed tournament for one extra round (host-only)
// Used to fix 3-player tournaments that prematurely terminated after 2 rounds.
router.post('/:id/repair-round', requireAuth, requireHost, (req, res) => {
    try {
        const db = getDb();
        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }

        // Guard: only completed tournaments can be repaired
        if (tournament.status !== 'complete') {
            return res.status(400).json({
                error: 'Only completed tournaments can be repaired. Current status: ' + tournament.status
            });
        }

        // Guard: must have at least one completed match
        const matchCount = db.prepare(
            'SELECT COUNT(*) as count FROM matches WHERE tournament_id = ? AND status = ?'
        ).get(req.params.id, 'complete').count;

        if (matchCount === 0) {
            return res.status(400).json({ error: 'Cannot repair a tournament with no completed matches' });
        }

        // Increment total_rounds by 1, reset status to playing, clear completed_at
        const newTotalRounds = (tournament.total_rounds || 0) + 1;

        db.prepare(`
            UPDATE tournaments 
            SET status = 'playing', 
                total_rounds = ?, 
                completed_at = NULL 
            WHERE id = ?
        `).run(newTotalRounds, req.params.id);

        req.io.of('/tournament').to(`tournament_${req.params.id}`).emit('tournament:refresh');

        res.json({
            message: `Tournament reopened for Round ${newTotalRounds}`,
            tournament: {
                id: tournament.id,
                status: 'playing',
                total_rounds: newTotalRounds
            }
        });
    } catch (error) {
        console.error('Repair round error:', error);
        res.status(500).json({ error: 'Failed to repair tournament' });
    }
});

// GET /api/tournaments/:id/standings — calculate standings
router.get('/:id/standings', requireAuth, (req, res) => {
    try {
        const { calculateStandings } = require('../services/standings');
        const standings = calculateStandings(req.params.id);
        res.json({ standings });
    } catch (error) {
        console.error('Standings error:', error);
        res.status(500).json({ error: 'Failed to calculate standings' });
    }
});

// DELETE /api/tournaments/:id — delete tournament (host-only)
router.delete('/:id', requireAuth, requireHost, (req, res) => {
    try {
        const db = getDb();
        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id);
        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
        res.json({ message: 'Tournament deleted' });
    } catch (error) {
        console.error('Delete tournament error:', error);
        res.status(500).json({ error: 'Failed to delete tournament' });
    }
});

module.exports = router;
