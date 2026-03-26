const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, requireHost } = require('../middleware/auth');

const router = express.Router();

// Parse decklist text into card entries
function parseDecklistText(text) {
    const lines = text.split('\n').filter(l => l.trim());
    const cardsMap = new Map();
    let isSideboard = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (/^sideboard/i.test(trimmed) || trimmed === '---') {
            isSideboard = true;
            continue;
        }

        // Match: "2x Lightning Bolt", "2 Lightning Bolt", or just "Lightning Bolt"
        const match = trimmed.match(/^(\d+)x?\s+(.+)$/i);
        const quantity = match ? parseInt(match[1], 10) : 1;
        let cardName = match ? match[2].trim() : trimmed;

        // Normalize DFC: "Delver of Secrets // Insectile Aberration" → "Delver of Secrets"
        if (cardName.includes('//')) {
            cardName = cardName.split('//')[0].trim();
        }

        if (cardName) {
            const key = `${cardName}:::${isSideboard}`;
            if (cardsMap.has(key)) {
                cardsMap.get(key).quantity += quantity;
            } else {
                cardsMap.set(key, { cardName, quantity, isSideboard });
            }
        }
    }
    return Array.from(cardsMap.values());
}

// POST /api/tournaments/:tournamentId/decklist — submit decklist
router.post('/tournaments/:tournamentId/decklist', requireAuth, (req, res) => {
    try {
        const { deckTitle, decklistText } = req.body;
        const { tournamentId } = req.params;

        if (!decklistText) {
            return res.status(400).json({ error: 'Decklist text required' });
        }

        const db = getDb();

        // Verify player is in this tournament
        const player = db.prepare(
            'SELECT * FROM tournament_players WHERE tournament_id = ? AND user_id = ?'
        ).get(tournamentId, req.user.userId);

        if (!player) {
            return res.status(403).json({ error: 'You are not in this tournament' });
        }

        // Verify tournament is in deckbuilding or playing status
        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);
        if (!tournament || !['deckbuilding', 'playing'].includes(tournament.status)) {
            return res.status(400).json({ error: 'Tournament is not accepting decklists' });
        }

        const cards = parseDecklistText(decklistText);

        // Upsert decklist (transaction)
        const upsertDecklist = db.transaction(() => {
            // Delete existing decklist for this user/tournament
            const existing = db.prepare(
                'SELECT id FROM decklists WHERE tournament_id = ? AND user_id = ?'
            ).get(tournamentId, req.user.userId);

            if (existing) {
                db.prepare('DELETE FROM decklist_cards WHERE decklist_id = ?').run(existing.id);
                db.prepare('DELETE FROM decklists WHERE id = ?').run(existing.id);
            }

            // Insert new decklist
            const result = db.prepare(
                'INSERT INTO decklists (tournament_id, user_id, deck_title) VALUES (?, ?, ?)'
            ).run(tournamentId, req.user.userId, deckTitle || 'Untitled');

            const decklistId = result.lastInsertRowid;

            // Insert cards WITH frozen image snapshot
            const insertCard = db.prepare(
                'INSERT INTO decklist_cards (decklist_id, card_name, quantity, is_sideboard, image_url) VALUES (?, ?, ?, ?, ?)'
            );

            const lookup = db.prepare(`
                SELECT 
                    (SELECT image_url FROM image_overrides WHERE card_name = ?) as io_img,
                    (SELECT image_url FROM cube_cards WHERE card_name = ? AND version_id = ?) as cc_img,
                    (SELECT image_url FROM cube_cards WHERE card_name = ? LIMIT 1) as fb_img,
                    (CASE WHEN ? IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest')
                          THEN 'https://api.scryfall.com/cards/named?exact=' || REPLACE(?, ' ', '+') || '&format=image'
                          ELSE NULL END) as default_img
            `);

            for (const card of cards) {
                const imgInfo = lookup.get(card.cardName, card.cardName, tournament.cube_version_id, card.cardName, card.cardName, card.cardName);
                const img = imgInfo ? (imgInfo.io_img || imgInfo.cc_img || imgInfo.fb_img || imgInfo.default_img) : null;
                insertCard.run(decklistId, card.cardName, card.quantity, card.isSideboard ? 1 : 0, img);
            }

            // Mark as submitted
            db.prepare(
                'UPDATE tournament_players SET decklist_submitted = 1 WHERE tournament_id = ? AND user_id = ?'
            ).run(tournamentId, req.user.userId);

            return decklistId;
        });

        const decklistId = upsertDecklist();

        req.io.of('/tournament').to(`tournament_${tournamentId}`).emit('tournament:refresh');

        res.json({
            message: 'Decklist submitted',
            decklistId,
            cardCount: cards.filter(c => !c.isSideboard).length,
            sideboardCount: cards.filter(c => c.isSideboard).length
        });
    } catch (error) {
        console.error('Submit decklist error:', error);
        res.status(500).json({ error: 'Failed to submit decklist' });
    }
});

