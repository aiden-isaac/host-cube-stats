const sharp = require('sharp');
const { getDb } = require('../db/database');

function extractColumns(cards) {
    const cols = [];
    const maindeck = cards.filter(c => !c.is_sideboard);
    const sideboard = cards.filter(c => c.is_sideboard);

    const basicLandNames = ['plains', 'island', 'swamp', 'mountain', 'forest', 'snow-covered plains', 'snow-covered island', 'snow-covered swamp', 'snow-covered mountain', 'snow-covered forest', 'wastes'];
    const allLands = maindeck.filter(c => (c.type_line || '').toLowerCase().includes('land'));
    const lands = allLands.filter(c => !basicLandNames.includes(c.card_name.toLowerCase()));
    
    const rawBasics = allLands.filter(c => basicLandNames.includes(c.card_name.toLowerCase()));
    const basicsMap = {};
    for (const b of rawBasics) {
        if (!basicsMap[b.card_name]) {
            basicsMap[b.card_name] = { ...b };
        } else {
            basicsMap[b.card_name].quantity += b.quantity;
        }
    }
    const basics = Object.values(basicsMap).sort((a, b) => a.card_name.localeCompare(b.card_name));

    const nonLands = maindeck.filter(c => !(c.type_line || '').toLowerCase().includes('land'));

    const cmcBins = {};
    for (const c of nonLands) {
        let cmc = Math.floor(c.cmc || 0);
        if (cmc >= 5) cmc = 5; 
        if (!cmcBins[cmc]) cmcBins[cmc] = [];
        cmcBins[cmc].push(c);
    }

    for (const key in cmcBins) {
        cmcBins[key].sort((a, b) => a.card_name.localeCompare(b.card_name));
    }
    lands.sort((a, b) => a.card_name.localeCompare(b.card_name));
    sideboard.sort((a, b) => (a.cmc || 0) - (b.cmc || 0) || a.card_name.localeCompare(b.card_name));

    for (let i = 0; i <= 5; i++) {
        if (cmcBins[i] && cmcBins[i].length > 0) cols.push({ cards: cmcBins[i], isSideboard: false });
    }
    if (lands.length > 0) cols.push({ cards: lands, isSideboard: false });
    if (sideboard.length > 0) cols.push({ cards: sideboard, isSideboard: true });

    return { activeCols: cols, basics };
}

// Fetch image buffers for cards
async function fetchCardImages(cards) {
    // Specifically use the FULL card image_url so we get the physical card frame
    const uniqueUrls = [...new Set(cards.filter(c => c.image_url).map(c => c.image_url))];
    const buffers = {};

    console.log(`Downloading ${uniqueUrls.length} full card images for decklist...`);
    const promises = uniqueUrls.map(async url => {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const arrayBuffer = await res.arrayBuffer();
                buffers[url] = Buffer.from(arrayBuffer);
            }
        } catch (e) {
            console.error('Failed to fetch image:', url, e);
        }
    });

    await Promise.all(promises);
    return buffers;
}

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

/**
 * Generate a visual decklist image (PNG)
 * @param {number} decklistId 
 */
