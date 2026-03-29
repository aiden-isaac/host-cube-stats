const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, requireHost } = require('../middleware/auth');
const { fetchCardData, fetchBulkCardData } = require('../services/scryfall');

const router = express.Router();

// GET /api/cube/versions — list all versions
router.get('/versions', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const versions = db.prepare(`
            SELECT cv.*, u.username as created_by_name,
                   (SELECT COUNT(*) FROM cube_cards WHERE version_id = cv.id) as card_count
            FROM cube_versions cv
            LEFT JOIN users u ON cv.created_by = u.id
            ORDER BY cv.start_date DESC
        `).all();

        res.json({ versions });
    } catch (error) {
        console.error('Get versions error:', error);
        res.status(500).json({ error: 'Failed to load versions' });
    }
});

// GET /api/cube/current — get current (active) version with cards
router.get('/current', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const version = db.prepare(`
            SELECT cv.*, u.username as created_by_name
            FROM cube_versions cv
            LEFT JOIN users u ON cv.created_by = u.id
            WHERE cv.end_date IS NULL
            ORDER BY cv.created_at DESC LIMIT 1
        `).get();

        if (!version) {
            return res.json({ version: null, cards: [] });
        }

        const cards = db.prepare(`
            SELECT cc.*, io.image_url as override_image_url
            FROM cube_cards cc
            LEFT JOIN image_overrides io ON cc.card_name = io.card_name
            WHERE cc.version_id = ?
            ORDER BY cc.card_name
        `).all(version.id);

        res.json({ version, cards });
    } catch (error) {
        console.error('Get current version error:', error);
        res.status(500).json({ error: 'Failed to load current cube version' });
    }
});

// GET /api/cube/version/:id — get specific version with cards
router.get('/version/:id', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const version = db.prepare(`
            SELECT cv.*, u.username as created_by_name
            FROM cube_versions cv
            LEFT JOIN users u ON cv.created_by = u.id
            WHERE cv.id = ?
        `).get(req.params.id);

        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }

        const cards = db.prepare(`
            SELECT cc.*, io.image_url as override_image_url
            FROM cube_cards cc
            LEFT JOIN image_overrides io ON cc.card_name = io.card_name
            WHERE cc.version_id = ?
            ORDER BY cc.card_name
        `).all(version.id);

        res.json({ version, cards });
    } catch (error) {
        console.error('Get version error:', error);
        res.status(500).json({ error: 'Failed to load cube version' });
    }
});

// GET /api/cube/version/:id/stats — get card stats (inclusion & win rates)
router.get('/version/:id/stats', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const versionId = req.params.id;

        const cardsInVersion = db.prepare(`SELECT card_name FROM cube_cards WHERE version_id = ?`).all(versionId).map(c => c.card_name);

        const stats = db.prepare(`
            SELECT 
                dc.card_name,
                COUNT(DISTINCT dc.decklist_id) as inclusion_count,
                SUM(
                    CASE WHEN m.player1_id = d.user_id THEN m.player1_wins
                         WHEN m.player2_id = d.user_id THEN m.player2_wins
                         ELSE 0 END
                ) as total_game_wins,
                SUM(
                    CASE WHEN m.player1_id = d.user_id THEN m.player1_wins + m.player2_wins
                         WHEN m.player2_id = d.user_id THEN m.player1_wins + m.player2_wins
                         ELSE 0 END
                ) as total_games_played
            FROM decklist_cards dc
            JOIN decklists d ON dc.decklist_id = d.id
            JOIN tournaments t ON d.tournament_id = t.id
            LEFT JOIN matches m ON m.tournament_id = t.id AND (m.player1_id = d.user_id OR m.player2_id = d.user_id) AND m.status = 'complete'
            WHERE dc.is_sideboard = 0
            GROUP BY dc.card_name
        `).all();

        const legalDecklists = db.prepare(`
            SELECT 
                cc.card_name,
                COUNT(DISTINCT d.id) as total_decklists
            FROM cube_cards cc
            JOIN tournaments t ON t.cube_version_id = cc.version_id
            JOIN decklists d ON d.tournament_id = t.id
            GROUP BY cc.card_name
        `).all();
        
        const legalMap = {};
        for (const l of legalDecklists) {
            legalMap[l.card_name] = l.total_decklists;
        }

        const statsMap = {};
        for (const s of stats) {
            if (cardsInVersion.includes(s.card_name)) {
                const totalDecklists = legalMap[s.card_name] || 0;
                statsMap[s.card_name] = {
                    inclusionRate: totalDecklists > 0 ? ((s.inclusion_count / totalDecklists) * 100).toFixed(1) : 0,
                    winRate: s.total_games_played > 0 ? ((s.total_game_wins / s.total_games_played) * 100).toFixed(1) : 0,
                    inclusionCount: s.inclusion_count,
                    totalDecklists
                };
            }
        }

        res.json({ stats: statsMap });
    } catch (error) {
        console.error('Get version stats error:', error);
        res.status(500).json({ error: 'Failed to load cube version stats' });
    }
});