// GET /api/tournaments/:tournamentId/decklists — view all decklists for a tournament
router.get('/tournaments/:tournamentId/decklists', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const { tournamentId } = req.params;

        const decklists = db.prepare(`
            SELECT d.*, u.username, u.display_name, u.avatar_url
            FROM decklists d
            JOIN users u ON d.user_id = u.id
            WHERE d.tournament_id = ?
            ORDER BY d.submitted_at
        `).all(tournamentId);

        // Attach cards to each decklist
        const getCards = db.prepare(
            'SELECT * FROM decklist_cards WHERE decklist_id = ? ORDER BY is_sideboard, card_name'
        );

        const result = decklists.map(dl => ({
            ...dl,
            cards: getCards.all(dl.id)
        }));

        res.json({ decklists: result });
    } catch (error) {
        console.error('Get decklists error:', error);
        res.status(500).json({ error: 'Failed to load decklists' });
    }
});

// GET /api/decklists/:id — get single decklist
router.get('/:id', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const decklist = db.prepare(`
            SELECT d.*, u.username, u.display_name
            FROM decklists d
            JOIN users u ON d.user_id = u.id
            WHERE d.id = ?
        `).get(req.params.id);

        if (!decklist) {
            return res.status(404).json({ error: 'Decklist not found' });
        }

        const cards = db.prepare(
            'SELECT * FROM decklist_cards WHERE decklist_id = ? ORDER BY is_sideboard, card_name'
        ).all(req.params.id);

        res.json({ decklist: { ...decklist, cards } });
    } catch (error) {
        console.error('Get decklist error:', error);
        res.status(500).json({ error: 'Failed to load decklist' });
    }
});

// PUT /api/decklists/:id — edit decklist (owner or host after tournament)
router.put('/:id', requireAuth, (req, res) => {
    try {
        const { deckTitle, decklistText } = req.body;
        const db = getDb();

        const decklist = db.prepare('SELECT * FROM decklists WHERE id = ?').get(req.params.id);
        if (!decklist) {
            return res.status(404).json({ error: 'Decklist not found' });
        }

        // Check permissions: owner can edit during tournament, host can edit anytime
        const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?')
            .get(decklist.tournament_id);

        const isOwner = decklist.user_id === req.user.userId;
        const isHost = req.user.role === 'host';
        const tournamentOver = tournament && tournament.status === 'complete';

        if (!isOwner && !(isHost && tournamentOver)) {
            return res.status(403).json({
                error: 'Only the deck owner can edit during a tournament. Host can edit after completion.'
            });
        }

        if (decklistText) {
            const cards = parseDecklistText(decklistText);
            db.prepare('DELETE FROM decklist_cards WHERE decklist_id = ?').run(req.params.id);

            const insertCard = db.prepare(
                'INSERT INTO decklist_cards (decklist_id, card_name, quantity, is_sideboard, image_url) VALUES (?, ?, ?, ?, ?)'
            );

            const lookup = db.prepare(`
                SELECT 
                    (SELECT image_url FROM image_overrides WHERE card_name = ?) as io_img,
                    (SELECT image_url FROM cube_cards WHERE card_name = ? AND version_id = ?) as cc_img,
                    (SELECT image_url FROM cube_cards WHERE card_name = ? LIMIT 1) as fb_img,
                    (CASE WHEN ? IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest')
                          THEN 'https://api.scryfall.com/cards/named?exact=' || REPLACE(?, ' ', '+') || '&format=image'
                          ELSE NULL END) as default_img
            `);

            for (const card of cards) {
                const imgInfo = lookup.get(card.cardName, card.cardName, tournament.cube_version_id, card.cardName, card.cardName, card.cardName);
                const img = imgInfo ? (imgInfo.io_img || imgInfo.cc_img || imgInfo.fb_img || imgInfo.default_img) : null;
                insertCard.run(req.params.id, card.cardName, card.quantity, card.isSideboard ? 1 : 0, img);
            }
        }

        if (deckTitle !== undefined) {
            db.prepare('UPDATE decklists SET deck_title = ? WHERE id = ?')
                .run(deckTitle, req.params.id);
        }

        res.json({ message: 'Decklist updated' });
    } catch (error) {
        console.error('Edit decklist error:', error);
        res.status(500).json({ error: 'Failed to edit decklist' });
    }
});

const { generateDecklistImage } = require('../services/decklist-image');

// GET /api/decklists/:id/image — download decklist image
router.get('/:id/image', async (req, res) => {
    try {
        const imageBuffer = await generateDecklistImage(req.params.id);
        
        // Find decklist for filename
        const db = getDb();
        const decklist = db.prepare('SELECT deck_title FROM decklists WHERE id = ?').get(req.params.id);
        const filename = (decklist?.deck_title || 'decklist').replace(/[^a-z0-9]/gi, '_').toLowerCase();

        res.set('Content-Type', 'image/png');
        res.set('Content-Disposition', `attachment; filename="${filename}.png"`);
        res.send(imageBuffer);
    } catch (error) {
        console.error('Generate decklist image error:', error);
        res.status(500).json({ error: 'Failed to generate decklist image' });
    }
});

// DELETE /api/decklists/:id — delete decklist (host-only)
router.delete('/:id', requireAuth, requireHost, (req, res) => {
    try {
        const db = getDb();
        const decklist = db.prepare('SELECT * FROM decklists WHERE id = ?').get(req.params.id);
        if (!decklist) {
            return res.status(404).json({ error: 'Decklist not found' });
        }
        db.prepare('DELETE FROM decklists WHERE id = ?').run(req.params.id);
        res.json({ message: 'Decklist deleted' });
    } catch (error) {
        console.error('Delete decklist error:', error);
        res.status(500).json({ error: 'Failed to delete decklist' });
    }
});

module.exports = router;
