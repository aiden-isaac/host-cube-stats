/**
 * OCR Engine — Tesseract execution and hOCR bounding-box extraction
 * 
 * Uses node-tesseract-ocr (CLI wrapper) to invoke system Tesseract.
 * Parses hOCR HTML output to extract text lines with bounding boxes and confidence scores.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Run Tesseract OCR on a preprocessed image and extract detected text regions with bounding boxes.
 * 
 * @param {string} imagePath - Path to the preprocessed PNG image
 * @param {object} [options] - Override options
 * @param {string} [options.lang='mtg'] - Tesseract language/traineddata
 * @param {number} [options.psm=11] - Page segmentation mode (11 = sparse text)
 * @param {number} [options.minConfidence=30] - Minimum confidence threshold to include a line
 * @param {number} [options.minTextLength=3] - Minimum text length to include
 * @returns {Promise<Array<{ text: string, bbox: { x: number, y: number, w: number, h: number }, confidence: number }>>}
 */
async function runOcr(imagePath, options = {}) {
    const {
        lang = 'mtg',
        psm = 11,
        minConfidence = 30,
        minTextLength = 3
    } = options;

    // Generate hOCR output
    const hocrOutput = await executeTesstract(imagePath, lang, psm);

    // Parse the hOCR HTML to extract lines with bounding boxes
    const lines = parseHocr(hocrOutput);

    // Filter by confidence and text length
    return lines.filter(line => 
        line.confidence >= minConfidence && 
        line.text.trim().length >= minTextLength
    );
}

/**
 * Execute Tesseract via CLI and return hOCR output.
 */
function executeTesstract(imagePath, lang, psm) {
    return new Promise((resolve, reject) => {
        // The traineddata file location. Check if custom mtg traineddata exists.
        const tessDataDirs = [
            '/usr/share/tessdata',
            '/usr/local/share/tessdata',
            '/app/data/tesseract'
        ];

        // Build Tesseract args: input, output (stdout), language, PSM, hOCR
        const args = [
            imagePath,
            'stdout',                       // Output to stdout
            '-l', lang,                     // Language
            '--psm', String(psm),           // Page segmentation mode
            '--oem', '1',                   // LSTM engine
            '-c', 'tessedit_create_hocr=1', // Generate hOCR output
            '-c', 'hocr_char_boxes=0'       // Don't need char-level boxes
        ];

        execFile('tesseract', args, {
            maxBuffer: 10 * 1024 * 1024, // 10 MB buffer for hOCR
            timeout: 30000               // 30s timeout
        }, (error, stdout, stderr) => {
            if (error) {
                // If the custom language fails, try falling back to English
                if (lang !== 'eng' && error.message.includes('Failed loading language')) {
                    console.warn(`[Scanner] Custom '${lang}' traineddata not found, falling back to 'eng'`);
                    return executeTesstract(imagePath, 'eng', psm)
                        .then(resolve)
                        .catch(reject);
                }
                return reject(new Error(`Tesseract failed: ${error.message}. stderr: ${stderr}`));
            }

            if (stderr && stderr.includes('Error')) {
                console.warn('[Scanner] Tesseract warnings:', stderr.substring(0, 500));
            }

            resolve(stdout);
        });
    });
}

/**
 * Parse hOCR HTML output to extract text lines with bounding boxes and confidence.
 * 
 * hOCR format example:
 *   <span class='ocr_line' title='bbox 120 340 400 375; x_wconf 85'>Baleful Strix</span>
 * 
 * We extract both ocr_line and ocrx_word elements to capture text at the right granularity.
 */
function parseHocr(hocrHtml) {
    const results = [];

    // Match ocr_line spans with title containing bbox and confidence
    // We use both ocr_line (full lines) and ocrx_word (individual words)
    // For card name detection, ocr_line is preferred as names can be multi-word
    const lineRegex = /<span[^>]*class=['"]ocr_line['"][^>]*title=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/span>/gi;
    
    let match;
    while ((match = lineRegex.exec(hocrHtml)) !== null) {
        const titleAttr = match[1];
        const innerHtml = match[2];

        // Extract bbox: "bbox x1 y1 x2 y2"
        const bboxMatch = titleAttr.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (!bboxMatch) continue;

        const x1 = parseInt(bboxMatch[1], 10);
        const y1 = parseInt(bboxMatch[2], 10);
        const x2 = parseInt(bboxMatch[3], 10);
        const y2 = parseInt(bboxMatch[4], 10);

        // Extract confidence: "x_wconf 85"
        const confMatch = titleAttr.match(/x_wconf\s+(\d+)/);
        const confidence = confMatch ? parseInt(confMatch[1], 10) : 50; // Default 50 if not present

        // Strip HTML tags from inner text to get clean text
        const text = innerHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

        if (text) {
            results.push({
                text,
                bbox: {
                    x: x1,
                    y: y1,
                    w: x2 - x1,
                    h: y2 - y1
                },
                confidence
            });
        }
    }

    // If no lines found, try word-level extraction as fallback
    if (results.length === 0) {
        const wordRegex = /<span[^>]*class=['"]ocrx_word['"][^>]*title=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/span>/gi;
        
        while ((match = wordRegex.exec(hocrHtml)) !== null) {
            const titleAttr = match[1];
            const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

            const bboxMatch = titleAttr.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
            if (!bboxMatch || !text) continue;

            const x1 = parseInt(bboxMatch[1], 10);
            const y1 = parseInt(bboxMatch[2], 10);
            const x2 = parseInt(bboxMatch[3], 10);
            const y2 = parseInt(bboxMatch[4], 10);

            const confMatch = titleAttr.match(/x_wconf\s+(\d+)/);
            const confidence = confMatch ? parseInt(confMatch[1], 10) : 50;

            results.push({
                text,
                bbox: {
                    x: x1,
                    y: y1,
                    w: x2 - x1,
                    h: y2 - y1
                },
                confidence
            });
        }
    }

    return results;
}

/**
 * Check if Tesseract is available on the system.
 * @returns {Promise<boolean>}
 */
function isTesseractAvailable() {
    return new Promise((resolve) => {
        execFile('tesseract', ['--version'], (error) => {
            resolve(!error);
        });
    });
}

module.exports = { runOcr, isTesseractAvailable };
