# CapitalLoop — Private Multiplayer Monopoly-Style Board Game

A complete, server-authoritative, browser-based multiplayer Monopoly-style web game built with **React, TypeScript, Vite, Node.js, Express, and Socket.IO**.

Designed exclusively for **private invite-only games with friends** — zero public rooms, zero random matchmaking, and zero bots.

## Key Features

- **Strict Private Room System**: Unique 5-character room codes, shareable `/join/:code` invite links, host room lock/unlock, player removal, ready checks, and SHA-256 session-token reconnection.
- **Complete Authoritative Monopoly Engine**: Two dice, clockwise 40-tile movement, doubles extra turn & 3-doubles-to-Prison, property buying, open timed auctions, color-set 2x rent, houses & hotels with even-building and bank supply rules, mortgages with configurable interest, player-to-player trades with counteroffers, Prison escape mechanics, Income/Luxury taxes, Vacation cash pot, Surprise & Treasury card decks, debt liquidation, bankruptcy transfers, and winner rankings.
- **Every Host Setting Works**: 20 real server-enforced rules including map selection (`Classic Metro` & `Global Capitals`), starting cash, Start bonus, turn timer, tax calculation mode, auctions, trading, mortgages, game speed, and house rules.
- **Richup-Inspired Responsive UI**: Dark violet default theme + Light mode + live custom color editor (board, UI, accent, buttons, and all 8 property groups), Top-Left `START >>` clockwise board, 3D dice animation, live center activity log, room chat, and mobile portrait/landscape support.

## Quick Start (Local Development)

```bash
# 1. Install all workspace dependencies
npm install

# 2. Copy environment configuration
cp .env.example .env

# 3. Start shared watcher, Express/Socket.IO server (port 4000), and Vite client (port 5173)
npm run dev
```

Open `http://localhost:5173` in two browser tabs (or share over LAN) to create a private room and play.

## Build, Typecheck & Automated Tests

```bash
# Run all engine & private-room security tests
npm test

# Strict TypeScript check across shared, server, and client
npm run typecheck

# Production build (compiles shared, server, and client/dist)
npm run build

# Start production server serving both SPA & WebSockets on PORT (default 4000)
npm start
```

## Documentation

- [Architecture & Security Model](docs/ARCHITECTURE.md)
- [Linux VPS & Docker HTTPS Deployment Guide](docs/DEPLOYMENT.md)
