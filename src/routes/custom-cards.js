const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { requireAuth, requireHost } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/custom_cards');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `custom-card-${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

router.get('/', requireAuth, (req, res) => {
    try {
        const db = getDb();
        const cards = db.prepare('SELECT * FROM custom_cards ORDER BY card_name ASC').all();
        res.json({ cards });
    } catch (err) {
        console.error('Failed to get custom cards', err);
        res.status(500).json({ error: 'Failed to load custom cards' });
    }
});

router.post('/', requireAuth, requireHost, upload.single('image'), (req, res) => {
    const cardName = req.body.card_name;
    const file = req.file;
    if (!cardName || !file) {
        return res.status(400).json({ error: 'Card name and image are required' });
    }

    try {
        const db = getDb();
        const imageUrl = `/uploads/custom_cards/${file.filename}`;

        db.prepare('INSERT INTO custom_cards (card_name, image_url) VALUES (?, ?)').run(cardName, imageUrl);
        // Also add an image override so it shows up in decklists and cube properly
        db.prepare(`
            INSERT INTO image_overrides (card_name, image_url, set_by)
            VALUES (?, ?, ?)
            ON CONFLICT(card_name) DO UPDATE SET image_url = excluded.image_url, set_by = excluded.set_by
        `).run(cardName, imageUrl, req.user.userId);

        res.json({ success: true, card: { card_name: cardName, image_url: imageUrl } });
    } catch (err) {
        console.error('Failed to create custom card', err);
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'A custom card with this name already exists' });
        }
        res.status(500).json({ error: 'Failed to create custom card' });
    }
});

router.delete('/:id', requireAuth, requireHost, (req, res) => {
    try {
        const db = getDb();
        const id = req.params.id;
        const card = db.prepare('SELECT * FROM custom_cards WHERE id = ?').get(id);
        if (card) {
            db.prepare('DELETE FROM custom_cards WHERE id = ?').run(id);
            // Optionally delete from overrides
            // db.prepare('DELETE FROM image_overrides WHERE card_name = ?').run(card.card_name);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to delete custom card', err);
        res.status(500).json({ error: 'Failed to delete custom card' });
    }
});

module.exports = router;
