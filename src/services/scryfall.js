/**
 * Scryfall API Service
 * Handles card data fetching, art_crop caching, rate limiting, DFC normalization.
 * Scryfall asks for 50-100ms between requests.
 */

const { getDb } = require('../db/database');

const SCRYFALL_BASE = 'https://api.scryfall.com';
const RATE_LIMIT_MS = 100;

let lastRequestTime = 0;

async function rateLimitedFetch(url) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
    }
    lastRequestTime = Date.now();
    const response = await fetch(url);
    return response;
}

/**
 * Fetch card data from Scryfall by exact or fuzzy name
 */
async function fetchCardData(cardName) {
    try {
        const response = await rateLimitedFetch(
            `${SCRYFALL_BASE}/cards/named?fuzzy=${encodeURIComponent(cardName)}`
        );

        if (!response.ok) return null;

        const data = await response.json();
        return parseCardData(data);
    } catch (error) {
        console.error(`Scryfall fetch error for "${cardName}":`, error.message);
        return null;
    }
}

/**
 * Parse Scryfall card response into our format
 */
function parseCardData(data) {
    let imageUrl = null;
    let artCropUrl = null;
    let artist = data.artist || 'Unknown';

    // Handle double-faced cards
    if (data.image_uris) {
        imageUrl = data.image_uris.normal || data.image_uris.small;
        artCropUrl = data.image_uris.art_crop;
    } else if (data.card_faces && data.card_faces[0]) {
        const face = data.card_faces[0];
        if (face.image_uris) {
            imageUrl = face.image_uris.normal || face.image_uris.small;
            artCropUrl = face.image_uris.art_crop;
        }
        artist = face.artist || artist;
    }

    return {
        name: data.name,
        scryfallId: data.id,
        imageUrl,
        artCropUrl,
        artist,
        typeLine: data.type_line || '',
        cmc: data.cmc || 0
    };
}

/**
 * Fetch card data for all cards in a cube version (background job).
 * Updates cube_cards rows and populates cached_artworks table.
 */
async function fetchBulkCardData(versionId, cardNames) {
    const db = getDb();
    const updateCard = db.prepare(`
        UPDATE cube_cards SET scryfall_id = ?, image_url = ?, art_crop_url = ?, artist = ?, type_line = ?, cmc = ?
        WHERE version_id = ? AND card_name = ?
    `);

    const upsertArtwork = db.prepare(`
        INSERT INTO cached_artworks (card_name, art_crop_url, artist)
        VALUES (?, ?, ?)
        ON CONFLICT(card_name) DO UPDATE SET art_crop_url = ?, artist = ?
    `);

    let processed = 0;
    const total = cardNames.length;

    for (const cardName of cardNames) {
        const cardData = await fetchCardData(cardName);

        if (cardData) {
            updateCard.run(
                cardData.scryfallId, cardData.imageUrl, cardData.artCropUrl, cardData.artist, cardData.typeLine, cardData.cmc,
                versionId, cardName
            );

            // Cache artwork for login backgrounds
            if (cardData.artCropUrl) {
                upsertArtwork.run(
                    cardName, cardData.artCropUrl, cardData.artist,
                    cardData.artCropUrl, cardData.artist
                );
            }
        }

        processed++;
        if (processed % 50 === 0) {
            console.log(`📸 Scryfall: ${processed}/${total} cards fetched`);
        }
    }

    console.log(`📸 Scryfall: Done! ${processed}/${total} cards fetched for version ${versionId}`);
}

/**
 * Search Scryfall for all printings of a card (for art picker)
 */
async function searchPrintings(query) {
    try {
        const response = await rateLimitedFetch(
            `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released`
        );

        if (!response.ok) return [];

        const data = await response.json();
        return (data.data || []).map(card => ({
            id: card.id,
            name: card.name,
            set: card.set_name,
            setCode: card.set,
            imageUrl: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal,
            artCropUrl: card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop,
            artist: card.artist
        }));
    } catch (error) {
        console.error(`Scryfall search error for "${query}":`, error.message);
        return [];
    }
}

/**
 * Bulk validate and fetch cards synchronously via Scryfall collection
 */
async function validateAndFetchCards(cardNames) {
    const uniqueNames = [...new Set(cardNames)];
    const chunks = [];
    for (let i = 0; i < uniqueNames.length; i += 75) {
        chunks.push(uniqueNames.slice(i, i + 75));
    }

    const allCards = [];
    const notFound = [];

    for (const chunk of chunks) {
        const payload = {
            identifiers: chunk.map(name => ({ name }))
        };

        const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const body = await res.json();
            if (body.not_found) {
                notFound.push(...body.not_found.map(i => i.name));
            }
            if (body.data) {
                allCards.push(...body.data.map(parseCardData));
            }
        } else {
            const body = await res.json();
            if (body.data) {
                allCards.push(...body.data.map(parseCardData));
            }
        }
        await new Promise(r => setTimeout(r, 100)); // rate limit
    }

    return { cards: allCards, notFound };
}

module.exports = { fetchCardData, fetchBulkCardData, searchPrintings, validateAndFetchCards };
