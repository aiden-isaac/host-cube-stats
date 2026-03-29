/**
 * OCR Preprocessing — Image preparation for Tesseract using Sharp
 * 
 * Pipeline: resize (max 3000px) → grayscale → normalize (CLAHE-equivalent) → sharpen → optional 2× upscale → PNG
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const TEMP_DIR = '/tmp';
const MAX_WIDTH = 3000;
const MIN_WIDTH_FOR_UPSCALE = 1200; // Below this, 2× upscale for better OCR

/**
 * Preprocess a raw photo buffer for OCR.
 * @param {Buffer} imageBuffer - Raw image data (JPEG/PNG)
 * @returns {Promise<{ processedPath: string, width: number, height: number, scanId: string }>}
 */
async function preprocessImage(imageBuffer) {
    const scanId = randomUUID();
    const processedPath = path.join(TEMP_DIR, `scan_${scanId}.png`);

    // Get original metadata
    const metadata = await sharp(imageBuffer).metadata();
    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    let pipeline = sharp(imageBuffer)
        .rotate() // Auto-rotate based on EXIF
        .grayscale(); // Convert to greyscale

    // Resize: cap at MAX_WIDTH, or upscale if too small
    if (origWidth > MAX_WIDTH) {
        pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    } else if (origWidth < MIN_WIDTH_FOR_UPSCALE && origWidth > 0) {
        // 2× upscale for low-resolution inputs
        pipeline = pipeline.resize({ width: origWidth * 2 });
    }

    // Normalize — stretches the histogram (similar to CLAHE contrast boost)
    pipeline = pipeline.normalize();

    // Sharpen — enhances text edges for better OCR
    pipeline = pipeline.sharpen({
        sigma: 1.5,   // Radius of sharpening
        m1: 1.0,      // Flat areas sharpening
        m2: 3.0       // Edge sharpening (boost)
    });

    // Output as PNG (lossless, best for OCR)
    await pipeline.png().toFile(processedPath);

    // Get processed dimensions
    const processedMeta = await sharp(processedPath).metadata();

    return {
        processedPath,
        width: processedMeta.width,
        height: processedMeta.height,
        scanId
    };
}

/**
 * Extract a cropped region from the processed image as a base64 data URL.
 * @param {string} imagePath - Path to the processed image
 * @param {{ x: number, y: number, w: number, h: number }} bbox - Bounding box
 * @returns {Promise<string>} - base64 data URL (data:image/png;base64,...)
 */
async function extractCrop(imagePath, bbox) {
    try {
        const cropBuffer = await sharp(imagePath)
            .extract({
                left: Math.max(0, bbox.x),
                top: Math.max(0, bbox.y),
                width: Math.max(1, bbox.w),
                height: Math.max(1, bbox.h)
            })
            .png()
            .toBuffer();

        return `data:image/png;base64,${cropBuffer.toString('base64')}`;
    } catch (err) {
        console.error(`[Scanner] Failed to extract crop at (${bbox.x},${bbox.y},${bbox.w},${bbox.h}):`, err.message);
        return null;
    }
}

/**
 * Clean up temporary scan files older than maxAge.
 * @param {number} maxAgeMs - Max age in milliseconds (default: 30 minutes)
 */
function cleanupTempFiles(maxAgeMs = 30 * 60 * 1000) {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();

        for (const file of files) {
            if (!file.startsWith('scan_')) continue;
            const fullPath = path.join(TEMP_DIR, file);
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(fullPath);
            }
        }
    } catch (err) {
        // Non-critical, log and continue
        console.error('[Scanner] Temp cleanup error:', err.message);
    }
}

module.exports = { preprocessImage, extractCrop, cleanupTempFiles };
