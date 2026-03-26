const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, requireHost } = require('../middleware/auth');
const { generateSwissPairings } = require('../services/swiss');

const router = express.Router();

// POST /api/tournaments/:id/pairings — generate next round pairings (host-only)
router.post('/tournaments/:id/pairings', requireAuth, requireHost, (req, res) => {
    try {
        const db = getDb();
        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?')
            .get(req.params.id);

        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }

        if (tournament.status !== 'playing') {
            return res.status(400).json({ error: 'Tournament must be in playing status' });
        }

        // Check if current round has unfinished matches
        const unfinished = db.prepare(`
            SELECT COUNT(*) as count FROM matches 
            WHERE tournament_id = ? AND round_number = ? AND status != 'complete'
        `).get(req.params.id, tournament.current_round).count;

        if (tournament.current_round > 0 && unfinished > 0) {
            return res.status(400).json({ error: 'Current round has unfinished matches' });
        }

        // Calculate total rounds if not set (log2 of player count, rounded up)
        const playerCount = db.prepare(
            'SELECT COUNT(*) as count FROM tournament_players WHERE tournament_id = ?'
        ).get(req.params.id).count;

        if (!tournament.total_rounds) {
            let totalRounds = Math.ceil(Math.log2(playerCount));
            if (playerCount === 2) totalRounds = 1;
            else if (playerCount === 3) totalRounds = 2;
            
            db.prepare('UPDATE tournaments SET total_rounds = ? WHERE id = ?')
                .run(totalRounds, req.params.id);
            tournament.total_rounds = totalRounds;
        }

        const nextRound = tournament.current_round + 1;

        if (nextRound > tournament.total_rounds) {
            return res.status(400).json({ error: 'All rounds complete' });
        }

        // Get players and their current records
        const players = db.prepare(`
            SELECT tp.user_id, u.username, u.display_name
            FROM tournament_players tp
            JOIN users u ON tp.user_id = u.id
            WHERE tp.tournament_id = ?
        `).all(req.params.id);

        // Get previous matches for re-pairing avoidance
        const previousMatches = db.prepare(`
            SELECT player1_id, player2_id FROM matches WHERE tournament_id = ?
        `).all(req.params.id);

        // Get standings for Swiss pairing
        const { calculateStandings } = require('../services/standings');
        const standings = calculateStandings(req.params.id);

        // Generate pairings
        const pairings = generateSwissPairings(players, standings, previousMatches);

        // Insert matches
        const insertMatch = db.prepare(`
            INSERT INTO matches (tournament_id, round_number, player1_id, player2_id, status)
            VALUES (?, ?, ?, ?, 'pending')
        `);

        const initLife = db.prepare(`
            INSERT INTO life_totals (match_id, user_id, life) VALUES (?, ?, 20)
        `);

        const createPairings = db.transaction(() => {
            for (const pairing of pairings) {
                const result = insertMatch.run(
                    req.params.id, nextRound,
                    pairing.player1Id, pairing.player2Id || null // null = BYE
                );
                const matchId = result.lastInsertRowid;

                // Initialize life totals
                initLife.run(matchId, pairing.player1Id);
                if (pairing.player2Id) {
                    initLife.run(matchId, pairing.player2Id);
                }

                // Auto-complete BYE matches (2-0 for the player)
                if (!pairing.player2Id) {
                    db.prepare(`
                        UPDATE matches SET player1_wins = 2, status = 'complete',
                        completed_at = datetime('now') WHERE id = ?
                    `).run(matchId);
                }
            }

            // Update current round
            db.prepare('UPDATE tournaments SET current_round = ? WHERE id = ?')
                .run(nextRound, req.params.id);
        });

        createPairings();

        // Return the new round's matches
        const newMatches = db.prepare(`
            SELECT m.*, 
                   u1.username as player1_name, u1.display_name as player1_display,
                   u2.username as player2_name, u2.display_name as player2_display
            FROM matches m
            LEFT JOIN users u1 ON m.player1_id = u1.id
            LEFT JOIN users u2 ON m.player2_id = u2.id
            WHERE m.tournament_id = ? AND m.round_number = ?
        `).all(req.params.id, nextRound);

        req.io.of('/tournament').to(`tournament_${req.params.id}`).emit('tournament:refresh');

        res.json({
            message: `Round ${nextRound} pairings generated`,
            round: nextRound,
            matches: newMatches
        });
    } catch (error) {
        console.error('Generate pairings error:', error);
        res.status(500).json({ error: 'Failed to generate pairings' });
    }
});

