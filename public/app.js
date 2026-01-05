// MTG Cube Leaderboard - Card Maindeck Rate Tracker
// Formula: Maindeck Rate = (times maindecked) / (total decks)

class CubeLeaderboard {
    constructor() {
        this.data = this.loadData();
        this.scryfallCache = {};
        this.currentPickerCard = null; // Card currently being edited in picker
        this.initializeEventListeners();
        this.initializeUI();
    }

    // Data Management
    loadData() {
        const stored = localStorage.getItem('cubeLeaderboardData');
        if (stored) {
            const data = JSON.parse(stored);
            // Ensure imageOverrides exists
            if (!data.imageOverrides) {
                data.imageOverrides = {};
            }
            return data;
        }
        return {
            masterCubeList: [],
            games: [],
            imageOverrides: {} // Map of cardName -> imageUrl
        };
    }

    saveData() {
        localStorage.setItem('cubeLeaderboardData', JSON.stringify(this.data));
        this.updateStats();
        this.updateUIState();
    }

    // Initialize UI
    initializeUI() {
        // Set today's date as default
        const gameDateEl = document.getElementById('gameDate');
        if (gameDateEl) gameDateEl.valueAsDate = new Date();

        // Load cube list if exists
        const cubeListEl = document.getElementById('cubeList');
        if (cubeListEl && this.data.masterCubeList.length > 0) {
            cubeListEl.value = this.data.masterCubeList.join('\n');
        }

        // Reset win-loss inputs to 0
        const winsEl = document.getElementById('winsInput');
        const lossesEl = document.getElementById('lossesInput');
        if (winsEl) winsEl.value = 0;
        if (lossesEl) lossesEl.value = 0;

        // Initialize leaderboard filters state
        this.leaderboardState = {
            search: '',
            dateFrom: '',
            dateTo: '',
            view: 'bottom20',
            display: 'grid',
            order: 'asc'
        };

        this.updateStats();
        this.displayRecentGames();
        this.updateUIState();
    }

    // Show welcome or main app based on cube list
    updateUIState() {
        const welcome = document.getElementById('welcome');
        const mainApp = document.getElementById('mainApp');
        const sortOrderGroup = document.getElementById('sortOrderGroup');

        if (welcome && mainApp) {
            if (this.data.masterCubeList.length > 0) {
                welcome.classList.add('hidden');
                mainApp.classList.remove('hidden');
            } else {
                welcome.classList.remove('hidden');
                mainApp.classList.add('hidden');
            }
        }

        // Show/hide sort order based on view mode
        if (sortOrderGroup) {
            if (this.leaderboardState.view === 'all') {
                sortOrderGroup.classList.remove('hidden');
            } else {
                sortOrderGroup.classList.add('hidden');
            }
        }
    }

