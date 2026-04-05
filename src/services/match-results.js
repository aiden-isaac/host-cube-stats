function normalizeMatchResultInput({ player1Wins, player2Wins, draws = 0 }) {
    const values = {
        player1Wins: Number(player1Wins),
        player2Wins: Number(player2Wins),
        draws: Number(draws)
    };

    for (const [key, value] of Object.entries(values)) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`${key} must be a non-negative integer`);
        }
    }

    return values;
}

function saveMatchResult(db, {
    matchId,
    player1Wins,
    player2Wins,
    draws = 0,
    submittedBy,
    preserveCompletedAt = false
}) {
    const normalized = normalizeMatchResultInput({ player1Wins, player2Wins, draws });
    const completedAtClause = preserveCompletedAt ? 'COALESCE(completed_at, datetime(\'now\'))' : 'datetime(\'now\')';

    db.prepare(`
        UPDATE matches SET
            player1_wins = ?,
            player2_wins = ?,
            draws = ?,
            result_submitted_by = ?,
            status = 'complete',
            completed_at = ${completedAtClause}
        WHERE id = ?
    `).run(
        normalized.player1Wins,
        normalized.player2Wins,
        normalized.draws,
        submittedBy,
        matchId
    );

    return normalized;
}

module.exports = { normalizeMatchResultInput, saveMatchResult };
