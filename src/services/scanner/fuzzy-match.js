/**
 * Fuzzy Match — Levenshtein-based card name matching against cube dictionary
 * 
 * Sources card names from the cube_cards DB table (current active version).
 * Uses Levenshtein distance for fuzzy matching — optimal for small dictionaries (~500 cards).
 */

const { getDb } = require('../../db/database');

// Configuration
const LOOKUP_DISTANCE = 2;       // Max edit distance for fuzzy matches

// Cached state
let dictionary = null;           // Array of card names
let dictionaryLower = null;      // Lowercase versions for case-insensitive matching
let dictionarySet = null;        // Set for O(1) exact lookup
let cachedVersionId = null;      // Track cube version for invalidation

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
    /^[\d\s/]+$/,                           // Pure numbers / fractions
    /^\d+\/\d+$/,                           // Collector numbers: "123/456"
    /^[WUBRG\d{}]+$/i,                      // Mana symbols: "{2}{W}{U}"
    /^\([^)]+\)$/,                          // Parenthetical reminder text
    /©/,                                    // Copyright notices
    /™/,                                    // Trademark symbols
    /^(Creature|Instant|Sorcery|Enchantment|Artifact|Planeswalker|Land)\s*[—\-]/i,
    /^illus\./i,                            // Artist credits
];

/**
 * Compute Levenshtein distance between two strings.
 * Optimized with early termination when distance exceeds maxDistance.
 */
function levenshtein(a, b, maxDistance = Infinity) {
    const la = a.length;
    const lb = b.length;

    // Quick length-based rejection
    if (Math.abs(la - lb) > maxDistance) return maxDistance + 1;
    if (la === 0) return lb;
    if (lb === 0) return la;

    // Single-row DP
    let prev = new Array(lb + 1);
    let curr = new Array(lb + 1);

    for (let j = 0; j <= lb; j++) prev[j] = j;

    for (let i = 1; i <= la; i++) {
        curr[0] = i;
        let minInRow = curr[0];

        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,       // deletion
                curr[j - 1] + 1,   // insertion
                prev[j - 1] + cost  // substitution
            );
            if (curr[j] < minInRow) minInRow = curr[j];
        }

        // Early termination: if entire row exceeds max, no point continuing
        if (minInRow > maxDistance) return maxDistance + 1;

        [prev, curr] = [curr, prev];
    }

    return prev[lb];
}

/**
 * Initialize or refresh the card dictionary from the cube_cards table.
 */
function ensureDictionary() {
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
        return;
    }

    console.log(`[Scanner] Loading card dictionary for cube version ${currentVersion.id}...`);

    const rows = db.prepare(
        'SELECT DISTINCT card_name FROM cube_cards WHERE version_id = ?'
    ).all(currentVersion.id);

    const cardNames = rows.map(r => r.card_name);

    if (cardNames.length === 0) {
        throw new Error('No cards found in the current cube version.');
    }

    dictionary = cardNames;
    dictionaryLower = cardNames.map(n => n.toLowerCase());
    dictionarySet = new Set(dictionaryLower);
    cachedVersionId = currentVersion.id;

    console.log(`[Scanner] Loaded ${cardNames.length} card names into dictionary.`);
}

/**
 * Check if an OCR text line should be filtered out as noise.
 */
function checkNoise(text, confidence) {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (KEYWORD_BLOCKLIST.has(lower)) {
        return { isNoise: true, reason: 'keyword_blocklist' };
    }

    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { isNoise: true, reason: 'noise_pattern' };
        }
    }

    // Two-word text that looks like artist credit (low confidence)
    const words = trimmed.split(/\s+/);
    if (words.length === 2 && confidence < 70) {
        const looksLikeArtist = words.every(w => /^[A-Z][a-z]+$/.test(w));
        if (looksLikeArtist) {
            return { isNoise: true, reason: 'likely_artist_credit' };
        }
    }

    if (trimmed.length <= 2) {
        return { isNoise: true, reason: 'too_short' };
    }

    return { isNoise: false, reason: null };
}

/**
 * Find the best fuzzy match for a string in the dictionary.
 * Returns { name, distance } or null if no match within maxDistance.
 */
function findBestMatch(text, maxDistance = LOOKUP_DISTANCE) {
    const lower = text.toLowerCase();
    let bestName = null;
    let bestDist = maxDistance + 1;

    for (let i = 0; i < dictionaryLower.length; i++) {
        const dist = levenshtein(lower, dictionaryLower[i], bestDist);
        if (dist < bestDist) {
            bestDist = dist;
            bestName = dictionary[i]; // Return the properly-cased name
            if (dist === 0) break; // Exact match, stop searching
        }
    }

    return bestDist <= maxDistance ? { name: bestName, distance: bestDist } : null;
}

/**
 * Match an array of OCR lines against the cube card dictionary.
 */
function matchLines(ocrLines) {
    ensureDictionary();

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

        // Apply stricter distance for short text
        const maxDist = text.length <= 4 ? 1 : LOOKUP_DISTANCE;
        const match = findBestMatch(text, maxDist);

        if (match) {
            matches.push({
                ocrText: text,
                matchedName: match.name,
                editDistance: match.distance,
                confidence: line.confidence,
                bbox: line.bbox
            });
        } else {
            unmatched.push({
                ocrText: text,
                confidence: line.confidence,
                bbox: line.bbox,
                reason: 'no_dictionary_match'
            });
        }
    }

    return { matches, unmatched };
}

/**
 * Force-reload the dictionary (e.g., after a cube list update).
 */
function invalidateDictionary() {
    dictionary = null;
    dictionaryLower = null;
    dictionarySet = null;
    cachedVersionId = null;
}

module.exports = { matchLines, invalidateDictionary, ensureDictionary };