    // Event Listeners
    initializeEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
                // Auto-update leaderboard when switching to it
                if (tab === 'leaderboard') {
                    this.updateLeaderboard();
                }
                if (tab === 'players') {
                    this.updatePlayerLeaderboard();
                }
            });
        });

        // Welcome screen handlers
        const welcomeImportCube = document.getElementById('welcomeImportCube');
        if (welcomeImportCube) {
            welcomeImportCube.addEventListener('click', () => this.importCubeFromWelcome());
        }
        const welcomeImportData = document.getElementById('welcomeImportData');
        if (welcomeImportData) {
            welcomeImportData.addEventListener('click', () => this.importDataFromWelcome());
        }

        // Cube List Management
        const saveCubeList = document.getElementById('saveCubeList');
        if (saveCubeList) saveCubeList.addEventListener('click', () => this.saveCubeList());
        const clearCubeList = document.getElementById('clearCubeList');
        if (clearCubeList) clearCubeList.addEventListener('click', () => this.clearCubeList());

        // Game Form
        const gameForm = document.getElementById('gameForm');
        if (gameForm) {
            gameForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addGame();
            });
        }

        // Leaderboard Filters
        const cardSearch = document.getElementById('cardSearch');
        if (cardSearch) cardSearch.addEventListener('input', (e) => {
            this.leaderboardState.search = e.target.value;
            this.updateLeaderboard();
        });
        const dateFrom = document.getElementById('dateFrom');
        if (dateFrom) dateFrom.addEventListener('change', (e) => {
            this.leaderboardState.dateFrom = e.target.value;
            this.updateLeaderboard();
        });
        const dateTo = document.getElementById('dateTo');
        if (dateTo) dateTo.addEventListener('change', (e) => {
            this.leaderboardState.dateTo = e.target.value;
            this.updateLeaderboard();
        });

        // View toggles (Top 20 / Bottom 20 / All)
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.leaderboardState.view = e.target.dataset.view;
                this.updateUIState(); // Toggle sort visibility
                this.updateLeaderboard();
            });
        });

        // Display toggles (List / Grid)
        document.querySelectorAll('[data-display]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-display]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.leaderboardState.display = e.target.dataset.display;
                this.updateLeaderboard();
            });
        });

        // Sort order toggle
        const sortOrderBtn = document.getElementById('sortOrderBtn');
        if (sortOrderBtn) {
            sortOrderBtn.addEventListener('click', (e) => {
                const btn = e.target;
                if (this.leaderboardState.order === 'asc') {
                    this.leaderboardState.order = 'desc';
                    btn.textContent = '↓ Descending';
                } else {
                    this.leaderboardState.order = 'asc';
                    btn.textContent = '↑ Ascending';
                }
                this.updateLeaderboard();
            });
        }

        // Data Management
        const exportData = document.getElementById('exportData');
        if (exportData) exportData.addEventListener('click', () => this.exportData());
        const importData = document.getElementById('importData');
        if (importData) importData.addEventListener('click', () => this.importData());
        const resetData = document.getElementById('resetData');
        if (resetData) resetData.addEventListener('click', () => this.resetData());
    }

    // Import cube from welcome screen
    importCubeFromWelcome() {
        const input = document.getElementById('welcomeCubeList').value;
        // Use parseDecklist to handle formats like "1 Cardname", "1x Cardname", etc.
        const cards = this.parseDecklist(input);

        if (cards.length === 0) {
            this.showNotification('⚠️ Please enter at least one card', 'warning');
            return;
        }

        this.data.masterCubeList = [...new Set(cards)];
        this.saveData();

        // Also update settings cube list
        const cubeListEl = document.getElementById('cubeList');
        if (cubeListEl) cubeListEl.value = this.data.masterCubeList.join('\n');

        this.showNotification(`✅ Imported ${this.data.masterCubeList.length} cards!`, 'success');
    }

    // Import data from welcome screen
    importDataFromWelcome() {
        const file = document.getElementById('welcomeImportFile').files[0];
        if (!file) {
            this.showNotification('⚠️ Please select a file first', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (imported.masterCubeList && imported.games) {
                    this.data = imported;
                    if (!this.data.imageOverrides) {
                        this.data.imageOverrides = {};
                    }
                    this.saveData();
                    this.initializeUI();

                    if (this.authToken) {
                        await this.saveToServer();
                        this.showNotification('✅ Data imported and synced!', 'success');
                    } else {
                        this.showNotification('✅ Data imported!', 'success');
                    }
                } else {
                    throw new Error('Invalid data format');
                }
            } catch (error) {
                this.showNotification('❌ Error importing: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    // Tab Navigation
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');
    }

    // Cube List Management
    saveCubeList() {
        const input = document.getElementById('cubeList').value;
        // Use parseDecklist to handle formats like "1 Cardname", "1x Cardname", etc.
        const cards = this.parseDecklist(input);

        this.data.masterCubeList = [...new Set(cards)]; // Remove duplicates
        this.saveData();

        this.showNotification('✅ Cube list saved successfully!', 'success');
    }

    clearCubeList() {
        if (confirm('Are you sure you want to clear the cube list?')) {
            document.getElementById('cubeList').value = '';
            this.data.masterCubeList = [];
            this.saveData();
            this.showNotification('🗑️ Cube list cleared', 'info');
        }
    }

    // Test validity of all cards in the cube list against Scryfall
    async testCardValidity() {
        const input = document.getElementById('cubeList').value;
        const cards = input.split('\n')
            .map(card => card.trim())
            .filter(card => card.length > 0);

        if (cards.length === 0) {
            this.showNotification('⚠️ No cards to validate', 'warning');
            return;
        }

        const resultsContainer = document.getElementById('validationResults');
        resultsContainer.innerHTML = `<p class="help-text">⏳ Validating ${cards.length} cards against Scryfall...</p>`;

        const validCards = [];
        const invalidCards = [];

        // Rate limit: Scryfall allows ~10 requests/sec, we'll be conservative
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            try {
                const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card)}`);
                if (response.ok) {
                    const data = await response.json();
                    validCards.push({ input: card, found: data.name, imageUrl: data.image_uris?.small || '' });
                } else {
                    invalidCards.push({ input: card, error: 'Not found' });
                }
            } catch (error) {
                invalidCards.push({ input: card, error: error.message });
            }

            // Update progress
            if ((i + 1) % 10 === 0 || i === cards.length - 1) {
                resultsContainer.innerHTML = `<p class="help-text">⏳ Validated ${i + 1}/${cards.length} cards...</p>`;
            }

            // Small delay to avoid rate limiting
            if (i < cards.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Display results
        resultsContainer.innerHTML = `
            <div class="validation-summary">
                <h3>✅ Validation Results</h3>
                <p><strong>Valid:</strong> ${validCards.length} cards</p>
                ${invalidCards.length > 0 ? `<p><strong>❌ Invalid:</strong> ${invalidCards.length} cards</p>` : ''}
            </div>
            ${invalidCards.length > 0 ? `
                <div class="invalid-cards">
                    <h4>⚠️ Cards Not Found</h4>
                    <ul>
                        ${invalidCards.map(c => `<li><strong>${c.input}</strong> - ${c.error}</li>`).join('')}
                    </ul>
                </div>
            ` : '<p class="success-text">🎉 All cards are valid!</p>'}
        `;
    }

    // Edit a game entry
    editGame(index) {
        const game = this.data.games[index];
        if (!game) {
            this.showNotification('⚠️ Game not found', 'warning');
            return;
        }

        // Switch to entry tab and populate form
        this.switchTab('entry');

        document.getElementById('gameDate').value = game.date;
        document.getElementById('playerName').value = game.player;
        document.getElementById('deckTitle').value = game.deckTitle || '';
        document.getElementById('winsInput').value = game.wins;
        document.getElementById('lossesInput').value = game.losses;
        document.getElementById('decklist').value = game.decklist.join('\n');

        // Remove the old game entry
        this.data.games.splice(index, 1);
        this.saveData();
        this.displayRecentGames();

        this.showNotification('📝 Editing game - make changes and submit to save', 'info');
    }

    // Delete a game entry
    deleteGame(index) {
        const game = this.data.games[index];
        if (!game) {
            this.showNotification('⚠️ Game not found', 'warning');
            return;
        }

        if (confirm(`Delete game by ${game.player} on ${game.date}?`)) {
            this.data.games.splice(index, 1);
            this.saveData();
            this.displayRecentGames();
            this.showNotification('🗑️ Game deleted', 'info');
        }
    }

    // Parse decklist - handles formats like "1 Lightning Bolt", "2x Sol Ring", or just "Black Lotus"
    parseDecklist(input) {
        return input
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                // Remove quantity prefixes like "1 ", "2x ", "3X ", "1x", etc.
                // Pattern: optional number, optional 'x' or 'X', optional space(s), then card name
                const match = line.match(/^(\d+)?\s*[xX]?\s*(.+)$/);
                if (match && match[2]) {
                    return match[2].trim();
                }
                return line;
            })
            .filter(card => card.length > 0);
    }

    // Normalize double-faced card names - extracts front side
    // Handles formats: "Delver of Secrets // Insectile Aberration" -> "Delver of Secrets"
    normalizeCardName(cardName) {
        if (!cardName) return '';
        // Split by " // " which is the standard DFC separator
        const parts = cardName.split(' // ');
        return parts[0].trim();
    }

    // Get all name variations for a DFC (front, back, and full name)
    getCardNameVariations(cardName) {
        if (!cardName) return [];
        const normalized = cardName.trim().toLowerCase();
        const parts = cardName.split(' // ').map(p => p.trim().toLowerCase());

        // Return all variations: full name, front side, back side
        const variations = [normalized];
        if (parts.length > 1) {
            variations.push(parts[0]); // Front side
            variations.push(parts[1]); // Back side
        }
        return variations;
    }

    // Find matching card in cube list (handles DFC variations)
    findMatchingCubeCard(deckCardName) {
        const deckVariations = this.getCardNameVariations(deckCardName);

        for (const cubeCard of this.data.masterCubeList) {
            const cubeVariations = this.getCardNameVariations(cubeCard);

            // Check if any variation matches
            for (const deckVar of deckVariations) {
                for (const cubeVar of cubeVariations) {
                    if (deckVar === cubeVar) {
                        // Return the cube list version (canonical name)
                        return cubeCard;
                    }
                }
            }
        }

        return null; // No match found
    }

    // Game Entry
    addGame() {
        const wins = parseInt(document.getElementById('winsInput').value) || 0;
        const losses = parseInt(document.getElementById('lossesInput').value) || 0;

        const rawDecklist = this.parseDecklist(document.getElementById('decklist').value);

        // Normalize decklist to cube list names (handles DFC variations)
        const normalizedDecklist = [];
        const unknownCards = [];

        for (const card of rawDecklist) {
            const matchedCard = this.findMatchingCubeCard(card);
            if (matchedCard) {
                normalizedDecklist.push(matchedCard);
            } else {
                unknownCards.push(card);
                // Still add it to decklist but with normalized name (front side only)
                normalizedDecklist.push(this.normalizeCardName(card));
            }
        }

        const gameData = {
            date: document.getElementById('gameDate').value,
            player: document.getElementById('playerName').value,
            deckTitle: document.getElementById('deckTitle').value || 'Untitled Deck',
            wins: wins,
            losses: losses,
            decklist: normalizedDecklist
        };

        // Validation
        if (this.data.masterCubeList.length === 0) {
            this.showNotification('⚠️ Please set up your cube list first!', 'warning');
            this.switchTab('settings');
            return;
        }

        if (unknownCards.length > 0) {
            const msg = `⚠️ Warning: ${unknownCards.length} card(s) not in master cube list:\n${unknownCards.slice(0, 5).join(', ')}${unknownCards.length > 5 ? '...' : ''}`;
            if (!confirm(msg + '\n\nContinue anyway?')) {
                return;
            }
        }

        this.data.games.push(gameData);
        this.saveData();

        document.getElementById('gameForm').reset();
        document.getElementById('gameDate').valueAsDate = new Date();
        document.getElementById('winsInput').value = 0;
        document.getElementById('lossesInput').value = 0;

        this.displayRecentGames();
        this.showNotification('✅ Game added successfully!', 'success');
    }

    displayRecentGames() {
        const container = document.getElementById('recentGames');
        const totalGames = this.data.games.length;

        if (totalGames === 0) {
            container.innerHTML = '';
            return;
        }

        // Show last 5 games with their actual indices
        const startIdx = Math.max(0, totalGames - 5);
        const recentWithIndices = this.data.games.slice(startIdx).map((game, i) => ({
            game,
            index: startIdx + i
        })).reverse();

        container.innerHTML = `
            <h3>Recent Games (${totalGames} total)</h3>
            ${recentWithIndices.map(({ game, index }) => `
                <div class="game-item" data-index="${index}">
                    <div class="game-item-header">
                        <div class="game-info">
                            <p><strong>${game.player}</strong> - ${game.deckTitle || 'Untitled'}</p>
                            <p>${game.date} • ${game.wins}-${game.losses}</p>
                            <p>${game.decklist.length} cards</p>
                        </div>
                        <div class="game-actions">
                            <button class="btn-icon btn-edit" onclick="cubeApp.editGame(${index})" title="Edit">✏️</button>
                            <button class="btn-icon btn-delete" onclick="cubeApp.deleteGame(${index})" title="Delete">🗑️</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
    }

    // Live Leaderboard Update
    async updateLeaderboard() {
        const output = document.getElementById('leaderboardOutput');
        const statsOutput = document.getElementById('leaderboardStats');

        if (this.data.games.length === 0) {
            output.innerHTML = '<p class="help-text">No games recorded yet. Add some games to see the leaderboard!</p>';
            statsOutput.innerHTML = '';
            return;
        }

        output.innerHTML = '<p class="help-text">⏳ Loading...</p>';

        // Filter games by date range and format
        let filteredGames = [...this.data.games];

        if (this.leaderboardState.dateFrom) {
            const fromDate = new Date(this.leaderboardState.dateFrom);
            filteredGames = filteredGames.filter(g => new Date(g.date) >= fromDate);
        }
        if (this.leaderboardState.dateTo) {
            const toDate = new Date(this.leaderboardState.dateTo);
            filteredGames = filteredGames.filter(g => new Date(g.date) <= toDate);
        }

        if (filteredGames.length === 0) {
            output.innerHTML = '<p class="help-text">No games match the current filters.</p>';
            statsOutput.innerHTML = '';
            return;
        }

        // Calculate scores
        const cardScores = this.calculateCardScores(filteredGames);

        // Convert to array and sort
        let sortedCards = Object.entries(cardScores)
            .map(([card, stats]) => ({
                card,
                ...stats,
                winRate: stats.appearances > 0 ? stats.totalWins / (stats.totalWins + stats.totalLosses) : 0
            }))
            .sort((a, b) => a.pickRate - b.pickRate); // Ascending by default (lowest maindeck rate = needs rotation)

        // Apply search filter
        if (this.leaderboardState.search) {
            const search = this.leaderboardState.search.toLowerCase();
            sortedCards = sortedCards.filter(c => c.card.toLowerCase().includes(search));
        }

        // Apply view filter (top 20, bottom 20, all)
        let displayCards;
        if (this.leaderboardState.view === 'bottom20') {
            displayCards = sortedCards.slice(0, 20);
        } else if (this.leaderboardState.view === 'top20') {
            displayCards = sortedCards.slice(-20).reverse();
        } else {
            displayCards = sortedCards;
        }

        // Apply sort order
        if (this.leaderboardState.order === 'desc') {
            displayCards = [...displayCards].reverse();
        }

        // Show stats
        statsOutput.innerHTML = `
            <p><strong>Games Analyzed:</strong> ${filteredGames.length}</p>
            <p><strong>Cards Shown:</strong> ${displayCards.length} / ${sortedCards.length}</p>
        `;

        // Render based on display mode
        if (this.leaderboardState.display === 'grid') {
            await this.renderLeaderboardGrid(displayCards, output);
        } else {
            this.renderLeaderboardList(displayCards, output);
        }
    }

    async renderLeaderboardGrid(cards, container) {
        // Pre-fetch images
        await Promise.all(cards.slice(0, 40).map(c => this.fetchCardImage(c.card)));

        const html = await Promise.all(cards.map(async (item, index) => {
            const imageUrl = await this.fetchCardImage(item.card);
            const escapedCardName = item.card.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            return `
                <div class="card-display clickable" onclick="cubeApp.openCardPicker('${escapedCardName}')">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${item.card}" class="card-image" loading="lazy">` : '<div class="card-placeholder">No Image</div>'}
                    <div class="card-info">
                        <div class="card-title">${item.card}</div>
                        <div class="card-score-badge">${(item.pickRate * 100).toFixed(1)}% maindeck rate</div>
                        <div class="card-meta">${item.appearances} picks • ${item.totalWins}-${item.totalLosses}</div>
                    </div>
                </div>
            `;
        }));

        container.innerHTML = `<div class="card-grid">${html.join('')}</div>`;
    }

    // Card Picker Modal Methods
    openCardPicker(cardName) {
        this.currentPickerCard = cardName;
        document.getElementById('pickerCardName').textContent = cardName;
        document.getElementById('cardPickerSearch').value = this.normalizeCardName(cardName);
        document.getElementById('cardPickerModal').classList.remove('hidden');
        this.searchCardPrints(); // Auto-search
    }

    closeCardPicker() {
        this.currentPickerCard = null;
        document.getElementById('cardPickerModal').classList.add('hidden');
        document.getElementById('cardPickerResults').innerHTML = '';
    }

    async searchCardPrints() {
        let searchTerm = document.getElementById('cardPickerSearch').value.trim();
        if (!searchTerm) return;

        const resultsContainer = document.getElementById('cardPickerResults');
        resultsContainer.innerHTML = '<p class="help-text">⏳ Searching...</p>';

        try {
            let cards = [];

            // For split/double-faced cards, use exact name search
            if (searchTerm.includes('//')) {
                // Scryfall exact name syntax for split cards: name:"Start // Fire"
                // Include extras to get Mystery Booster and special printings
                const query = `name:"${searchTerm}" include:extras`;
                const exactResponse = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released`);
                if (exactResponse.ok) {
                    const exactData = await exactResponse.json();
                    cards = exactData.data || [];
                }

                // If still no results, try with just the full name without quotes
                if (cards.length === 0) {
                    const fallbackQuery = `${searchTerm} include:extras`;
                    const fallbackResponse = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(fallbackQuery)}&unique=prints&order=released`);
                    if (fallbackResponse.ok) {
                        const fallbackData = await fallbackResponse.json();
                        cards = fallbackData.data || [];
                    }
                }
            } else {
                // Regular search - include extras to get Mystery Booster cards
                const query = `${searchTerm} include:extras`;
                const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released`);
                if (response.ok) {
                    const data = await response.json();
                    cards = data.data || [];
                }
            }

            if (cards.length === 0) {
                resultsContainer.innerHTML = '<p class="help-text">No cards found. Try a different search term.</p>';
                return;
            }

            // Render card options
            const html = cards.slice(0, 30).map(card => {
                let imageUrl = '';
                if (card.image_uris) {
                    imageUrl = card.image_uris.small || card.image_uris.normal || '';
                } else if (card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris) {
                    imageUrl = card.card_faces[0].image_uris.small || card.card_faces[0].image_uris.normal || '';
                }

                if (!imageUrl) return '';

                const setName = card.set_name || card.set.toUpperCase();
                const escapedUrl = imageUrl.replace(/'/g, "\\'");

                return `
                    <div class="card-picker-option" onclick="cubeApp.selectCardImage('${escapedUrl}')">
                        <img src="${imageUrl}" alt="${card.name}" loading="lazy">
                        <div class="set-name">${setName}</div>
                    </div>
                `;
            }).join('');

            resultsContainer.innerHTML = html || '<p class="help-text">No images available.</p>';

        } catch (error) {
            console.error('Search error:', error);
            resultsContainer.innerHTML = '<p class="help-text">Error searching. Please try again.</p>';
        }
    }

    selectCardImage(imageUrl) {
        if (!this.currentPickerCard) return;

        const normalizedName = this.normalizeCardName(this.currentPickerCard);

        // Save the override
        this.data.imageOverrides[normalizedName] = imageUrl;
        this.saveData();

        // Update cache too
        this.scryfallCache[normalizedName] = imageUrl;

        // Close modal and refresh leaderboard
        this.closeCardPicker();
        this.updateLeaderboard();

        this.showNotification(`✅ Updated art for ${this.currentPickerCard}`, 'success');
    }

    renderLeaderboardList(cards, container) {
        const html = cards.map((item, index) => `
            <div class="card-score-item">
                <span class="card-name">${index + 1}. ${item.card}</span>
                <div class="card-stats">
                    <span>${(item.pickRate * 100).toFixed(1)}% maindeck rate</span>
                    <span>Picks: ${item.appearances}</span>
                    <span>W-L: ${item.totalWins}-${item.totalLosses}</span>
                </div>
            </div>
        `).join('');

        container.innerHTML = html || '<p class="help-text">No cards to display.</p>';
    }

    // Scoring Formula Weights
    calculateWeights(format, draftType) {
        // Draft Weight
        const draftWeight = draftType === 'winston' ? 1.0 : 0.9; // pick-two = 0.9

        // Format Weight
        let formatWeight = 1.0;
        if (format === 'bo1') formatWeight = 0.95;
        else if (format === 'ffa') formatWeight = 0.85;

        return { draftWeight, formatWeight };
    }

    // Report Generation
    async generateReport() {
        const monthFilter = document.getElementById('monthFilter').value;
        if (!monthFilter) {
            this.showNotification('⚠️ Please select a month', 'warning');
            return;
        }

        const [year, month] = monthFilter.split('-');
        const filteredGames = this.data.games.filter(game => {
            const gameDate = new Date(game.date);
            return gameDate.getFullYear() === parseInt(year) &&
                (gameDate.getMonth() + 1) === parseInt(month);
        });

        if (filteredGames.length === 0) {
            this.showNotification('ℹ️ No games found for selected month', 'info');
            document.getElementById('reportOutput').innerHTML = '<p class="help-text">No data for this month</p>';
            return;
        }

        const cardScores = this.calculateCardScores(filteredGames);
        await this.displayReport(cardScores, monthFilter, filteredGames.length);
    }

    calculateCardScores(games) {
        const scores = {};
        const totalDecks = games.length;

        // Initialize all cube cards with 0
        this.data.masterCubeList.forEach(card => {
            scores[card] = {
                pickRate: 0,
                appearances: 0,
                totalWins: 0,
                totalLosses: 0
            };
        });

        // Count appearances and wins/losses
        games.forEach(game => {
            game.decklist.forEach(card => {
                if (!scores[card]) {
                    scores[card] = {
                        pickRate: 0,
                        appearances: 0,
                        totalWins: 0,
                        totalLosses: 0
                    };
                }

                scores[card].appearances += 1;
                scores[card].totalWins += game.wins;
                scores[card].totalLosses += game.losses;
            });
        });

        // Calculate maindeck rate: appearances / total decks
        Object.keys(scores).forEach(card => {
            const stats = scores[card];
            stats.pickRate = totalDecks > 0 ? stats.appearances / totalDecks : 0;
        });

        return scores;
    }

    // Scryfall API Integration - handles double-faced cards
    async fetchCardImage(cardName) {
        // Normalize to front side for consistent caching and lookup
        const normalizedName = this.normalizeCardName(cardName);

        // Check for saved image override first
        if (this.data.imageOverrides && this.data.imageOverrides[normalizedName]) {
            return this.data.imageOverrides[normalizedName];
        }

        // Check cache
        if (this.scryfallCache[normalizedName]) {
            return this.scryfallCache[normalizedName];
        }

        try {
            const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(normalizedName)}`);
            if (response.ok) {
                const data = await response.json();
                // Handle double-faced cards (they have card_faces instead of image_uris)
                let imageUrl = '';
                if (data.image_uris) {
                    imageUrl = data.image_uris.small || data.image_uris.normal || '';
                } else if (data.card_faces && data.card_faces[0] && data.card_faces[0].image_uris) {
                    imageUrl = data.card_faces[0].image_uris.small || data.card_faces[0].image_uris.normal || '';
                }
                this.scryfallCache[normalizedName] = imageUrl;
                return imageUrl;
            }
        } catch (error) {
            console.error(`Error fetching image for ${normalizedName}:`, error);
        }

        return ''; // Return empty if not found
    }

    async displayReport(cardScores, month, gameCount) {
        const output = document.getElementById('reportOutput');
        output.innerHTML = '<p class="help-text">⏳ Loading card images from Scryfall...</p>';

        const sortedCards = Object.entries(cardScores)
            .map(([card, stats]) => ({
                card,
                ...stats,
                avgScore: stats.appearances > 0 ? stats.totalScore / stats.appearances : 0
            }))
            .sort((a, b) => a.totalScore - b.totalScore); // Ascending: lowest = worst

        const bottomCards = sortedCards.slice(0, 20); // Bottom 20
        const topCards = sortedCards.slice(-20).reverse(); // Top 20

        // Fetch images for bottom and top cards
        const cardsToFetch = [...bottomCards.map(c => c.card), ...topCards.map(c => c.card)];
        await Promise.all(cardsToFetch.map(card => this.fetchCardImage(card)));

        output.innerHTML = `
            <div class="report-section">
                <h3>📊 ${month} Summary</h3>
                <p><strong>Total Games:</strong> ${gameCount}</p>
                <p><strong>Cards Tracked:</strong> ${this.data.masterCubeList.length}</p>
            </div>

            <div class="report-section">
                <h3>🪓 Bottom 20 - Rotation Candidates (Lowest Scores)</h3>
                <div class="card-grid">
                    ${await this.renderCardGrid(bottomCards)}
                </div>
            </div>

            <div class="report-section">
                <h3>⭐ Top 20 - Best Performers (Highest Scores)</h3>
                <div class="card-grid">
                    ${await this.renderCardGrid(topCards)}
                </div>
            </div>

            <div class="report-section">
                <h3>📈 Detailed Statistics</h3>
                ${bottomCards.slice(0, 15).map((item, i) => `
                    <div class="card-score-item">
                        <span class="card-name">${i + 1}. ${item.card}</span>
                        <div class="card-stats">
                            <span>Score: ${item.totalScore.toFixed(3)}</span>
                            <span>Appearances: ${item.appearances}</span>
                            <span>W-L: ${item.totalWins}-${item.totalLosses}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async renderCardGrid(cards) {
        const cardElements = await Promise.all(cards.map(async (item) => {
            const imageUrl = await this.fetchCardImage(item.card);
            return `
                <div class="card-display">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${item.card}" class="card-image">` : ''}
                    <div class="card-info">
                        <div class="card-title">${item.card}</div>
                        <div class="card-score-badge">Score: ${item.totalScore.toFixed(3)}</div>
                        <div class="card-meta">${item.appearances} appearances • ${item.totalWins}-${item.totalLosses}</div>
                    </div>
                </div>
            `;
        }));

        return cardElements.join('');
    }

    // Data Export/Import
    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `cube-leaderboard-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        this.showNotification('📥 Data exported successfully!', 'success');
    }

    importData() {
        const file = document.getElementById('importFile').files[0];
        if (!file) {
            this.showNotification('⚠️ Please select a file first', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (imported.masterCubeList && imported.games) {
                    this.data = imported;
                    // Ensure imageOverrides exists
                    if (!this.data.imageOverrides) {
                        this.data.imageOverrides = {};
                    }
                    this.saveData();
                    this.initializeUI();

                    // Sync to server if logged in
                    if (this.authToken) {
                        await this.saveToServer();
                        this.showNotification('✅ Data imported and synced to server!', 'success');
                    } else {
                        this.showNotification('✅ Data imported! Login to sync across devices.', 'success');
                    }
                } else {
                    throw new Error('Invalid data format');
                }
            } catch (error) {
                this.showNotification('❌ Error importing data: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    resetData() {
        if (confirm('⚠️ This will delete ALL data. Are you absolutely sure?')) {
            if (confirm('This action cannot be undone. Proceed?')) {
                localStorage.removeItem('cubeLeaderboardData');
                this.data = { masterCubeList: [], games: [] };
                this.scryfallCache = {};
                this.initializeUI();
                this.showNotification('🗑️ All data has been reset', 'info');
            }
        }
    }

    // Stats Update
    updateStats() {
        // Cube stats
        const cubeStats = document.getElementById('cubeStats');
        if (cubeStats) {
            cubeStats.innerHTML = `
                <p><strong>Total Cards in Cube:</strong> ${this.data.masterCubeList.length}</p>
            `;
        }
    }

    // Player Leaderboard
    updatePlayerLeaderboard() {
        const statsOutput = document.getElementById('playerStats');
        const leaderboardOutput = document.getElementById('playerLeaderboard');

        if (!leaderboardOutput) return;

        if (this.data.games.length === 0) {
            statsOutput.innerHTML = '';
            leaderboardOutput.innerHTML = '<p class="help-text">No games recorded yet.</p>';
            return;
        }

        // Calculate player stats
        const playerStats = {};

        this.data.games.forEach(game => {
            const player = game.player;
            if (!playerStats[player]) {
                playerStats[player] = {
                    drafts: 0,  // Number of deck entries
                    wins: 0,
                    losses: 0
                };
            }
            playerStats[player].drafts += 1;  // Each deck entry = 1 draft
            playerStats[player].wins += game.wins;
            playerStats[player].losses += game.losses;
        });

        // Convert to array and calculate win rate
        const players = Object.entries(playerStats)
            .map(([name, stats]) => ({
                name,
                ...stats,
                games: stats.wins + stats.losses,  // Games = total wins + losses
                winRate: stats.wins + stats.losses > 0
                    ? stats.wins / (stats.wins + stats.losses)
                    : 0
            }))
            .sort((a, b) => b.winRate - a.winRate); // Sort by win rate descending

        // Render stats
        if (statsOutput) {
            statsOutput.innerHTML = `
                <p><strong>Total Players:</strong> ${players.length}</p>
                <p><strong>Total Games:</strong> ${this.data.games.length}</p>
            `;
        }

        // Render leaderboard
        const html = players.map((player, index) => `
            <div class="player-item">
                <div class="player-name">${index + 1}. ${player.name}</div>
                <div class="player-stats">
                    <span class="win-rate">${(player.winRate * 100).toFixed(1)}% WR</span>
                    <span>${player.wins}-${player.losses}</span>
                    <span>${player.games} games</span>
                    <span>${player.drafts} drafts</span>
                </div>
            </div>
        `).join('');

        leaderboardOutput.innerHTML = html || '<p class="help-text">No players found.</p>';
    }

    // Notifications
    showNotification(message, type = 'info') {
        alert(message);
    }

    // ============ AUTHENTICATION ============

    // Auth state
    authMode = 'login'; // 'login' or 'register'
    currentUser = null;
    authToken = null;

    initializeAuth() {
        // Check for saved token
        const savedToken = localStorage.getItem('cubeAuthToken');
        const savedUser = localStorage.getItem('cubeAuthUser');

        if (savedToken && savedUser) {
            this.authToken = savedToken;
            this.currentUser = JSON.parse(savedUser);
            this.verifyToken();
        }

        // Add login button listener
        document.getElementById('loginBtn').addEventListener('click', () => this.openAuthModal());
    }

    async verifyToken() {
        try {
            const response = await fetch('/api/verify', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });

            if (response.ok) {
                this.updateAccountUI();
                // Sync data from server
                await this.loadFromServer();
            } else {
                this.logout();
            }
        } catch (error) {
            console.log('Token verification failed, offline mode');
        }
    }

    openAuthModal() {
        this.authMode = 'login';
        this.updateAuthModalUI();
        document.getElementById('authModal').classList.remove('hidden');
        document.getElementById('authUsername').focus();
    }

    closeAuthModal() {
        document.getElementById('authModal').classList.add('hidden');
        document.getElementById('authForm').reset();
        document.getElementById('authError').classList.add('hidden');
    }

    toggleAuthMode(e) {
        e.preventDefault();
        this.authMode = this.authMode === 'login' ? 'register' : 'login';
        this.updateAuthModalUI();
    }

    updateAuthModalUI() {
        const title = document.getElementById('authModalTitle');
        const submitBtn = document.getElementById('authSubmitBtn');
        const switchText = document.getElementById('authSwitchText');
        const switchLink = document.querySelector('.auth-switch a');

        if (this.authMode === 'login') {
            title.textContent = '🔐 Login';
            submitBtn.textContent = 'Login';
            switchText.textContent = "Don't have an account?";
            switchLink.textContent = 'Register';
        } else {
            title.textContent = '📝 Register';
            submitBtn.textContent = 'Create Account';
            switchText.textContent = 'Already have an account?';
            switchLink.textContent = 'Login';
        }

        document.getElementById('authError').classList.add('hidden');
    }

    async handleAuthSubmit(e) {
        e.preventDefault();

        const username = document.getElementById('authUsername').value.trim();
        const password = document.getElementById('authPassword').value;
        const errorDiv = document.getElementById('authError');

        try {
            const endpoint = this.authMode === 'login' ? '/api/login' : '/api/register';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                errorDiv.textContent = data.error || 'Authentication failed';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Success!
            this.authToken = data.token;
            this.currentUser = data.user;

            // Save to localStorage
            localStorage.setItem('cubeAuthToken', data.token);
            localStorage.setItem('cubeAuthUser', JSON.stringify(data.user));

            this.closeAuthModal();
            this.updateAccountUI();

            // Sync data
            if (this.authMode === 'register') {
                // New user - save current local data to server
                await this.saveToServer();
                this.showNotification('✅ Account created and data synced!', 'success');
            } else {
                // Existing user - load data from server
                await this.loadFromServer();
                this.showNotification('✅ Logged in and data loaded!', 'success');
            }

        } catch (error) {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.classList.remove('hidden');
        }
    }

    updateAccountUI() {
        const accountArea = document.getElementById('accountArea');

        if (this.currentUser) {
            accountArea.innerHTML = `
                <div class="user-info">
                    <span class="username">👤 ${this.currentUser.username}</span>
                    <span class="sync-status">● Synced</span>
                </div>
                <button class="btn btn-secondary btn-sync" onclick="cubeApp.syncData()">🔄 Sync</button>
                <button class="btn btn-secondary" onclick="cubeApp.logout()">Logout</button>
            `;
        } else {
            accountArea.innerHTML = `
                <button id="loginBtn" class="btn btn-secondary" onclick="cubeApp.openAuthModal()">🔐 Login</button>
            `;
        }
    }

    logout() {
        this.authToken = null;
        this.currentUser = null;
        localStorage.removeItem('cubeAuthToken');
        localStorage.removeItem('cubeAuthUser');
        this.updateAccountUI();
        this.showNotification('👋 Logged out', 'info');
    }

    async syncData() {
        if (!this.authToken) {
            this.showNotification('⚠️ Please login to sync', 'warning');
            return;
        }

        await this.saveToServer();
        this.showNotification('✅ Data synced!', 'success');
    }

    async saveToServer() {
        if (!this.authToken) return;

        try {
            console.log('📤 Saving to server...', {
                games: this.data.games?.length || 0,
                cards: this.data.masterCubeList?.length || 0
            });

            const response = await fetch('/api/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({ data: this.data })
            });

            if (response.ok) {
                console.log('✅ Data saved to server successfully');
            } else {
                console.error('❌ Failed to save:', response.status);
            }
        } catch (error) {
            console.error('Failed to save to server:', error);
        }
    }

    async loadFromServer() {
        if (!this.authToken) return;

        try {
            console.log('📥 Loading data from server...');
            const response = await fetch('/api/data', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });

            if (response.ok) {
                const result = await response.json();
                console.log('📦 Server response:', result);

                if (result.data && (result.data.masterCubeList || result.data.games)) {
                    this.data = result.data;
                    // Ensure imageOverrides exists
                    if (!this.data.imageOverrides) {
                        this.data.imageOverrides = {};
                    }
                    // Also update localStorage
                    localStorage.setItem('cubeLeaderboardData', JSON.stringify(this.data));
                    // Refresh UI
                    if (this.data.masterCubeList && this.data.masterCubeList.length > 0) {
                        document.getElementById('cubeList').value = this.data.masterCubeList.join('\n');
                    }
                    this.updateStats();
                    this.displayRecentGames();
                    console.log(`✅ Loaded ${this.data.games?.length || 0} games, ${this.data.masterCubeList?.length || 0} cards`);
                } else {
                    console.log('⚠️ No data on server yet');
                }
            } else {
                console.error('❌ Server error:', response.status);
            }
        } catch (error) {
            console.error('Failed to load from server:', error);
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.cubeApp = new CubeLeaderboard();
    window.cubeApp.initializeAuth();
});
