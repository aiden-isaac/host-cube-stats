# Feature Research: Inspiration for `host-cube-stats`

A combined research report on features from [CubeCobra](https://cubecobra.com) and the [MTG Companion App](https://magic.wizards.com/en/products/companion-app) that could be valuable additions to this project.

---

## Currently in `host-cube-stats`

*   **Maindeck Rate Tracking**: How often each card is played across all games.
*   **Win/Loss Tracking**: Simple per-card and per-player win rate calculation.
*   **Scryfall Integration**: Card images, art selection, and fuzzy name search.
*   **Player Leaderboard**: Ranking players by win rate.
*   **Import / Export**: JSON backup and restore of all data.

---

## Part 1: Features from CubeCobra

### 1. Elo Rating System (Cards & Players)
CubeCobra uses an Elo system to rank card power based on pick order. A card in a winning deck "beats" all cards in the losing deck, adjusting ratings over time. This provides a more nuanced **Power Rank** than a simple win percentage, which is sensitive to small sample sizes.

### 2. Multi-Format Support
CubeCobra supports Bo1, Bo3, Sealed, and Grid Draft formats.

**Application**: Add a **Format** field to game entries (e.g., Bo1, Bo3, Sealed). This enables filtering stats by format — "Which cards perform best in Sealed vs. Draft?"

### 3. Visual Cube Management ("Visual Spoiler")
CubeCobra displays the entire cube as a visual image grid sorted by Color, CMC, and Type.

**Application**: A dedicated **Cube View** tab showing the master list as a card image grid, sorted by color and mana value — giving an instant view of cube balance.

### 4. Direct CubeCobra Integration
Most players already manage their cube on CubeCobra.

**Application**:
- **Import by ID**: Enter a CubeCobra cube ID to automatically fetch the master card list.
- **External Links**: "View on CubeCobra" links on card detail views.

### 5. Tagging & Archetype Analysis
CubeCobra lets users tag cards with roles like "Removal", "Ramp", or "Finisher".

**Application**: Tagging cards and then filtering stats by tag — e.g. "What is the average maindeck rate of cards tagged **Board Wipe**?"

### 6. Rotation Recommendations
CubeCobra suggests cards to add. `host-cube-stats` is uniquely positioned to suggest **cuts** based on actual play data.

**Application**: An automated **Rotation Recommendation** section that flags cards with both low maindeck rates AND low win rates as candidates for replacement.

### 7. Global Data Comparison
CubeCobra aggregates data from thousands of cubes for community-wide comparisons.

**Application**: Compare local stats against CubeCobra community averages — e.g. "This card is maindecked 20% less in your cube than the community average."

---

## Part 2: Features from MTG Companion

### 1. Session / Event Entity
Companion groups all games in a night into a single "Event" with a roster of players and a format.

**Application**: A **Session** model for `host-cube-stats`. Instead of logging games individually, users start a "Cube Night" session and add games to it. Sessions enable session-specific standings and historical comparisons between nights.

### 2. Standard Tournament Standing Metrics

Companion uses the official Wizards tiebreaker system for standings:

| Metric | Definition |
|--------|------------|
| **Match Points** | 3 for Win, 1 for Draw, 0 for Loss |
| **OMW%** (Opponent Match Win %) | Strength of schedule — average win % of all your opponents |
| **GW%** (Game Win %) | Total individual games won ÷ games played |
| **OGW%** (Opponent Game Win %) | Average game win % of all your opponents |

> [!NOTE]
> OMW% has a floor of 33% — no opponent's percentage can count below that to prevent unfair punishment for playing weak fields.

**Application**: Implement these metrics for a **Session Leaderboard tab**, giving cube nights a genuine tournament feel.

### 3. Tournament Codes (Session Join Codes)
When an organizer creates an event in Companion, a unique alphanumeric code (or QR code) is generated. Players enter this code in their own app to join the event, view pairings, and submit their own match results.

**Application**: **Session Hosting with Join Codes.** When a host creates a session in `host-cube-stats`, a short **6-character Session Code** is generated. Players on their own phones enter the code to:
- Join the session's player roster.
- Submit their own match results directly (eliminating the host bottleneck).
- View live standings on their own device.

### 4. Automated Swiss Pairings
Companion generates round pairings using Swiss rules (pair players with similar records).

**Application**: After each round in a session, the app suggests **optimal pairings** for the next round based on current session scores, so the host doesn't have to figure it out manually.

### 5. In-Match Utilities
Companion includes a built-in life counter and round notifications.

**Application**: A simple **Life Counter** and/or **Round Timer** accessible from the mobile view of `host-cube-stats` — quality-of-life tools for players mid-match.

---

## Combined Implementation Priority

| Feature | Source | Complexity | Value |
|---------|--------|------------|-------|
| **Session Join Codes** | MTG Companion | High | ⭐⭐⭐⭐⭐ Very High |
| **Elo Rating System** | CubeCobra | Medium | ⭐⭐⭐⭐ High |
| **Session Tracking** | MTG Companion | Medium | ⭐⭐⭐⭐ High |
| **Visual Cube View** | CubeCobra | Medium | ⭐⭐⭐ Medium |
| **CubeCobra Import by ID** | CubeCobra | Low | ⭐⭐⭐ Medium |
| **Rotation Recommendations** | CubeCobra | Low | ⭐⭐⭐ Medium |
| **Swiss Pairings** | MTG Companion | Medium | ⭐⭐⭐ Medium |
| **Tagging & Archetypes** | CubeCobra | Medium | ⭐⭐ Low-Medium |
| **Multi-Format Support** | CubeCobra | Low | ⭐⭐ Low-Medium |
| **Life Counter / Timer** | MTG Companion | Low | ⭐ Low |
