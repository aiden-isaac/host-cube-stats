/**
 * Swiss Pairing Engine
 * Pairs players with similar records, avoids rematches, handles byes for odd numbers.
 */

function generateSwissPairings(players, standings, previousMatches) {
    // Build a set of previous pairings for O(1) lookup
    const playedBefore = new Set();
    for (const match of previousMatches) {
        const key = [match.player1_id, match.player2_id].sort().join('-');
        playedBefore.add(key);
    }

    function havePlayed(id1, id2) {
        return playedBefore.has([id1, id2].sort().join('-'));
    }

    // Sort players by match points (descending), then by OMW% for tiebreaking
    const standingsMap = new Map();
    if (standings && standings.length) {
        for (const s of standings) {
            standingsMap.set(s.userId, s);
        }
    }

    const sorted = [...players].sort((a, b) => {
        const sa = standingsMap.get(a.user_id) || { matchPoints: 0, omwPercent: 0 };
        const sb = standingsMap.get(b.user_id) || { matchPoints: 0, omwPercent: 0 };
        return (sb.matchPoints - sa.matchPoints) || (sb.omwPercent - sa.omwPercent);
    });

    // Handle bye: if odd number, give bye to lowest-ranked player who hasn't had one
    const pairings = [];
    let pool = [...sorted];

    if (pool.length % 2 !== 0) {
        // Find the lowest-ranked player who hasn't received a bye
        // A bye is a match where player2_id is null
        const byeRecipients = new Set(
            previousMatches
                .filter(m => !m.player2_id)
                .map(m => m.player1_id)
        );

        let byePlayerIndex = pool.length - 1;
        while (byePlayerIndex >= 0 && byeRecipients.has(pool[byePlayerIndex].user_id)) {
            byePlayerIndex--;
        }
        if (byePlayerIndex < 0) byePlayerIndex = pool.length - 1; // fallback: re-bye someone

        const byePlayer = pool.splice(byePlayerIndex, 1)[0];
        pairings.push({
            player1Id: byePlayer.user_id,
            player2Id: null, // BYE
            player1Name: byePlayer.display_name || byePlayer.username,
            player2Name: 'BYE'
        });
    }

    // Pair remaining players: greedy from top of standings
    const paired = new Set();

    for (let i = 0; i < pool.length; i++) {
        if (paired.has(pool[i].user_id)) continue;

        // Find the best opponent (closest in standings, not previously played)
        let bestOpponent = null;
        for (let j = i + 1; j < pool.length; j++) {
            if (paired.has(pool[j].user_id)) continue;

            // Prefer opponents they haven't played before
            if (!havePlayed(pool[i].user_id, pool[j].user_id)) {
                bestOpponent = j;
                break;
            }

            // Fallback: take anyone available
            if (!bestOpponent) bestOpponent = j;
        }

        if (bestOpponent !== null) {
            paired.add(pool[i].user_id);
            paired.add(pool[bestOpponent].user_id);

            pairings.push({
                player1Id: pool[i].user_id,
                player2Id: pool[bestOpponent].user_id,
                player1Name: pool[i].display_name || pool[i].username,
                player2Name: pool[bestOpponent].display_name || pool[bestOpponent].username
            });
        }
    }

    return pairings;
}

module.exports = { generateSwissPairings };
