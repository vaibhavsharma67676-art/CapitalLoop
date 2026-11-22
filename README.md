# CAPITALLOOP — Multiplayer Monopoly-Style Board Game

**© 2026 Vaibhav Kumar Sharma. All rights reserved.**

A full-stack, server-authoritative multiplayer Monopoly-style browser game built with **React, TypeScript, Vite, Node.js, Express, and Socket.IO**. Engineered for mobile portrait phones, tablets, and desktop browsers while keeping the board layout, tiles, rules, and maps faithful to CapitalLoop.

---

## Playing Modes & Features

1. **Play With Friends (Private Rooms)**
   - Create invite-only rooms with unique 5-character codes and `/join/:code` invite URLs.
   - Host room lock/unlock, player kick controls, ready checks, room chat, and SHA-256 session-token reconnection.
2. **Play With Random Players (Quick Match)**
   - Optional public matchmaking queue (`MATCHMAKING_ENABLED=true`) matching players by map, game speed, and player count.
   - Live search status, instant cancel, disconnect cleanup, duplicate-assignment protection, and strict isolation from private rooms.
3. **Play With Bots (`Easy`, `Medium`, `Hard`, `Expert`)**
   - Add bots before or inside the lobby, change bot difficulty, or mix human players and AI bots in the same match.
   - Bots follow identical rules, cannot access hidden information or alter dice, and handle buying, auctions, building, mortgaging, debt liquidation, and trades fairly.
4. **Fair Cryptographic Dice**
   - Every dice roll (`1`–`6` per die) is generated and validated on the server using Node.js `crypto.randomInt`.
5. **Advanced Mortgage System (Including Mid-Purchase)**
   - Mortgage eligible properties on your turn—including during `AWAITING_BUY_DECISION` when short on cash—to raise funds and complete the property purchase in the same turn.
6. **Audio & Optional Discord Integration**
   - Synthesized game sound effects with master volume slider, mute toggle, and mobile autoplay unlock.
   - Optional Discord OAuth2 account linking, Discord community link, and game webhook notifications (disabled cleanly when env vars are unset).

---

## Local Development, Typecheck, Tests & Build

```bash
npm install
npm run typecheck
npm test
npm run build
npm start
```

---

## Railway Deployment Guide

1. Push the repository to GitHub and create a new service in **Railway** (uses root `Dockerfile` automatically).
2. Configure environment variables in Railway (see `.env.example` — never commit real secrets):
   - `NODE_ENV=production`
   - `HOST=0.0.0.0`
   - `TRUST_PROXY=1`
   - `CLIENT_ORIGIN=https://<your-railway-domain>.up.railway.app`
   - `MATCHMAKING_ENABLED=true`
   - Optional Discord variables: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `DISCORD_INVITE_URL`, `DISCORD_WEBHOOK_URL`, `DISCORD_SESSION_SECRET`
3. Optionally attach a persistent Railway Volume mounted at `/app/data` (`DATA_DIR=./data` / `/app/data`) for room persistence across restarts.

