# Specification

## Game Rules

Russian Roulette Liar's Deck is a bluffing game for 2-4 seats. The primary mode is real-player online multiplayer; the GitLab/GitDocs bonus mode is a browser-only solo demo where one human plays against three local bots.

### Decks

- Liar deck: 6 Kings, 6 Queens, 6 Aces, 2 Jokers.
- Table rank deck: King, Queen, Ace.
- Each non-eliminated player starts each round with 5 cards.
- Each player has a personal roulette deck with 1 water-filled chamber and 5 dry chambers, shuffled at game start. The shared/server protocol still represents these as `LETHAL` and `BLANK` for compatibility.
- Roulette chambers are drawn without replacement. After five dry chambers, the sixth chamber is guaranteed to hit.

### Round Flow

1. A table rank is revealed: King, Queen, or Ace.
2. Each non-eliminated player receives 5 cards from the shuffled liar deck.
3. The active player plays 1-3 cards face down.
4. Opponents see only how many cards were played.
5. The next active player may play cards or call `LIAR` on the previous play.
6. Players with empty hands are skipped.
7. If only one player still has cards and there is a previous play, that player must call `LIAR`.
8. Seat/join order is the clockwise table order. Normal turns advance clockwise, skipping eliminated players and players with no cards.

### Challenge Resolution

- Cards matching the table rank are truthful.
- Jokers are always truthful.
- Any other rank is a liar card.
- If the accused player revealed at least one liar card, the accused player resolves roulette.
- If the accused player was truthful, the caller resolves roulette.
- Dry chamber: after the suspense beat resolves, the gun clicks dry, the player survives, and a new round begins.
- Water-filled chamber: after the suspense beat resolves, the gun splashes the resolving player and that player is eliminated.
- After any dry or hit roulette result, the next round starts with the next non-eliminated player clockwise after the roulette player.
- During roulette resolution, gameplay actions are server-locked so no player can select, play, call `LIAR`, or auto-advance until the gun/result beat has finished.
- Last non-eliminated player wins.

### Turn Timer

- Each active turn has a 30-second server timer.
- Timeout auto-plays the first card when playing is legal.
- Timeout auto-calls `LIAR` only when the player is forced to challenge.
- Timeout auto-advance does not fire while the post-challenge action lock is active.

### Onboarding And Presentation

- The lobby shows a concise rules explainer by default for first-time visitors.
- A top room-bar rules button can reopen the explainer during lobby or play.
- The client UI should use phase-based navigation: entry cockpit, lobby seats/start state, bottom action tray during play, centered challenge/roulette overlays, and end-game actions after the winner reveal.
- Room status should be readable without extra side-rail navigation: compact room controls stay in the top bar, player name/voice/chamber status appears above 3D characters, and the voice dock plus latest-event ticker sit beside the table with expandable history.
- Gameplay events should trigger non-authoritative visual animation only; game legality and results remain server-owned.
- The cinematic scene should stage major beats through a client-only timeline runner with sequence, parallel, wait, tween, and cancellation behavior.
- Gun presentation must stay non-graphic while giving the result enough screen time to read clearly. The release runtime uses the generated in-repo realistic roulette-gun prop by default.
- Roulette animation should stay in a stable player/table view while staging a visible prop entrance, chamber spin-up, aim at the affected seat, suspense hold, trigger squeeze, dry puff or water stream/splash result, and distinct dry/water character reaction.
- Result-specific UI should remain concealed during roulette entrance, spin, aim, and trigger stages. The challenge panel, event log, eliminated styling, and winner banner should reveal the result only after the dry puff or water splash beat unlocks it.
- The 3D layer should load original generated GLB props for the bar room, table, cards, and release roulette-gun prop.
- The character presentation should keep eyes readable in the generated atlas and add small eye-glint overlays in-scene.
- Player seats should primarily use high-detail 2.5D illustrated character textures, with the older low-poly generated characters kept only as fallback.
- If the 3D assets fail to load, the game should remain playable with a fallback scene and DOM controls.

## Scope

### In Scope

- Online rooms with room codes.
- 2-4 real players.
- Static GitLab/GitDocs solo demo against three local bots.
- Host-created rooms.
- Reconnect token stored in browser local storage.
- In-memory state only.
- Private HTTPS deployment readiness for a single Node server.
- Peer-to-peer WebRTC room voice chat with Socket.IO signaling, mute/unmute controls, and speaking indicators.
- Server-side payload validation, action throttling, reconnect-token expiry/rotation, room caps, and idle cleanup.
- Server-authoritative rules and hidden-card protection.
- Playable noir-themed browser UI with persistent 3D table animation.
- Reproducible generated GLB prop assets committed with the client.
- Optional third-party Sketchfab `9 mm` importer remains available only for local visual experiments; it is not preferred by the release runtime.
- Original generated water stream, mist, and splash texture assets committed with the client.
- Original generated character atlas assets committed with the client, with visible eyes for all four gamblers.
- Animated dealing, selected cards, played cards, `LIAR` challenge, reveal, staged roulette-gun consequence, and win/loss states.
- Scene loading, quality profile, timeline, camera preset, character motion, card motion, and redacted scene snapshot markers for e2e validation.
- Rules onboarding before game start.
- Unit, integration, and e2e tests.
- Required challenge documentation.

### Solo Demo Scope