// GET /api/matches/active — get active match for current user
router.get('/active', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const activeMatch = db.prepare(`
            SELECT m.*, 
                   u1.username as player1_name, u1.display_name as player1_display, u1.avatar_url as player1_avatar,
                   u2.username as player2_name, u2.display_name as player2_display, u2.avatar_url as player2_avatar
            FROM matches m
            JOIN tournaments t ON m.tournament_id = t.id
            LEFT JOIN users u1 ON m.player1_id = u1.id
            LEFT JOIN users u2 ON m.player2_id = u2.id
            WHERE t.status = 'playing'
              AND m.status != 'complete'
              AND m.round_number = t.current_round
              AND (m.player1_id = ? OR m.player2_id = ?)
            LIMIT 1
        `).get(req.user.userId, req.user.userId);

        if (!activeMatch) {
            return res.json({ match: null });
        }
        res.json({ match: activeMatch });
    } catch (error) {
        console.error('Get active match error:', error);
        res.status(500).json({ error: 'Failed to get active match' });
    }
});

// GET /api/tournaments/:id/matches — get all matches for a tournament
router.get('/tournaments/:id/matches', requireAuth, (req, res) => {
    try {
        const { round } = req.query;
        const db = getDb();

        let query = `
            SELECT m.*, 
                   u1.username as player1_name, u1.display_name as player1_display,
                   u2.username as player2_name, u2.display_name as player2_display
            FROM matches m
            LEFT JOIN users u1 ON m.player1_id = u1.id
            LEFT JOIN users u2 ON m.player2_id = u2.id
            WHERE m.tournament_id = ?
        `;
        const params = [req.params.id];

        if (round) {
            query += ' AND m.round_number = ?';
            params.push(parseInt(round, 10));
        }

        query += ' ORDER BY m.round_number, m.id';

        const matches = db.prepare(query).all(...params);
        res.json({ matches });
    } catch (error) {
        console.error('Get matches error:', error);
        res.status(500).json({ error: 'Failed to load matches' });
    }
});

// POST /api/matches/:id/result — submit match result
router.post('/:id/result', requireAuth, (req, res) => {
    try {
        const { player1Wins, player2Wins, draws = 0 } = req.body;
        const db = getDb();

        const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
        if (!match) {
            return res.status(404).json({ error: 'Match not found' });
        }

        // Only participants or host can submit results
        const isParticipant = [match.player1_id, match.player2_id].includes(req.user.userId);
        const isHost = req.user.role === 'host';

        if (!isParticipant && !isHost) {
            return res.status(403).json({ error: 'Only match participants or host can submit results' });
        }

        if (player1Wins === undefined || player2Wins === undefined) {
            return res.status(400).json({ error: 'player1Wins and player2Wins required' });
        }

        db.prepare(`
            UPDATE matches SET 
                player1_wins = ?, player2_wins = ?, draws = ?,
                result_submitted_by = ?, status = 'complete',
                completed_at = datetime('now')
            WHERE id = ?
        `).run(player1Wins, player2Wins, draws, req.user.userId, req.params.id);

        req.io.of('/tournament').to(`tournament_${match.tournament_id}`).emit('tournament:refresh');

        res.json({ message: 'Result submitted' });
    } catch (error) {
        console.error('Submit result error:', error);
        res.status(500).json({ error: 'Failed to submit result' });
    }
});

// PUT /api/matches/:id/life — update life total
router.put('/:id/life', requireAuth, (req, res) => {
    try {
        const { life } = req.body;
        const db = getDb();

        db.prepare(`
            INSERT INTO life_totals (match_id, user_id, life) VALUES (?, ?, ?)
            ON CONFLICT(match_id, user_id) DO UPDATE SET life = ?
        `).run(req.params.id, req.user.userId, life, life);

        res.json({ message: 'Life updated', life });
    } catch (error) {
        console.error('Life update error:', error);
        res.status(500).json({ error: 'Failed to update life' });
    }
});

