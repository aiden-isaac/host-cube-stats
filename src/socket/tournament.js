const { getDb } = require('../db/database');

module.exports = function(io) {
    const nsp = io.of('/tournament');

    // Timer state management (in memory)
    const activeTimers = {
        // tournamentId: { intervalId, remainingSeconds, type: 'draft' | 'match' }
    };

    nsp.on('connection', (socket) => {
        console.log(`Socket connected to /tournament: ${socket.id}`);

        socket.on('join', (tournamentId) => {
            socket.join(`tournament_${tournamentId}`);
            console.log(`Socket ${socket.id} joined tournament_${tournamentId}`);
            
            // Send current timer state if one exists
            if (activeTimers[tournamentId]) {
                socket.emit('timer:sync', {
                    remainingSeconds: activeTimers[tournamentId].remainingSeconds,
                    type: activeTimers[tournamentId].type
                });
            }
        });

        socket.on('leave', (tournamentId) => {
            socket.leave(`tournament_${tournamentId}`);
        });

        // Host controls
        socket.on('timer:start', ({ tournamentId, type, seconds }) => {
            // Verify host logic could go here via socket.handshake.auth token
            
            if (activeTimers[tournamentId]) {
                clearInterval(activeTimers[tournamentId].intervalId);
            }

            console.log(`Starting ${type} timer for tournament ${tournamentId}: ${seconds}s`);

            activeTimers[tournamentId] = {
                remainingSeconds: seconds,
                type: type, // 'draft', 'match'
                intervalId: setInterval(() => {
                    const timer = activeTimers[tournamentId];
                    timer.remainingSeconds--;

                    if (timer.remainingSeconds <= 0) {
                        clearInterval(timer.intervalId);
                        delete activeTimers[tournamentId];
                        nsp.to(`tournament_${tournamentId}`).emit('timer:complete', { type });
                    } else {
                        // Broadcast tick every second
                        nsp.to(`tournament_${tournamentId}`).emit('timer:tick', {
                            remainingSeconds: timer.remainingSeconds,
                            type: timer.type
                        });
                    }
                }, 1000)
            };
            
            nsp.to(`tournament_${tournamentId}`).emit('timer:start', { type, seconds });
        });

        socket.on('timer:stop', ({ tournamentId }) => {
            if (activeTimers[tournamentId]) {
                clearInterval(activeTimers[tournamentId].intervalId);
                delete activeTimers[tournamentId];
                nsp.to(`tournament_${tournamentId}`).emit('timer:stopped');
            }
        });

        // Life tracking
        socket.on('life:update', ({ matchId, userId, newLife }) => {
            try {
                const db = getDb();
                db.prepare(
                    'INSERT INTO life_totals (match_id, user_id, life) VALUES (?, ?, ?) ON CONFLICT(match_id, user_id) DO UPDATE SET life = ?'
                ).run(matchId, userId, newLife, newLife);

                // Broadcast to everyone watching the match/tournament
                socket.broadcast.to(`match_${matchId}`).emit('life:updated', {
                    matchId,
                    userId,
                    life: newLife
                });
            } catch (err) {
                console.error('Socket life updated error:', err);
            }
        });

        socket.on('join_match', (matchId) => {
            socket.join(`match_${matchId}`);
            // Send current life totals
            try {
                const db = getDb();
                const totals = db.prepare('SELECT user_id, life FROM life_totals WHERE match_id = ?').all(matchId);
                socket.emit('life:sync', { matchId, totals });
            } catch (err) {
                console.error('Socket join match error:', err);
            }
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
    
    return nsp;
};
