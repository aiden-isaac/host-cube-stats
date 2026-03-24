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

        const totalDecklists = db.prepare(`
            SELECT COUNT(*) as count 
            FROM decklists d 
            JOIN tournaments t ON d.tournament_id = t.id 
            WHERE t.cube_version_id = ?
        `).get(versionId).count;

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
            WHERE t.cube_version_id = ? AND dc.is_sideboard = 0
            GROUP BY dc.card_name
        `).all(versionId);

        const statsMap = {};
        for (const s of stats) {
            statsMap[s.card_name] = {
                inclusionRate: totalDecklists > 0 ? ((s.inclusion_count / totalDecklists) * 100).toFixed(1) : 0,
                winRate: s.total_games_played > 0 ? ((s.total_game_wins / s.total_games_played) * 100).toFixed(1) : 0,
                inclusionCount: s.inclusion_count,
                totalDecklists
            };
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
        const { name, startDate, cardNames } = req.body;

        if (!name || !startDate || !cardNames || !Array.isArray(cardNames)) {
            return res.status(400).json({ error: 'Name, startDate, and cardNames array required' });
        }

        // Clean card names: strip quantities (e.g. "2x Lightning Bolt" -> "Lightning Bolt")
        const cleanedNames = cardNames.map(n => {
            const trimmed = String(n).trim();
            const match = trimmed.match(/^(\d+)x?\s+(.+)$/i);
            const rawName = match ? match[2].trim() : trimmed;
            return rawName.split('//')[0].trim();
        }).filter(Boolean);

        const uniqueCards = [...new Set(cleanedNames)];

        // Validate via Scryfall synchronously
        const { validateAndFetchCards } = require('../services/scryfall');
        const { cards, notFound } = await validateAndFetchCards(uniqueCards);

        if (notFound.length > 0) {
            return res.status(400).json({
                error: 'Could not resolve the following cards on Scryfall: ' + notFound.join(', '),
                missing: notFound
            });
        }

        const db = getDb();

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