// GET /api/matches/:id/life — get life totals for a match
router.get('/:id/life', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const lifeTotals = db.prepare(`
            SELECT lt.*, u.username, u.display_name
            FROM life_totals lt
            JOIN users u ON lt.user_id = u.id
            WHERE lt.match_id = ?
        `).all(req.params.id);

        res.json({ lifeTotals });
    } catch (error) {
        console.error('Get life totals error:', error);
        res.status(500).json({ error: 'Failed to load life totals' });
    }
});

// GET /api/leaderboard — global player leaderboard
router.get('/leaderboard', requireAuth, (req, res) => {
    try {
        const db = getDb();

        const stats = db.prepare(`
            SELECT 
                u.id, u.username, u.display_name, u.avatar_url,
                COUNT(DISTINCT m.tournament_id) as tournaments,
                SUM(CASE 
                    WHEN m.player1_id = u.id AND m.player1_wins > m.player2_wins THEN 1
                    WHEN m.player2_id = u.id AND m.player2_wins > m.player1_wins THEN 1
                    ELSE 0 
                END) as match_wins,
                SUM(CASE 
                    WHEN m.player1_id = u.id AND m.player1_wins < m.player2_wins THEN 1
                    WHEN m.player2_id = u.id AND m.player2_wins < m.player1_wins THEN 1
                    ELSE 0 
                END) as match_losses,
                SUM(CASE 
                    WHEN m.player1_id = u.id AND m.player1_wins = m.player2_wins AND m.status = 'complete' THEN 1
                    WHEN m.player2_id = u.id AND m.player1_wins = m.player2_wins AND m.status = 'complete' THEN 1
                    ELSE 0 
                END) as match_draws,
                SUM(CASE WHEN m.player1_id = u.id THEN m.player1_wins WHEN m.player2_id = u.id THEN m.player2_wins ELSE 0 END) as game_wins,
                SUM(CASE WHEN m.player1_id = u.id THEN m.player2_wins WHEN m.player2_id = u.id THEN m.player1_wins ELSE 0 END) as game_losses
            FROM users u
            LEFT JOIN matches m ON (m.player1_id = u.id OR m.player2_id = u.id) AND m.status = 'complete'
            GROUP BY u.id
            HAVING tournaments > 0
            ORDER BY match_wins DESC, game_wins DESC
        `).all();

        // Calculate win rate
        const mostUsedStmt = db.prepare(`
            SELECT dc.card_name, SUM(dc.quantity) as total_qty,
                   COALESCE(
                       (SELECT image_url FROM image_overrides WHERE card_name = dc.card_name),
                       (SELECT image_url FROM cube_cards WHERE card_name = dc.card_name LIMIT 1),
                       (SELECT art_crop_url FROM cached_artworks WHERE card_name = dc.card_name LIMIT 1)
                   ) as image_url
            FROM decklist_cards dc
            JOIN decklists d ON dc.decklist_id = d.id
            WHERE d.user_id = ? 
              AND dc.is_sideboard = 0
              AND dc.card_name NOT IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes')
            GROUP BY dc.card_name
            ORDER BY total_qty DESC
            LIMIT 1
        `);

        const leaderboard = stats.map(p => {
            const totalMatches = p.match_wins + p.match_losses + p.match_draws;
            const mostUsed = mostUsedStmt.get(p.id);

            return {
                ...p,
                totalMatches,
                matchWinRate: totalMatches > 0 ? (p.match_wins / totalMatches) : 0,
                gameWinRate: (p.game_wins + p.game_losses) > 0
                    ? (p.game_wins / (p.game_wins + p.game_losses))
                    : 0,
                mostUsedCard: mostUsed ? mostUsed.card_name : null,
                mostUsedCardUrl: mostUsed ? mostUsed.image_url : null
            };
        });

        leaderboard.sort((a, b) => b.matchWinRate - a.matchWinRate || b.match_wins - a.match_wins);

        res.json({ leaderboard });
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Failed to load leaderboard' });
    }
});

module.exports = router;
