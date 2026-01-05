# Cube Stats - MTG Cube Leaderboard

A card performance tracking app with user authentication.

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Start server
npm start
```

Open http://localhost:8080

## Deployment (Docker)

```bash
# Build and run
docker compose up -d

# View logs
docker compose logs -f
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server port |
| `JWT_SECRET` | (default) | Secret key for JWT tokens - **change in production!** |
| `DB_PATH` | ./data/cube-stats.db | SQLite database path |

## Features

- 🎲 Track card performance with CUS scoring
- 🔐 User accounts with encrypted passwords (bcrypt)
- 🔄 Data sync across devices
- 🖼️ Scryfall card images with custom art picker
- 📊 Filterable leaderboard

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Create account |
| POST | `/api/login` | Login |
| GET | `/api/data` | Get user data (auth required) |
| POST | `/api/data` | Save user data (auth required) |
