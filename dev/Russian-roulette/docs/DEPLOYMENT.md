# Deployment Checklist

This version is ready for private online demos as a single Node server. It is not designed as a public anonymous service with accounts, matchmaking, moderation, or persistent rooms.

## GitLab Pages / GitDocs Solo Demo

GitLab Pages/GitDocs can host the browser-only solo demo against bots. This static mode does not support real multiplayer rooms or voice chat because those features require Socket.IO and the Node server.

```bash
npm run build:pages
```

The `.gitlab-ci.yml` `pages` job publishes `packages/client/dist` as the GitLab Pages `public/` artifact. After the first successful pipeline, copy the exact URL from **Deploy > Pages** into the README.

## Build And Run

```bash
npm install
npm run build
NODE_ENV=production HOST=0.0.0.0 PORT=3001 CLIENT_ORIGIN=https://your-game.example.com npm start
```

In production, the Express server serves `packages/client/dist` and Socket.IO on the same origin.

## Required Environment

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT`: server port, usually behind a reverse proxy.
- `CLIENT_ORIGIN`: exact HTTPS origin allowed to connect, for example `https://your-game.example.com`.
- `VITE_SERVER_URL`: same HTTPS origin when building a separately hosted client.
- `VITE_RTC_ICE_SERVERS`: JSON or comma-separated STUN/TURN URLs for voice chat.

Do not commit TURN usernames, credentials, or deployment secrets.

## Reverse Proxy

Use HTTPS. Browsers require a secure context for microphone access, except on localhost.

Proxy requirements:

- Forward WebSocket upgrades for Socket.IO.
- Preserve `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto`.
- Serve static assets with caching, especially `/assets/cinematic/*`.
- Keep request body limits small; the app expects small JSON/socket payloads.
- Add an external health check against `/health`.

## Security Posture

Implemented hardening:

- Strict `CLIENT_ORIGIN` CORS in production.
- Socket.IO payload size cap.
- HTTP security headers and disabled `x-powered-by`.
- Input validation for room codes, names, card IDs, reconnect tokens, and voice signals.
- Per-socket action cooldowns for room/game/voice events.
- Global throttling for create/join/reconnect attempts.
- Room cap, idle cleanup, and empty-room cleanup.
- Reconnect token expiry and rotation.
- Same-room checks for gameplay and voice signaling.
- Private cards are sent only through `game:privateState`, never scene snapshots or voice metadata.

Remaining production gaps:

- No database, accounts, moderation, ban list, audit logging, or persistent rooms.
- No distributed multi-server room adapter.
- No TURN credential service.
- In-memory rooms are lost on restart.
- Abuse protection is suitable for private demos, not hostile public internet traffic.

## Voice Chat

Voice is peer-to-peer WebRTC. The server only relays signaling:

- `voice:join`
- `voice:leave`
- `voice:signal`
- `voice:muteState`

For production voice, use HTTPS and provide reliable STUN/TURN configuration. TURN is strongly recommended for players behind restrictive networks.
