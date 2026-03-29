/**
 * Fuzzy Match — SymSpell-based card name matching against cube dictionary
 * 
 * Sources card names from the cube_cards DB table (current active version).
 * Uses SymSpell Symmetric Delete algorithm for fast fuzzy matching of OCR text.
 */

const { getDb } = require('../../db/database');

// SymSpell configuration
const MAX_EDIT_DISTANCE = 3;     // Dictionary pre-computation distance
const LOOKUP_DISTANCE = 2;       // Runtime max edit distance for lookups
const PREFIX_LENGTH = 7;

// Cached state
let dictionary = null;           // Set of card names for O(1) exact lookup
let symspellDict = null;         // SymSpell instance
let cachedVersionId = null;      // Track cube version for invalidation
let SymSpell = null;             // Lazy-loaded module reference

// Common MTG keywords that should NOT be treated as card names
const KEYWORD_BLOCKLIST = new Set([
    // Evergreen keywords
    'flying', 'trample', 'haste', 'vigilance', 'reach', 'deathtouch',
    'lifelink', 'menace', 'first', 'strike', 'double', 'flash',
    'defender', 'hexproof', 'indestructible', 'prowess', 'ward',
    // Common rules text words
    'creature', 'instant', 'sorcery', 'enchantment', 'artifact',
    'planeswalker', 'land', 'legendary', 'tribal', 'token',
    'tap', 'untap', 'draw', 'discard', 'sacrifice', 'destroy',
    'exile', 'return', 'target', 'player', 'opponent', 'controller',
    'damage', 'life', 'counter', 'mana', 'color', 'spell', 'ability',
    'graveyard', 'library', 'hand', 'battlefield', 'stack',
    'combat', 'attack', 'block', 'phase', 'step', 'turn', 'end',
    'beginning', 'upkeep', 'main', 'declare', 'attackers', 'blockers',
    // Type lines
    'human', 'wizard', 'soldier', 'warrior', 'knight', 'elf', 'goblin',
    'zombie', 'vampire', 'angel', 'demon', 'dragon', 'beast', 'elemental',
    'spirit', 'rogue', 'cleric', 'shaman', 'druid', 'merfolk', 'faerie',
    // Common noise
    'the', 'of', 'and', 'in', 'to', 'for', 'with', 'from', 'at', 'by',
    'rare', 'uncommon', 'common', 'mythic'
]);

// Regex patterns for non-card text
const NOISE_PATTERNS = [
    /^[\d\s/]+$/,                           // Pure numbers / fractions (collector numbers)
    /^\d+\/\d+$/,                           // Set collector numbers: "123/456"
    /^[WUBRG\d{}]+$/i,                      // Mana symbols: "{2}{W}{U}"
    /^\([^)]+\)$/,                          // Parenthetical reminder text
    /©/,                                    // Copyright notices
    /™/,                                    // Trademark symbols
    /^(Creature|Instant|Sorcery|Enchantment|Artifact|Planeswalker|Land)\s*[—\-]/i, // Type lines with dash
    /^illus\./i,                            // Artist credits
];

/**
 * Initialize or refresh the card dictionary from the cube_cards table.
 * Called lazily on first scan, and refreshes if cube version changed.
 */
async function ensureDictionary() {
    const db = getDb();

    // Get current active cube version
    const currentVersion = db.prepare(
        'SELECT id FROM cube_versions WHERE end_date IS NULL ORDER BY id DESC LIMIT 1'
    ).get();

    if (!currentVersion) {
        throw new Error('No active cube version found. Upload a cube list first.');
    }

    // Check if we need to rebuild
    if (dictionary && cachedVersionId === currentVersion.id) {
        return; // Already loaded and current
    }

    console.log(`[Scanner] Loading card dictionary for cube version ${currentVersion.id}...`);

    // Fetch all card names from the current cube version
    const rows = db.prepare(
        'SELECT DISTINCT card_name FROM cube_cards WHERE version_id = ?'
    ).all(currentVersion.id);

    const cardNames = rows.map(r => r.card_name);

    if (cardNames.length === 0) {
        throw new Error('No cards found in the current cube version.');
    }

    // Build exact lookup set
    dictionary = new Set(cardNames.map(n => n.toLowerCase()));

    // Build SymSpell dictionary
    // Lazy-load symspell-ex
    if (!SymSpell) {
        try {
            SymSpell = require('symspell-ex');
        } catch (err) {
            throw new Error('symspell-ex not installed. Run: npm install symspell-ex');
        }
    }

    symspellDict = new SymSpell.SymSpell(MAX_EDIT_DISTANCE, PREFIX_LENGTH);

    // Add each card name to the SymSpell dictionary with frequency 1
    for (const name of cardNames) {
        symspellDict.createDictionaryEntry(name, 1);
    }

    cachedVersionId = currentVersion.id;
    console.log(`[Scanner] Loaded ${cardNames.length} card names into dictionary.`);
}

