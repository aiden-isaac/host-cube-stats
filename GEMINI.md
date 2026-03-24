# Project Overview

**Cube Stats v2** is a self-hosted Magic: The Gathering (MTG) Cube tournament management platform. It revolves around a single shared cube list managed by the host. The application handles the full tournament lifecycle, including player joining, drafting, real-time life tracking, Swiss pairings, and global leaderboards.

## Architecture & Technologies

This is a full-stack JavaScript/TypeScript application consisting of a backend API and a frontend client.

**Backend (`/src`)**:
- **Runtime/Framework**: Node.js with Express
- **Database**: SQLite (via `better-sqlite3`)
- **Real-time**: Socket.IO
- **Authentication**: JWT & bcryptjs
- **Other Tools**: `multer` for file uploads, `sharp` for image processing

**Frontend (`/client`)**:
- **Framework**: React 19 (Vite)
- **Routing**: React Router
- **Styling**: Vanilla CSS (based on `lucide-react` for icons and custom CSS)
- **Real-time**: Socket.IO Client

## Building and Running

### Prerequisites
- Node.js
- Docker (for deployment)

### Backend Setup
From the project root directory (`/home/aiden/Projects/host-cube-stats`):
```bash
# Install backend dependencies
npm install

# Start the backend development server (runs on nodemon)
npm run dev

# Run backend tests (Vitest)
npm test
```

### Frontend Setup
From the `/client` directory:
```bash
cd client

# Install frontend dependencies
npm install

# Start the frontend development server (Vite)
npm run dev

# Build the frontend for production
npm run build

# Run frontend linting
npm run lint
```

### Deployment
The application is containerized and can be deployed using Docker:
```bash
docker compose up -d
```
The live application is expected to run via a Cloudflare Tunnel.

## Development Conventions
- **Code Organization**: Backend code is in `src/` (with routes, controllers, middleware, and db logic). Frontend code is isolated in `client/src/`.
- **Database**: SQLite database files are stored in the `data/` directory (`cube-stats.db-shm`, `cube-stats.db-wal`).
- **Real-time Features**: Socket.IO is heavily used for the draft timer, life tracker, and tournament state sync.
- **Testing**: Backend testing is done using Vitest (`npm test` in the root). Frontend uses ESLint for code quality.
