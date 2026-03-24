/**
 * Tournament Standings Calculator
 * Implements official WotC tiebreaker system:
 *   1. Match Points (3 for win, 1 for draw, 0 for loss)
 *   2. OMW% (Opponent Match Win %) — floor 33%
 *   3. GW% (Game Win %)
 *   4. OGW% (Opponent Game Win %) — floor 33%
 */

const { getDb } = require('../db/database');

function calculateStandings(tournamentId) {
    const db = getDb();

    // Get all completed matches for this tournament
    const matches = db.prepare(`
        SELECT * FROM matches WHERE tournament_id = ? AND status = 'complete'
    `).all(tournamentId);

    // Get all players in this tournament
    const players = db.prepare(`
        SELECT tp.user_id, u.username, u.display_name, u.avatar_url
        FROM tournament_players tp
        JOIN users u ON tp.user_id = u.id
        WHERE tp.tournament_id = ?
    `).all(tournamentId);

    // Build per-player stats
    const playerStats = new Map();

    for (const player of players) {
        playerStats.set(player.user_id, {
            userId: player.user_id,
            username: player.username,
            displayName: player.display_name,
            avatarUrl: player.avatar_url,
            matchWins: 0,
            matchLosses: 0,
            matchDraws: 0,
            matchPoints: 0,
            gameWins: 0,
            gameLosses: 0,
            roundsPlayed: 0,
            opponents: []
        });
    }

    // Process matches
    for (const match of matches) {
        const p1 = playerStats.get(match.player1_id);
        const p2 = match.player2_id ? playerStats.get(match.player2_id) : null;

        if (!p1) continue;

        // Determine match winner
        const p1Won = match.player1_wins > match.player2_wins;
        const p2Won = match.player2_wins > match.player1_wins;
        const isDraw = match.player1_wins === match.player2_wins;

        // Player 1
        p1.gameWins += match.player1_wins;
        p1.gameLosses += match.player2_wins;
        p1.roundsPlayed++;

        if (p1Won) {
            p1.matchWins++;
            p1.matchPoints += 3;
        } else if (isDraw) {
            p1.matchDraws++;
            p1.matchPoints += 1;
        } else {
            p1.matchLosses++;
        }

        // Player 2 (skip if BYE)
        if (p2) {
            p2.gameWins += match.player2_wins;
            p2.gameLosses += match.player1_wins;
            p2.roundsPlayed++;

            if (p2Won) {
                p2.matchWins++;
                p2.matchPoints += 3;
            } else if (isDraw) {
                p2.matchDraws++;
                p2.matchPoints += 1;
            } else {
                p2.matchLosses++;
            }

            // Track opponents
            p1.opponents.push(match.player2_id);
            p2.opponents.push(match.player1_id);
        }
    }

    // Calculate MWP (Match Win Percentage) for each player
    function getMatchWinPercent(stats) {
        if (stats.roundsPlayed === 0) return 0.33; // Floor
        const mwp = stats.matchPoints / (stats.roundsPlayed * 3);
        return Math.max(mwp, 0.33); // WotC floor
    }

    function getGameWinPercent(stats) {
        const totalGames = stats.gameWins + stats.gameLosses;
        if (totalGames === 0) return 0.33;
        const gwp = stats.gameWins / totalGames;
        return Math.max(gwp, 0.33);
    }

    // Calculate tiebreakers
    const standings = [];

    for (const [userId, stats] of playerStats) {
        // OMW% = average MWP of all opponents (with 33% floor per opponent)
        let omwSum = 0;
        for (const oppId of stats.opponents) {
            const oppStats = playerStats.get(oppId);
            if (oppStats) {
                omwSum += getMatchWinPercent(oppStats);
            }
        }
        const omwPercent = stats.opponents.length > 0
            ? omwSum / stats.opponents.length
            : 0;

        // GW%
        const gwPercent = getGameWinPercent(stats);

        // OGW% = average GWP of all opponents (with 33% floor)
        let ogwSum = 0;
        for (const oppId of stats.opponents) {
            const oppStats = playerStats.get(oppId);
            if (oppStats) {
                ogwSum += getGameWinPercent(oppStats);
            }
        }
        const ogwPercent = stats.opponents.length > 0
            ? ogwSum / stats.opponents.length
            : 0;

        standings.push({
            userId,
            username: stats.username,
            displayName: stats.displayName,
            avatarUrl: stats.avatarUrl,
            matchWins: stats.matchWins,
            matchLosses: stats.matchLosses,
            matchDraws: stats.matchDraws,
            matchPoints: stats.matchPoints,
            gameWins: stats.gameWins,
            gameLosses: stats.gameLosses,
            roundsPlayed: stats.roundsPlayed,
            omwPercent: Math.round(omwPercent * 10000) / 100,   // as percentage, 2 decimals
            gwPercent: Math.round(gwPercent * 10000) / 100,
            ogwPercent: Math.round(ogwPercent * 10000) / 100
        });
    }

    // Sort: match points → OMW% → GW% → OGW%
    standings.sort((a, b) => {
        if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
        if (b.omwPercent !== a.omwPercent) return b.omwPercent - a.omwPercent;
        if (b.gwPercent !== a.gwPercent) return b.gwPercent - a.gwPercent;
        return b.ogwPercent - a.ogwPercent;
    });

    // Add rank
    standings.forEach((s, i) => { s.rank = i + 1; });

    return standings;
}

module.exports = { calculateStandings };
