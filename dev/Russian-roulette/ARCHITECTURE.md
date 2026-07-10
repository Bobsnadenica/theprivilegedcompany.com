# Architecture

## Technology Stack

- **Client:** React, Vite, TypeScript, Three.js, Socket.IO client for online mode, local solo controller for static demo mode, WebRTC voice, lucide-react icons.
- **Server:** Node, Express, Socket.IO, TypeScript, production static serving.
- **Shared package:** TypeScript rules engine and socket/public-state types.
- **Testing:** Vitest for unit and Socket.IO integration tests; Playwright for browser e2e.
- **Assets:** Original generated noir visuals, reproducible GLB props for the bar room/table/cards/release roulette gun, committed water-effect PNG textures, and a generated alpha character atlas for 2.5D player rigs.

## Architecture Overview

The game is split into three workspace packages:

```text
@rrld/shared  Pure rules engine and shared data contracts
@rrld/server  Authoritative room and realtime server
@rrld/client  Browser UI
```

The server is authoritative in online multiplayer. Clients never decide challenge outcomes, turn advancement, card validity, roulette results, elimination, or winners in online rooms. The static solo demo is explicitly browser-local: it uses the same shared engine in the client against bot opponents and does not connect to Socket.IO.

## State Flow

### Online Multiplayer

1. Client emits a room or game action over Socket.IO.
2. Server identifies the socket's room/player.
3. Server calls the shared game engine.
4. Engine returns a new `GameState` plus public log events.
5. Engine attaches structured animation metadata to public log events where useful.
6. After a LIAR challenge, the server adds a short `actionsLockedUntil` timestamp to the authoritative state so clients, timers, and socket handlers all wait for the gun/result beat.
7. Server broadcasts `room:state` to each connected player.
8. Server emits `game:privateState` separately to each player with only that player's hand.
9. Client renders a phase-based cockpit: compact room bar, center table stage, above-head 3D player labels, voice dock, latest-event ticker, expandable history, and bottom action tray.
10. `useAnimationDirector` derives client-only animation beats from new log events and queues them against the persistent `BarScene`.
11. `BarScene` turns each beat into a named client-only timeline with staged character, card, camera, light, and roulette motion.
12. `BarScene` loads GLB props and the character texture atlas, reports readiness/fallback state, and exposes a redacted e2e scene snapshot.

### Static Solo Demo

1. The entry screen can start a local solo session without opening a Socket.IO connection.
2. `useSoloGame` starts the shared engine with one human player plus three bots.
3. The hook converts local `GameState` into the same `RoomState`, public players, private human hand, and event-log shapes used by online mode.
4. Bot turns run in the browser after a short delay and call the same shared `playCards` / `callLiar` engine functions.
5. Solo mode applies the same post-challenge action lock locally so bots cannot act while the gun/result beat is resolving.
6. Voice, reconnect, room code, and server timers are disabled in solo mode; the same React cockpit and `BarScene` presentation still render cards, challenges, roulette, elimination, and winner states.

Voice has a separate presentation path:

1. A player grants microphone permission and emits `voice:join`.
2. The server records only voice peer metadata for the current room.
3. Browsers exchange WebRTC offers, answers, and ICE candidates through `voice:signal`.
4. Audio streams flow peer-to-peer between browsers; the server never receives audio.
5. Mute and speaking state are broadcast as small public room voice metadata.
6. The client attaches remote audio elements, retries blocked playback on user gesture, and uses Web Audio analyser energy to mark peers as speaker-linked, receiving-audio, blocked, or silent.

## Major Design Decisions

