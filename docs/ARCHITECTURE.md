# CapitalLoop Architecture

## 1. Monorepo Overview

CapitalLoop is an npm-workspaces TypeScript monorepo split into three focused packages:

- **`shared/` (`@capitalloop/shared`)**: Zero-dependency domain types, map configs (`classicMetro`, `globalCapitals`), card decks, gameplay rule modules, and the pure deterministic `applyGameAction` state reducer.
- **`server/` (`@capitalloop/server`)**: Express + Socket.IO authoritative multiplayer server enforcing private room isolation, SHA-256 session tokens, Zod schema validation, cryptographic RNG (`crypto.randomInt`), sliding-window rate limiting, server-side turn/auction timers, and atomic disk snapshot persistence.
- **`client/` (`@capitalloop/client`)**: React 18 + Vite responsive SPA featuring a Richup.io-inspired dark violet aesthetic, light/dark custom theme engine, clockwise Top-Left `START >>` 40-tile board, smooth token animation, and full modal workflows.

## 2. Strict Private-Room-Only Security

CapitalLoop guarantees **zero public discovery and zero bots**:

1. **No Public APIs**: There is no `/api/rooms` listing endpoint, no matchmaking queue, and no auto-join mechanism.
2. **Unambiguous 5-Character Codes**: Generated via `crypto.randomInt` over a 32-character alphabet excluding `0/O/1/I`.
3. **Access Guards**: `room:join` rejects unknown codes, locked rooms (`isLocked === true`), active games (`status !== 'LOBBY'`), full rooms, and previously kicked IPs.
4. **Per-Seat Session Tokens**: On create/join, the server issues a 256-bit random `sessionToken` and stores only `sha256(sessionToken)`. Every subsequent socket action and reconnect verifies the token with `crypto.timingSafeEqual`.
5. **State Sanitization**: `sanitizeGameState()` strips deck card order before broadcasting `ClientGameState`.

## 3. Authoritative Game Loop

```text
Client emits game:action (with roomCode, playerId, sessionToken)
  -> Zod schema validation + Socket rate limiter
  -> RoomManager verifies seat token hash
  -> GameController runs shared applyGameAction(state, actorId, action, cryptoRng)
  -> Updated GameState persisted atomically to disk
  -> Sanitized state + domain events broadcast to Socket.IO room
  -> GameTimerManager reschedules authoritative turn / auction timers