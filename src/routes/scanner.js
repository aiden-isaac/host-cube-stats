/**
 * Scanner Route — POST /api/scanner/scan
 * 
 * Accepts a photo upload, runs the OCR pipeline, and returns matched card names
 * with bounding boxes and crop data for the verification UI.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const { requireAuth } = require('../middleware/auth');
const { preprocessImage, extractCrop, cleanupTempFiles } = require('../services/scanner/ocr-preprocess');
const { runOcr, isTesseractAvailable } = require('../services/scanner/ocr-engine');
const { matchLines } = require('../services/scanner/fuzzy-match');

const router = express.Router();

// Multer config: accept single image, max 10 MB, store in /tmp
const upload = multer({
    dest: '/tmp',
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP images are accepted'));
        }
    }
});

// Store scan images temporarily for the full-image view
const scanImages = new Map(); // scanId → { path, createdAt }

/**
 * POST /api/scanner/scan — Upload and scan a card photo
 * 
 * Body: multipart/form-data with field "photo"
 * Returns: matched cards with bounding boxes + crop data
 */
router.post('/scan', requireAuth, upload.single('photo'), async (req, res) => {
    const startTime = Date.now();

    if (!req.file) {
        return res.status(400).json({ error: 'No photo uploaded. Send a "photo" field.' });
    }

    try {
        // 1. Read the uploaded file
        const imageBuffer = fs.readFileSync(req.file.path);

        // 2. Preprocess the image
        const { processedPath, width, height, scanId } = await preprocessImage(imageBuffer);

        // Store the scan image for later retrieval
        scanImages.set(scanId, { path: processedPath, createdAt: Date.now() });

        // 3. Run Tesseract OCR
        const ocrLines = await runOcr(processedPath);

        // 4. Fuzzy match against cube dictionary
        const { matches, unmatched } = await matchLines(ocrLines);

        // 5. Generate crop data for each match
        const matchesWithCrops = await Promise.all(
            matches.map(async (match) => ({
                id: randomUUID(),
                ocrText: match.ocrText,
                matchedName: match.matchedName,
                confidence: match.confidence,
                editDistance: match.editDistance,
                bbox: match.bbox,
                cropDataUrl: await extractCrop(processedPath, match.bbox)
            }))
        );

        const unmatchedWithIds = unmatched.map(u => ({
            id: randomUUID(),
            ...u
        }));

        // 6. Clean up the uploaded temp file (not the processed one — that's needed for image view)
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }

        const processingTimeMs = Date.now() - startTime;

        res.json({
            scanId,
            matches: matchesWithCrops,
            unmatched: unmatchedWithIds,
            imageWidth: width,
            imageHeight: height,
            imagePath: `/api/scanner/image/${scanId}`,
            stats: {
                totalRegions: ocrLines.length + unmatched.length,
                matched: matches.length,
                filtered: unmatched.filter(u => u.reason !== 'no_dictionary_match').length,
                unmatched: unmatched.filter(u => u.reason === 'no_dictionary_match').length,
                processingTimeMs
            }
        });

    } catch (error) {
        console.error('[Scanner] Scan error:', error);

        // Clean up uploaded file on error
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }

        // Provide specific error messages
        if (error.message.includes('Tesseract failed') || error.message.includes('ENOENT')) {
            return res.status(503).json({
                error: 'OCR engine not available. Ensure tesseract-ocr is installed.',
                detail: error.message
            });
        }
        if (error.message.includes('No active cube version') || error.message.includes('No cards found')) {
            return res.status(503).json({
                error: error.message
            });
        }
        if (error.message.includes('symspell-ex')) {
            return res.status(503).json({
                error: 'Card dictionary not initialized. Run: npm install symspell-ex'
            });
        }

        res.status(500).json({ error: 'Scan failed', detail: error.message });
    }
});

/**
 * GET /api/scanner/image/:scanId — Serve the processed scan image
 */
router.get('/image/:scanId', requireAuth, (req, res) => {
    const { scanId } = req.params;
    const scanData = scanImages.get(scanId);

    if (!scanData || !fs.existsSync(scanData.path)) {
        return res.status(404).json({ error: 'Scan image not found or expired' });
    }

    res.set('Content-Type', 'image/png');
    res.sendFile(scanData.path);
});

/**
 * GET /api/scanner/status — Check if scanner is available
 */
router.get('/status', requireAuth, async (req, res) => {
    const available = await isTesseractAvailable();
    res.json({
        tesseractAvailable: available,
        message: available
            ? 'Scanner is ready'
            : 'Tesseract OCR is not installed. Install with: apt install tesseract-ocr'
    });
});

// Cleanup old scan images every 10 minutes
setInterval(() => {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    for (const [scanId, data] of scanImages.entries()) {
        if (now - data.createdAt > maxAge) {
            try { fs.unlinkSync(data.path); } catch (e) { /* ignore */ }
            scanImages.delete(scanId);
        }
    }

    // Also clean up any orphaned temp files
    cleanupTempFiles(maxAge);
}, 10 * 60 * 1000);

module.exports = router;
