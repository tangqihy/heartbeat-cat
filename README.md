# My Heartbeat

Track application usage across multiple devices (Windows, Linux/Steam Deck, iOS) and visualize it in a web dashboard.

## Architecture

```
clients/           Heartbeat senders (per-platform)
  ├── windows/     Windows client (PowerShell + uiohook-napi)
  ├── linux/       Linux / Steam Deck client (xdotool + uiohook-napi)
  └── ios/         iOS Shortcuts automation config
server/            Fastify API + SQLite storage
web/               Vue 3 + ECharts dashboard
```

**Data flow:** Clients send periodic heartbeats (foreground app, window title, input counts) → Server aggregates into sessions → Web dashboard renders day/week usage charts.

## Quick Start

### 1. Server

```bash
cd server
cp .env.example .env   # edit API_KEY
npm install
npm run dev            # http://localhost:3000
```

### 2. Web Dashboard

```bash
cd web
npm install
npm run dev            # http://localhost:5173 (proxies API to :3000)
```

### 3. Client (pick your platform)

**Windows:**
```bash
cd clients/windows
cp .env.example .env   # set DEVICE_ID, SERVER_URL, API_KEY
npm install
npm start
```

**Linux / Steam Deck:**
```bash
cd clients/linux
cp .env.example .env
npm install
npm start
# Optional: install as systemd user service
cp heartbeat.service ~/.config/systemd/user/
systemctl --user enable --now heartbeat
```

**iOS:** Follow the Shortcuts setup in `clients/ios/shortcut.json`.

## Production Deploy

```bash
# Build frontend
cd web && npm run build

# Build & run server (serves web/dist as SPA)
cd server && npm run build && npm start
```

Or use Docker:

```bash
docker compose up -d
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/api/heartbeat` | POST | Receive heartbeat (Bearer auth) |
| `/api/devices` | GET | List registered devices |
| `/api/usage/summary` | GET | Usage by app (params: `start`, `end`, `device_id?`) |
| `/api/usage/timeline` | GET | Session timeline |
| `/api/usage/weekly` | GET | Weekly usage by day (param: `week_start`) |

## AI Extension (Optional)

Set `ANTHROPIC_API_KEY` in a client's `.env` to enable screenshot capture + AI activity description. Each screenshot is sent to Claude for structured analysis (activity type, description, visible apps, idle detection) and stored as diary entries.

## Tech Stack

- **Server:** Node.js, Fastify, better-sqlite3
- **Web:** Vue 3, Vite, ECharts
- **Clients:** TypeScript (tsx), uiohook-napi, PowerShell (Windows) / xdotool (Linux)