- Runs entirely in the browser from a static GitLab Pages/GitDocs build.
- Uses the shared game engine locally for rules, bot turns, challenge resolution, roulette, elimination, and winner detection.
- Does not use Socket.IO, room codes, reconnect, WebRTC voice, or a backend server.
- Intended for quick demo/review only; human-vs-human multiplayer still requires the Node server.

### Out Of Scope

- Networked AI opponents beyond the static solo demo.
- Pass-and-play mode.
- Accounts, login, database persistence, matchmaking, ranking, text chat, moderation, public matchmaking, or multi-server production hosting.
- Mobile-native app packaging.
- Video chat or external collaboration integrations.

## Functional Requirements

- A player can create a room with a display name.
- A player can start a solo demo directly from the entry screen without connecting to Socket.IO.
- A second, third, or fourth player can join with a room code.
- Only the host can start or restart a game.
- The server rejects games with fewer than two connected players.
- The server rejects malformed room, game, reconnect, and voice payloads with safe `game:error` messages.
- Create/join/reconnect/game/voice actions are rate-limited per socket, with global throttling on high-risk room entry actions.
- Reconnect tokens expire, rotate on successful reconnect, and clear on explicit leave.
- Each client receives only its own private hand.
- The public state shows player names, connection status, hand counts, chamber counts, table rank, pile count, current turn, previous play count, challenge result, and winner.
- The active player can select 1-3 cards and play them face down.
- The active player can call `LIAR` when a previous play exists.
- The selected cards visually lift before play.
- The table visually updates after a play and challenge with staged card, character, camera, and light motion.
- Challenge resolution shows revealed cards, liar-card marking, and a staged gun result with a suspense-first reveal gate and longer hit elimination beat.
- The roulette prop visibly aims at the resolving player's seat before firing.
- Every player shows six chamber indicators above the 3D character and during roulette focus. Spent chambers dim, remaining chambers glow, and the final known chamber pulses with a last-chamber warning.
- A challenge overlay may remain visible briefly for readability, but card selection and play controls stay locked until the authoritative post-challenge lock expires and the result panel has settled.
- Dry results show no splash/elimination visual; hit results show stream/splash visuals and an eliminated character state.
- Before the trigger resolves, the challenge panel and event log use neutral copy such as "Taking aim..." and do not display dry/water, eliminated, or winner outcomes.
- The cinematic scene loads and animates original GLB props plus 2.5D character rigs without exposing unrevealed private card IDs or ranks.
- The rules overlay can be opened and dismissed without changing game state.
- Invalid actions return a `game:error` message and do not mutate game state.
- The server automatically advances timed-out turns.
- The server rejects `game:playCards` and `game:callLiar` with `Challenge is resolving.` while the post-challenge action lock is active.
- Empty rooms are cleaned up after all players disconnect.
- Solo bots automatically play cards or call `LIAR` after a short delay and never expose bot hand contents through public state.
- A player can join voice chat after entering a room.
- Voice chat can be muted/unmuted per player.
- Voice chat shows remote peer diagnostics for connecting, speaker-linked, audio-playing, blocked, and silent states.
- Voice chat includes a speaker-test action and a click-to-enable-audio recovery action when browser autoplay blocks remote output.
- Voice peer discovery and WebRTC signaling are limited to current room members.
- Voice signaling contains no private card or game-state data.
- Online deployment uses explicit env config for `HOST`, `PORT`, `CLIENT_ORIGIN`, `VITE_SERVER_URL`, and optional `VITE_RTC_ICE_SERVERS`.

## Acceptance Criteria

- Two browser clients can create/join a room and complete a play/challenge/roulette cycle.
- Hidden card ranks are not visible in public room state.
- Lobby rules are visible before start and can be reopened from the room panel.
- The Three.js canvas renders nonblank desktop/mobile game-world visuals.
- The browser scene reports loaded GLB assets, character texture state, quality profile, active beat, active/completed timelines, camera preset, pile count, selected count, reveal count, card motion state, character motion states, roulette state, roulette display phase, result-unlock state, gun mesh names, roulette visual result, aimed player, dry puff, and water stream/splash visibility through a redacted test snapshot.
- Selected cards, pile updates, challenge overlay, staged roulette-gun result, and winner/loss states have visible feedback.
- Reduced-motion users receive shortened/faded motion rather than full cinematic movement.
- Unit tests cover deck composition, dealing, action validation, clockwise movement, post-challenge action lock, truthful and lying challenges, roulette, elimination, forced calls, result-label mapping, timeline labels, and redaction.
- Unit tests cover the sixth-shot roulette guarantee and chamber-indicator redaction behavior.
- Socket.IO integration tests cover create, join, start, private state, invalid payload errors, reconnect token rotation, CORS, same-room voice signaling, mute state broadcast, and cross-room voice rejection.
- Playwright e2e test covers a two-player browser flow plus rules onboarding, mocked WebRTC voice join/mute UI, receiving-audio diagnostics, speaker-test controls, 3D nameplates, chamber indicators, GLB asset readiness, textured character readiness, selected-card state, pile state, challenge panel, suspense concealment, result unlock timing, camera/character/card motion states, dry/water roulette visual branches, survivor controls after elimination, hidden-card ID redaction, scene snapshot redaction, and nonblank WebGL canvas.
- README includes setup/run instructions and a screenshot.
- `SPEC.md`, `ARCHITECTURE.md`, and `RETROSPECTIVE.md` reflect the actual implementation.
