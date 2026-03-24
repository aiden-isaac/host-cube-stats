-- Cube Stats v2 — Normalized Database Schema
-- Run once on first startup; migration handled by database.js

-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'player',  -- 'host' or 'player'
    remember_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Master Cube List (versioned)
CREATE TABLE IF NOT EXISTS cube_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,                   -- NULL = current active version
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cube_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER REFERENCES cube_versions(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    scryfall_id TEXT,
    image_url TEXT,
    art_crop_url TEXT,
    artist TEXT,
    type_line TEXT,
    cmc REAL,
    UNIQUE(version_id, card_name)
);

-- Pre-cached artwork for login backgrounds
CREATE TABLE IF NOT EXISTS cached_artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_name TEXT NOT NULL,
    art_crop_url TEXT NOT NULL,
    local_path TEXT,
    artist TEXT NOT NULL,
    dominant_color TEXT,
    UNIQUE(card_name)
);

CREATE TABLE IF NOT EXISTS image_overrides (
    card_name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    set_by INTEGER REFERENCES users(id),
    PRIMARY KEY (card_name)
);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    join_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby',
    format TEXT NOT NULL DEFAULT 'bo1',
    max_players INTEGER DEFAULT 8,
    draft_timer_enabled BOOLEAN DEFAULT 0,
    draft_timer_seconds INTEGER DEFAULT 60,
    match_timer_enabled BOOLEAN DEFAULT 0,
    match_timer_minutes INTEGER DEFAULT 50,
    current_round INTEGER DEFAULT 0,
    total_rounds INTEGER,
    cube_version_id INTEGER REFERENCES cube_versions(id),
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS tournament_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    seat_number INTEGER,
    decklist_submitted BOOLEAN DEFAULT 0,
    UNIQUE(tournament_id, user_id)
);

-- Decklists
CREATE TABLE IF NOT EXISTS decklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    deck_title TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS decklist_cards (
    decklist_id INTEGER REFERENCES decklists(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    is_sideboard BOOLEAN DEFAULT 0,
    image_url TEXT,
    PRIMARY KEY (decklist_id, card_name, is_sideboard)
);

-- Matches & Results
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    player1_id INTEGER REFERENCES users(id),
    player2_id INTEGER REFERENCES users(id),
    player1_wins INTEGER DEFAULT 0,
    player2_wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    result_submitted_by INTEGER REFERENCES users(id),
    status TEXT DEFAULT 'pending',
    started_at DATETIME,
    completed_at DATETIME
);

-- Life tracking (persisted for reconnect)
CREATE TABLE IF NOT EXISTS life_totals (
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    life INTEGER DEFAULT 20,
    PRIMARY KEY (match_id, user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cube_cards_version ON cube_cards(version_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_user ON tournament_players(user_id);
CREATE INDEX IF NOT EXISTS idx_decklists_tournament ON decklists(tournament_id);
CREATE INDEX IF NOT EXISTS idx_decklists_user ON decklists(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round_number);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_join_code ON tournaments(join_code);
