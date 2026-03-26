# Cube Stats v2 — MTG Cube Tournament Platform

A self-hosted MTG Cube tournament management platform. One master cube list, full tournament lifecycle, live life tracking, Swiss pairings, and exportable leaderboards — all running on a Raspberry Pi.

## Vision

**Cube Stats v2** is a complete rewrite of the original cube leaderboard tracker. Instead of per-user isolated data, the entire site revolves around **one shared cube list** managed by the host. Players join tournaments, draft, submit decklists, play Swiss rounds with real-time life tracking, and view global leaderboards.

## Core Features

### 🔐 Authentication
- Login/register with "Remember Me" (30-day JWT)
- Role-based access: **Host** (full control) and **Player** (view + play)

### 🃏 Cube List
- Visual card gallery powered by Scryfall
- **Versioned** — each update is named and dated (e.g. *"Lorwyn Eclipsed" Feb 2026 – Apr 2026*)
- Host-only editing; all users can browse any version

### 🏆 Tournaments
- Host creates tournaments with configurable settings (format, timers, player count)
- **Join codes** — players enter a 6-character code to join the lobby
- Host arranges seating, starts draft, manages rounds
- **Draft timer** with real-time countdown (Socket.IO)
- **Swiss pairings** auto-generated each round
- **Life tracker** synced per-player (independent from result submission)
- **Match result submission** by any participant
- **WotC tiebreakers**: Match Points, OMW%, GW%, OGW%
- **Exportable standings** as a shareable 16:9 image

### 📋 Decklists
- Players submit decklists after drafting (with ready status)
- All players can view each other's decklists
- Host can edit decklists for post-tournament corrections

### 📊 Leaderboard
- Global player stats aggregated across all tournaments
- Per-player profile with win rate, match history, deck exports

### ⚙️ Settings
- Profile picture, display name, password management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Real-time | Socket.IO |
| Auth | JWT + bcrypt |
| Card Data | Scryfall API |
| Deploy | Docker + Cloudflare Tunnel |

## Quick Start (Development)

```bash
# Install backend dependencies
npm install

# Start backend development server
npm run dev

# In a new terminal, start frontend
cd client
npm install
npm run dev
```

## Deployment (Production)

The application is containerized and ready for production deployment on a Raspberry Pi (or any Docker host).

```bash
# Build and start the container
docker compose up -d --build
```

Live at `cube.frizzt.com` via Cloudflare Tunnel → `localhost:8888`.

## Project Status

🚀 **v2 Beta is complete.** The platform is fully functional for hosting and playing cube tournaments. See [implementation_plan.md](implementation_plan.md) for the original technical roadmap.

## Future Roadmap
- Camera-based card scanning for decklists
- Decklist image generation (tournament-style)
- Multi-host permission system
- Elo rating system for cards and players
- CubeCobra import integration