async function generateDecklistImage(decklistId) {
    const db = getDb();
    
    const decklist = db.prepare(`
        SELECT d.*, u.username, u.display_name, u.avatar_url, t.name as tournament_name, t.cube_version_id
        FROM decklists d
        JOIN users u ON d.user_id = u.id
        JOIN tournaments t ON d.tournament_id = t.id
        WHERE d.id = ?
    `).get(decklistId);

    if (!decklist) throw new Error('Decklist not found');

    const matchStats = db.prepare(`
        SELECT 
            SUM(CASE WHEN m.player1_id = d.user_id THEN m.player1_wins ELSE m.player2_wins END) as game_wins,
            SUM(CASE WHEN m.player1_id = d.user_id THEN m.player2_wins ELSE m.player1_wins END) as game_losses,
            SUM(CASE WHEN (m.player1_id = d.user_id AND m.player1_wins > m.player2_wins) OR (m.player2_id = d.user_id AND m.player2_wins > m.player1_wins) THEN 1 ELSE 0 END) as match_wins,
            SUM(CASE WHEN (m.player1_id = d.user_id AND m.player1_wins < m.player2_wins) OR (m.player2_id = d.user_id AND m.player2_wins < m.player1_wins) THEN 1 ELSE 0 END) as match_losses,
            SUM(m.draws) as match_draws
        FROM matches m
        JOIN decklists d ON d.user_id = m.player1_id OR d.user_id = m.player2_id
        WHERE d.id = ? AND m.tournament_id = d.tournament_id AND m.status = 'complete'
    `).get(decklistId);

    const stats = {
        m_w: matchStats?.match_wins || 0,
        m_l: matchStats?.match_losses || 0,
        m_d: matchStats?.match_draws || 0,
        g_w: matchStats?.game_wins || 0,
        g_l: matchStats?.game_losses || 0
    };

    const cards = db.prepare(`
        SELECT dc.*, 
               COALESCE(
                   dc.image_url, 
                   io.image_url, 
                   cc.image_url, 
                   cc_fallback.image_url,
                   CASE WHEN dc.card_name IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest')
                        THEN 'https://api.scryfall.com/cards/named?exact=' || REPLACE(dc.card_name, ' ', '+') || '&format=image'
                        ELSE NULL END
               ) as image_url, 
               COALESCE(cc.type_line, cc_fallback.type_line) as type_line, 
               COALESCE(cc.cmc, cc_fallback.cmc) as cmc
        FROM decklist_cards dc
        LEFT JOIN image_overrides io ON dc.card_name = io.card_name
        LEFT JOIN cube_cards cc ON dc.card_name = cc.card_name AND cc.version_id = ?
        LEFT JOIN (
            SELECT card_name, type_line, cmc, image_url
            FROM cube_cards
            GROUP BY card_name
        ) cc_fallback ON dc.card_name = cc_fallback.card_name
        WHERE dc.decklist_id = ?
    `).all(decklist.cube_version_id, decklistId);

    // Apply basic land fallbacks safely
    const basicLands = ['plains', 'island', 'swamp', 'mountain', 'forest', 'snow-covered plains', 'snow-covered island', 'snow-covered swamp', 'snow-covered mountain', 'snow-covered forest', 'wastes'];
    
    cards.forEach(c => {
        if (!c.type_line) {
            const nameLower = (c.card_name || '').toLowerCase();
            if (basicLands.includes(nameLower)) {
                c.type_line = 'Basic Land';
                c.cmc = 0;
            } else {
                c.type_line = 'Unknown';
                c.cmc = 0;
            }
        }
    });

    const { activeCols, basics } = extractColumns(cards);

    // Layout calculation constraints
    const C_WIDTH = 250;   
    const C_HEIGHT = 350;  // True MTG Aspect Ratio
    const Y_OFFSET = 45;   // Just enough to show the MTG Nameplate
    const X_GAP = 15;      // Minor gap between columns
    const SIDEBOARD_GAP = 60; // Larger gap before Sideboard
    
    // Calculate total widths dynamically
    let cardsWidth = 0;
    activeCols.forEach((col, index) => {
        cardsWidth += C_WIDTH;
        if (index < activeCols.length - 1) {
            cardsWidth += activeCols[index + 1].isSideboard && !col.isSideboard ? SIDEBOARD_GAP : X_GAP;
        }
    });

    const hasBasics = basics.length > 0;
    const basicsWidth = hasBasics ? (basics.length * C_WIDTH) + ((basics.length - 1) * X_GAP) : 0;
    const actualCardsWidth = Math.max(cardsWidth, basicsWidth);

    const paddingX = 60;
    const paddingY = 160;   // Massive top padding for Moxfield-style Title
    const footerY = 80;
    const statsSidebarWidth = 250; // Side stat bar
    
    const width = paddingX * 2 + actualCardsWidth + statsSidebarWidth;
    
    // Find absolute maximum column height
    let maxCardsInCol = 0;
    for (const col of activeCols) {
        let count = col.cards.reduce((sum, c) => sum + c.quantity, 0);
        if (count > maxCardsInCol) maxCardsInCol = count;
    }

    const cardsHeight = maxCardsInCol > 0 ? C_HEIGHT + (Math.max(0, maxCardsInCol - 1) * Y_OFFSET) : 0;
    const basicsRowHeight = hasBasics ? C_HEIGHT + 60 : 0; // Space for image + 12x badge
    const actualCardsHeight = cardsHeight + (hasBasics ? basicsRowHeight + 40 : 0); // 40px gap between maindeck and basics

    const height = Math.max(paddingY + actualCardsHeight + footerY, 600);

    const imageBuffers = await fetchCardImages(cards);
    const compositeOperations = [];
    let currentX = paddingX;
    const svgTexts = [];

    // Header logic (Moxfield aesthetic)
    const titleText = decklist.deck_title || 'Untitled Deck';
    const authorText = decklist.display_name || decklist.username;
    
    svgTexts.push(`
        <text x="${paddingX}" y="70" font-family="sans-serif" font-size="56" font-weight="900" fill="#ffffff" style="text-transform: lowercase;">
            ${escapeXml(titleText)}
        </text>
        <text x="${paddingX}" y="110" font-family="sans-serif" font-size="28" font-weight="600" fill="#cbd5e1">
            ${escapeXml(decklist.tournament_name)} • By ${escapeXml(authorText)}
        </text>
    `);

    // Draw Columns (No Category Headers as requested)
    for (let i = 0; i < activeCols.length; i++) {
        const col = activeCols[i];
        let currentY = paddingY;
        
        for (const card of col.cards) {
            for (let q = 0; q < card.quantity; q++) {
                const targetUrl = card.image_url; // Strictly Full Card Border
                
                if (targetUrl && imageBuffers[targetUrl]) {
                    const resizedBuffer = await sharp(imageBuffers[targetUrl])
                        .resize({ width: C_WIDTH, height: C_HEIGHT, fit: 'fill' }) // MTG cards shouldn't cover crop
                        .jpeg({ quality: 90 })
                        .toBuffer();

                    // Optional: slight corner rounding for authenticity (MTG cards have 3mm corners)
                    const roundedCorners = Buffer.from(
                        `<svg><rect x="0" y="0" width="${C_WIDTH}" height="${C_HEIGHT}" rx="14" ry="14"/></svg>`
                    );

                    const roundedBuffer = await sharp(resizedBuffer)
                        .composite([{ input: roundedCorners, blend: 'dest-in' }])
                        .png()
                        .toBuffer();

                    compositeOperations.push({
                        input: roundedBuffer,
                        top: currentY,
                        left: currentX
                    });
                } else {
                    const fallbackSvg = `
                        <svg width="${C_WIDTH}" height="${C_HEIGHT}">
                            <rect width="100%" height="100%" rx="14" ry="14" fill="#1e293b" stroke="#cbd5e1" stroke-width="4"/>
                            <text x="50%" y="45" font-family="sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(card.card_name)}</text>
                        </svg>
                    `;
                    compositeOperations.push({
                        input: Buffer.from(fallbackSvg),
                        top: currentY,
                        left: currentX
                    });
                }
                currentY += Y_OFFSET;
            }
        }
        
        let nextGap = X_GAP;
        if (i < activeCols.length - 1 && activeCols[i+1].isSideboard && !col.isSideboard) {
            nextGap = SIDEBOARD_GAP;
        }
        currentX += C_WIDTH + nextGap;
    }

    // --- DRAW BASICS ROW ---
    if (hasBasics) {
        let basicsX = paddingX;
        const basicsY = paddingY + cardsHeight + 40;
        
        for (const card of basics) {
            const targetUrl = card.image_url;
            if (targetUrl && imageBuffers[targetUrl]) {
                const resizedBuffer = await sharp(imageBuffers[targetUrl])
                    .resize({ width: C_WIDTH, height: C_HEIGHT, fit: 'fill' })
                    .jpeg({ quality: 90 })
                    .toBuffer();

                const roundedCorners = Buffer.from(
                    `<svg><rect x="0" y="0" width="${C_WIDTH}" height="${C_HEIGHT}" rx="14" ry="14"/></svg>`
                );

                const roundedBuffer = await sharp(resizedBuffer)
                    .composite([{ input: roundedCorners, blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                compositeOperations.push({
                    input: roundedBuffer,
                    top: basicsY,
                    left: basicsX
                });
            } else {
                const fallbackSvg = `
                    <svg width="${C_WIDTH}" height="${C_HEIGHT}">
                        <rect width="100%" height="100%" rx="14" ry="14" fill="#1e293b" stroke="#cbd5e1" stroke-width="4"/>
                        <text x="50%" y="45" font-family="sans-serif" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(card.card_name)}</text>
                    </svg>
                `;
                compositeOperations.push({
                    input: Buffer.from(fallbackSvg),
                    top: basicsY,
                    left: basicsX
                });
            }

            // Draw Quantity Badge
            svgTexts.push(`
                <rect x="${basicsX + C_WIDTH/2 - 35}" y="${basicsY + C_HEIGHT - 20}" width="70" height="34" rx="17" ry="17" fill="#0f172a" stroke="#cbd5e1" stroke-width="2"/>
                <text x="${basicsX + C_WIDTH/2}" y="${basicsY + C_HEIGHT + 4}" font-family="sans-serif" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle">
                    ${card.quantity}x
                </text>
            `);

            basicsX += C_WIDTH + X_GAP;
        }
    }

    // --- DRAW STATS SIDEBAR ---
    const sidebarX = paddingX + actualCardsWidth + 50;
    
    svgTexts.push(`
        <line x1="${sidebarX - 40}" y1="${paddingY - 50}" x2="${sidebarX - 40}" y2="${height - footerY + 20}" stroke="#334155" stroke-width="2" opacity="0.5" />
    `);

    const gw_rate = stats.g_w + stats.g_l > 0 ? ((stats.g_w / (stats.g_w + stats.g_l)) * 100).toFixed(1) : 0;
    
    svgTexts.push(`
        <text x="${sidebarX}" y="${paddingY + 20}" font-family="sans-serif" font-size="44" font-weight="900" fill="#ffffff">
            ${stats.m_w} - ${stats.m_l}${stats.m_d > 0 ? ` - ${stats.m_d}` : ''}
        </text>
        <text x="${sidebarX}" y="${paddingY + 45}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" letter-spacing="2">
            MATCH RECORD
        </text>

        <text x="${sidebarX}" y="${paddingY + 140}" font-family="sans-serif" font-size="36" font-weight="800" fill="#cbd5e1">
            ${stats.g_w} - ${stats.g_l}
        </text>
        <text x="${sidebarX}" y="${paddingY + 165}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" letter-spacing="2">
            GAME RECORD
        </text>

        <text x="${sidebarX}" y="${paddingY + 260}" font-family="sans-serif" font-size="36" font-weight="800" fill="#cbd5e1">
            ${gw_rate}%
        </text>
        <text x="${sidebarX}" y="${paddingY + 285}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" letter-spacing="2">
            WIN RATE
        </text>
    `);

    // Footer
    svgTexts.push(`
        <text x="${width - paddingX}" y="${height - 25}" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff" text-anchor="end" letter-spacing="2">
            CUBE STATS
        </text>
    `);

    // Base background (#1f1f1f matches Moxfield dark tint)
    const baseSvg = `
        <svg fill="none" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#1c1c1c" />
        </svg>
    `;

    const textOverlaySvg = `
        <svg fill="none" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            ${svgTexts.join('\\n')}
        </svg>
    `;

    compositeOperations.push({
        input: Buffer.from(textOverlaySvg),
        top: 0,
        left: 0
    });

    const finalImageBuffer = await sharp(Buffer.from(baseSvg))
        .composite(compositeOperations)
        .png()
        .toBuffer();

    return finalImageBuffer;
}

module.exports = { generateDecklistImage };