// POST /api/cube/version — create new version (host-only)
router.post('/version', requireAuth, requireHost, async (req, res) => {
    try {
        const { name, startDate, cardNames, adds, removes, addCardName, replaceCardName } = req.body;

        if (!name || !startDate) {
            return res.status(400).json({ error: 'Name and startDate required' });
        }

        let uniqueCards = [];
        const db = getDb();

        if (cardNames && Array.isArray(cardNames)) {
            const cleanedNames = cardNames.map(n => {
                const trimmed = String(n).trim();
                const match = trimmed.match(/^(\d+)x?\s+(.+)$/i);
                const rawName = match ? match[2].trim() : trimmed;
                return rawName.split('//')[0].trim();
            }).filter(Boolean);
            uniqueCards = [...new Set(cleanedNames)];
        } else if (adds || removes || addCardName) {
            const currentVersion = db.prepare(
                'SELECT id FROM cube_versions WHERE end_date IS NULL ORDER BY created_at DESC LIMIT 1'
            ).get();

            if (!currentVersion) {
                return res.status(400).json({ error: 'No current version to update from' });
            }

            const currentCards = db.prepare('SELECT card_name FROM cube_cards WHERE version_id = ?').all(currentVersion.id);
            let currentNames = currentCards.map(c => c.card_name);

            const toRemove = (removes || []).map(n => n.toLowerCase());
            if (replaceCardName) toRemove.push(replaceCardName.toLowerCase());

            if (toRemove.length > 0) {
                currentNames = currentNames.filter(n => !toRemove.includes(n.toLowerCase()));
            }

            const toAdd = adds || [];
            if (addCardName) toAdd.push(addCardName);

            toAdd.forEach(addName => {
                let finalAddName = addName.trim();
                if (finalAddName.includes('//')) finalAddName = finalAddName.split('//')[0].trim();
                if (finalAddName) currentNames.push(finalAddName);
            });

            uniqueCards = [...new Set(currentNames)];
        } else {
            return res.status(400).json({ error: 'Must provide either cardNames array or adds/removes' });
        }

        // Validate via Scryfall synchronously
        const { validateAndFetchCards } = require('../services/scryfall');
        const { cards, notFound } = await validateAndFetchCards(uniqueCards);

        if (notFound.length > 0) {
            return res.status(400).json({
                error: 'Could not resolve the following cards on Scryfall: ' + notFound.join(', '),
                missing: notFound
            });
        }

        // Close out current version
        db.prepare('UPDATE cube_versions SET end_date = ? WHERE end_date IS NULL')
            .run(startDate);

        // Create new version
        const result = db.prepare(
            'INSERT INTO cube_versions (name, start_date, created_by) VALUES (?, ?, ?)'
        ).run(name, startDate, req.user.userId);

        const versionId = result.lastInsertRowid;

        // Insert fully hydrated cards immediately
        const insertCard = db.prepare(`
            INSERT INTO cube_cards (version_id, card_name, scryfall_id, image_url, art_crop_url, artist, type_line, cmc) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const upsertArtwork = db.prepare(`
            INSERT INTO cached_artworks (card_name, art_crop_url, artist)
            VALUES (?, ?, ?)
            ON CONFLICT(card_name) DO UPDATE SET art_crop_url = ?, artist = ?
        `);

        const insertMany = db.transaction((resolvedCards) => {
            for (const c of resolvedCards) {
                let finalName = c.name;
                if (finalName.includes('//')) {
                    finalName = finalName.split('//')[0].trim();
                }

                insertCard.run(versionId, finalName, c.scryfallId, c.imageUrl, c.artCropUrl, c.artist, c.typeLine, c.cmc);

                if (c.artCropUrl) {
                    upsertArtwork.run(finalName, c.artCropUrl, c.artist, c.artCropUrl, c.artist);
                }
            }
        });
        
        insertMany(cards);

        res.json({
            message: 'Cube version created and all cards fully validated',
            version: { id: versionId, name, startDate, cardCount: cards.length }
        });
    } catch (error) {
        console.error('Create version error:', error);
        res.status(500).json({ error: 'Failed to create cube version' });
    }
});

// PUT /api/cube/version/:id — update version metadata (host-only)
router.put('/version/:id', requireAuth, requireHost, (req, res) => {
    try {
        const { name, startDate, endDate } = req.body;
        const db = getDb();

        const version = db.prepare('SELECT * FROM cube_versions WHERE id = ?').get(req.params.id);
        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }

        db.prepare(`
            UPDATE cube_versions SET name = COALESCE(?, name), 
            start_date = COALESCE(?, start_date),
            end_date = COALESCE(?, end_date)
            WHERE id = ?
        `).run(name || null, startDate || null, endDate || null, req.params.id);

        res.json({ message: 'Version updated' });
    } catch (error) {
        console.error('Update version error:', error);
        res.status(500).json({ error: 'Failed to update version' });
    }
});

// DELETE /api/cube/version/:id — delete a version (host-only)
router.delete('/version/:id', requireAuth, requireHost, (req, res) => {
    try {
        const db = getDb();
        const versionId = req.params.id;

        // Ensure not the only version
        const count = db.prepare('SELECT COUNT(*) as c FROM cube_versions').get().c;
        if (count <= 1) {
            return res.status(400).json({ error: 'Cannot delete the only cube version' });
        }

        // Check for tournaments
        const tCount = db.prepare('SELECT COUNT(*) as c FROM tournaments WHERE cube_version_id = ?').get(versionId).c;
        if (tCount > 0) {
            return res.status(400).json({ error: 'Cannot delete a version that has been used in a tournament' });
        }

        const version = db.prepare('SELECT * FROM cube_versions WHERE id = ?').get(versionId);
        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }

        // If it's the current active version, activate the most recent one
        if (!version.end_date) {
            const prev = db.prepare('SELECT id FROM cube_versions WHERE id != ? ORDER BY created_at DESC LIMIT 1').get(versionId);
            if (prev) {
                db.prepare('UPDATE cube_versions SET end_date = NULL WHERE id = ?').run(prev.id);
            }
        }

        db.prepare('DELETE FROM cube_versions WHERE id = ?').run(versionId);

        res.json({ message: 'Version deleted successfully' });
    } catch (error) {
        console.error('Delete version error:', error);
        res.status(500).json({ error: 'Failed to delete version' });
    }
});

// POST /api/cube/image-override — set custom card art
router.post('/image-override', requireAuth, (req, res) => {
    try {
        const { cardName, imageUrl } = req.body;

        if (!cardName || !imageUrl) {
            return res.status(400).json({ error: 'cardName and imageUrl required' });
        }

        const db = getDb();
        db.prepare(`
            INSERT INTO image_overrides (card_name, image_url, set_by) 
            VALUES (?, ?, ?)
            ON CONFLICT(card_name) DO UPDATE SET image_url = ?, set_by = ?
        `).run(cardName, imageUrl, req.user.userId, imageUrl, req.user.userId);

        res.json({ message: 'Image override saved' });
    } catch (error) {
        console.error('Image override error:', error);
        res.status(500).json({ error: 'Failed to save image override' });
    }
});

// GET /api/cube/random-artwork — get random art for login background
router.get('/random-artwork', (req, res) => {
    try {
        const db = getDb();
        const artwork = db.prepare(`
            SELECT * FROM cached_artworks ORDER BY RANDOM() LIMIT 1
        `).get();

        if (!artwork) {
            return res.json({ artwork: null });
        }

        res.json({ artwork });
    } catch (error) {
        console.error('Random artwork error:', error);
        res.status(500).json({ error: 'Failed to load artwork' });
    }
});

// GET /api/cube/overrides — get all global image overrides
router.get('/overrides', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const overrides = db.prepare('SELECT card_name, image_url FROM image_overrides').all();
        
        const overridesMap = {};
        for (const o of overrides) {
            overridesMap[o.card_name] = o.image_url;
        }

        res.json({ overrides: overridesMap });
    } catch (error) {
        console.error('Get overrides error:', error);
        res.status(500).json({ error: 'Failed to load image overrides' });
    }
});

module.exports = router;