- **Shared pure engine:** Rules are testable without sockets or React. The same functions power server actions and unit tests.
- **In-memory rooms:** This keeps the challenge focused and easy to run locally. State loss on restart is accepted.
- **Private state per socket:** Public state contains counts and revealed challenge cards only. Hands are sent with `game:privateState`.
- **Server timer:** Prevents stalled games and avoids trusting client clocks for turn ownership.
- **Clockwise seat order:** Player join order is the table's clockwise order. Normal turns and post-roulette round starters move clockwise, skipping eliminated players and empty-hand players where the rules require it.
- **Post-challenge action lock:** After `callLiar`, online rooms publish `actionsLockedUntil` and reject `game:playCards`, `game:callLiar`, and timer auto-advance while the value is in the future. The client mirrors this timestamp for disabled cards/buttons and "Resolving LIAR challenge" copy.
- **Room code plus reconnect token:** A lightweight local-storage reconnect flow without accounts.
- **Reconnect token hardening:** Tokens expire, rotate on successful reconnect, and clear on explicit leave.
- **Private demo security posture:** The server validates all socket payloads, limits payload size, throttles high-risk actions, caps rooms, applies strict production CORS, emits safer errors in production, and cleans idle/empty rooms.
- **One-server online deployment:** In production, the built Express server serves `client/dist` and Socket.IO on the same HTTPS origin. Reverse proxies must forward WebSocket upgrades.
- **GitLab Pages solo deployment:** A static client build can be published by GitLab Pages/GitDocs for solo-vs-bots demos. This path is intentionally not real multiplayer because GitLab static hosting cannot run the Node/Socket.IO server.
- **Peer-to-peer voice:** Voice is browser-to-browser WebRTC. Socket.IO is only the signaling bus, and same-room checks prevent cross-room signaling.
- **Original visual assets:** The noir table image and core cinematic GLB models were generated for this project; no Liar's Bar art was copied.
- **Generated GLB and texture pipeline:** `npm run generate:assets` runs a Three.js `GLTFExporter` script with a Node `FileReader` polyfill to regenerate compact in-repo prop assets plus water stream, mist, and splash textures.
- **Generated release gun prop:** `BarScene` loads the committed generated `toy-roulette.glb` as the default roulette prop. The optional Sketchfab importer is kept only for local visual experiments and is not preferred by the release runtime.
- **2.5D character upgrade:** Player seats now use a generated transparent noir-gambler atlas cropped into camera-facing Three.js billboard rigs, with eye-glint overlays to keep all characters readable under cinematic lighting. The older generated GLB characters remain as fallback if texture loading fails.
- **3D visual upgrade:** The client uses a persistent asset-loaded Three.js scene for the animated bar, table, character rigs, physical cards, lights, and roulette-gun prop while keeping all gameplay state server-driven.
- **Animation director:** React state remains declarative for controls and readable game state. The animation layer is driven by structured public events, queues beats in order, cancels stale work on room/lobby transitions, and exposes imperative scene commands such as `dealCards`, `throwCards`, `revealCards`, `playLiarImpact`, `playRoulette`, `playWin`, and `playLoss`.
- **Phase-based cockpit UI:** The client keeps one obvious primary action per phase: create/join, start, play/call, watch challenge, resolve roulette, or play again/exit. The confusing side rail was removed; seat status, voice, latest event, and history now live in stable cockpit regions so the cinematic table stays readable.
- **Roulette chamber visibility:** The server exposes shot counts, remaining chamber count, and public roulette event metadata without revealing hidden chamber order. The client derives six-dot indicators for 3D character labels and the roulette focus state. The final remaining chamber is naturally known after five dry shots and is shown as a last-chamber warning.
- **Voice diagnostics:** WebRTC voice remains peer-to-peer, but the client now surfaces connection quality with per-peer states: connecting, speaker-linked, receiving audio, blocked, and silent. A local speaker-test button separates output-device problems from remote WebRTC problems.
- **Timeline runner:** `BarScene` uses a small internal sequence/parallel/wait/tween runner so round start, card play, LIAR impact, reveal, roulette, elimination, and winner beats can be staged without a new dependency.
- **Gun cutscene:** Roulette is a multi-phase client-only timeline: prop entrance, chamber spin-up, aim at the affected seat, suspense hold, trigger squeeze, dry puff or water stream/splash, and character reaction. The server still owns the actual result and still uses `BLANK`/`LETHAL`; the client maps those to dry/water presentation.
- **Suspense reveal gate:** The server may know the roulette result immediately, but React presentation waits for `BarScene` stage callbacks before showing dry/water text, eliminated styling, winner banners, or result-specific event-log entries for the active challenge.
- **Post-challenge control recovery:** Once the result panel has settled and `actionsLockedUntil` has expired, the active survivor can select and play immediately. This prevents survivor browsers from getting stuck after dry results or 3-4 player eliminations while still blocking premature input during the gun animation.
- **Camera and motion presets:** Named camera presets (`lobby`, `table`, `activeSeat`, `cardPlay`, `liarImpact`, `reveal`, `roulette`, `winner`) coordinate framing with character/card motion states, but normal play and roulette now prefer a calmer local-player table view over aggressive punch-ins.
- **Side-seat readability:** Character seat roots stay fixed to their table anchors; only billboard character layers, nameplates, and chamber indicators yaw toward the camera. This keeps side players readable without making the whole seat rig look crooked.
- **Scene validation:** The client exposes a test-only redacted scene snapshot with asset IDs, character texture IDs/state, quality profile, active beat, timeline names, camera preset, pile count, selected count, reveal count, card motion state, character motion states, granular roulette state, roulette display phase, result-unlock state, action-lock state, local seat index, visible nameplate count, gun mesh names, roulette visual result, aimed player, dry puff, and water stream/splash visibility. It does not include private hand cards.
- **Rules overlay:** Onboarding is client-only and local-storage backed. It has no server impact and can be reopened from the room panel.
- **Reduced motion:** CSS animation duration is reduced for users who prefer reduced motion, and Three.js command durations are shortened.
- **Solo bots as demo-only:** Bot opponents exist only for the static GitLab-hosted solo demo. Online multiplayer remains real-player only.

## Animation Event Metadata

`GameEvent` may include an optional `animation` payload. This keeps socket names stable while giving the client enough public information to create cinematic beats:

- `round`: table rank, round number, active player IDs.
- `play`: player ID, card count, turn number.
- `challenge`: caller, accused, revealed cards, liar-card IDs.
- `roulette`: affected player, `BLANK`/`LETHAL` result, public shot number, and remaining chamber count. The result is user-facing as dry click/miss or hit.
- `elimination` and `winner`: affected player IDs.

Private hands are still sent only through `game:privateState`; animation metadata never exposes unrevealed cards.
During an unresolved roulette beat, the client masks current result-bearing roulette, elimination, and winner log messages until the scene reports that the dry puff or water splash stage has made the result visible.

## Socket Interface

Client to server:

- `room:create`
- `room:join`
- `room:reconnect`
- `room:start`
- `room:leave`
- `game:playCards`
- `game:callLiar`
- `game:restart`
- `voice:join`
- `voice:leave`
- `voice:signal`
- `voice:muteState`

Server to client:

- `room:state`
- `game:privateState`
- `game:eventLog`
- `game:error`
- `room:closed`
- `voice:peers`
- `voice:signal`
- `voice:peerState`

Voice payloads are validated separately from gameplay payloads. `voice:signal` permits WebRTC session descriptions and ICE candidates only between joined voice peers in the same room.