/**
 * Check if an OCR text line should be filtered out as noise.
 * @param {string} text - The OCR detected text
 * @param {number} confidence - Tesseract confidence score
 * @returns {{ isNoise: boolean, reason: string | null }}
 */
function checkNoise(text, confidence) {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // Single word in keyword blocklist
    if (KEYWORD_BLOCKLIST.has(lower)) {
        return { isNoise: true, reason: 'keyword_blocklist' };
    }

    // Check regex noise patterns
    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { isNoise: true, reason: 'noise_pattern' };
        }
    }

    // Two-word max text that looks like artist credit (low confidence)
    const words = trimmed.split(/\s+/);
    if (words.length === 2 && confidence < 70) {
        const looksLikeArtist = words.every(w => /^[A-Z][a-z]+$/.test(w));
        if (looksLikeArtist) {
            return { isNoise: true, reason: 'likely_artist_credit' };
        }
    }

    // Very short text with low confidence
    if (trimmed.length <= 2) {
        return { isNoise: true, reason: 'too_short' };
    }

    return { isNoise: false, reason: null };
}

/**
 * Match an array of OCR lines against the cube card dictionary.
 * 
 * @param {Array<{ text: string, bbox: object, confidence: number }>} ocrLines
 * @returns {Promise<{ matches: Array, unmatched: Array }>}
 */
async function matchLines(ocrLines) {
    await ensureDictionary();

    const matches = [];
    const unmatched = [];

    for (const line of ocrLines) {
        const text = line.text.trim();
        const lower = text.toLowerCase();

        // Check for noise first
        const { isNoise, reason } = checkNoise(text, line.confidence);
        if (isNoise) {
            unmatched.push({
                ocrText: text,
                confidence: line.confidence,
                bbox: line.bbox,
                reason
            });
            continue;
        }

        // 1. Try exact match
        if (dictionary.has(lower)) {
            // Find the correctly-cased name from the dictionary
            const exactName = findExactName(lower);
            matches.push({
                ocrText: text,
                matchedName: exactName,
                editDistance: 0,
                confidence: line.confidence,
                bbox: line.bbox
            });
            continue;
        }

        // 2. Try SymSpell fuzzy match
        const suggestions = symspellDict.lookup(text, SymSpell.Verbosity.Closest, LOOKUP_DISTANCE);

        if (suggestions && suggestions.length > 0) {
            const best = suggestions[0];

            // Apply stricter rules for short text
            const maxAllowedDistance = text.length <= 4 ? 1 : LOOKUP_DISTANCE;
            if (best.distance <= maxAllowedDistance) {
                matches.push({
                    ocrText: text,
                    matchedName: best.term,
                    editDistance: best.distance,
                    confidence: line.confidence,
                    bbox: line.bbox
                });
                continue;
            }
        }

        // 3. No match found
        unmatched.push({
            ocrText: text,
            confidence: line.confidence,
            bbox: line.bbox,
            reason: 'no_dictionary_match'
        });
    }

    return { matches, unmatched };
}

/**
 * Find the correctly-cased name from the DB for a lowercase match.
 */
function findExactName(lowerName) {
    const db = getDb();
    const row = db.prepare(
        'SELECT card_name FROM cube_cards WHERE version_id = ? AND LOWER(card_name) = ? LIMIT 1'
    ).get(cachedVersionId, lowerName);
    return row ? row.card_name : lowerName;
}

/**
 * Force-reload the dictionary (e.g., after a cube list update).
 */
function invalidateDictionary() {
    dictionary = null;
    symspellDict = null;
    cachedVersionId = null;
}

module.exports = { matchLines, invalidateDictionary, ensureDictionary };
