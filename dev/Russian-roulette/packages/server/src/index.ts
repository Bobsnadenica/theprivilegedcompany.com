import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server, type Socket } from "socket.io";
import {
  autoAdvanceTurn,
  callLiar,
  GameRuleError,
  playCards,
  startGame,
  toPrivatePlayerState,
  toPublicGameState,
  toPublicPlayers,
  type GameEvent,
  type GameState,
  type LobbyPlayer,
  type RoomState,
  type RouletteKind,
  type VoiceIceCandidatePayload,
  type VoicePeerState,
  type VoiceSessionDescriptionPayload,
  type VoiceSignalPayload
} from "@rrld/shared";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const CLIENT_ORIGINS = parseOrigins(process.env.CLIENT_ORIGIN);
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5175", "http://127.0.0.1:5175", "http://127.0.0.1:5176"];
const ALLOWED_ORIGINS = Array.from(new Set([...(CLIENT_ORIGINS.length > 0 ? CLIENT_ORIGINS : ["http://localhost:5173"]), ...(IS_PRODUCTION ? [] : DEV_ORIGINS)]));
const EMPTY_ROOM_CLEANUP_MS = Number(process.env.EMPTY_ROOM_CLEANUP_MS ?? 5 * 60 * 1000);
const ROOM_IDLE_MS = Number(process.env.ROOM_IDLE_MS ?? 45 * 60 * 1000);
const RECONNECT_TOKEN_TTL_MS = Number(process.env.RECONNECT_TOKEN_TTL_MS ?? 30 * 60 * 1000);
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 250);
const MAX_LOG_EVENTS = 80;
const MAX_SOCKET_PAYLOAD_BYTES = 16 * 1024;
const POST_CHALLENGE_TURN_GRACE_MS = Number(process.env.POST_CHALLENGE_TURN_GRACE_MS ?? 18_000);
const POST_CHALLENGE_ACTION_LOCK_MS = Number(process.env.POST_CHALLENGE_ACTION_LOCK_MS ?? 6_500);
const E2E_FORCE_ROULETTE_RESULT = !IS_PRODUCTION ? parseRouletteKind(process.env.E2E_FORCE_ROULETTE_RESULT) : undefined;

if (IS_PRODUCTION && CLIENT_ORIGINS.length === 0) {
  throw new Error("CLIENT_ORIGIN must be set in production.");
}

interface RoomPlayer {
  id: string;
  name: string;
  reconnectToken: string;
  reconnectTokenExpiresAt: number;
  socketId?: string;
  connected: boolean;
  isHost: boolean;
}

interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  events: GameEvent[];
  voicePeers: Map<string, VoicePeerState>;
  lastActivityAt: number;
  game?: GameState;
  timer?: NodeJS.Timeout;
  cleanupTimer?: NodeJS.Timeout;
  idleTimer?: NodeJS.Timeout;
}

type ActionPayload = Record<string, unknown>;

interface RateBucket {
  count: number;
  resetAt: number;
}

const globalRateBuckets = new Map<string, RateBucket>();

const rooms = new Map<string, Room>();

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    }
  })
);
app.use(express.json({ limit: "4kb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/.*/, (_request, response, next) => {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  response.sendFile(path.join(clientDist, "index.html"));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
  cors: {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  socket.on("room:create", (rawPayload: unknown = {}) => {
    tryAction(socket, "room:create", () => {
      assertSocketRate(socket, "room:create", 5, 60_000);
      assertGlobalRate(socket, "room:create", 20, 60_000);
      if (rooms.size >= MAX_ROOMS) {
        throw new GameRuleError("Room capacity has been reached. Try again later.");
      }
      const payload = asPayload(rawPayload);
      const playerName = normalizeName(payload.name);
      const code = createRoomCode();
      const player = createRoomPlayer(playerName, true);
      const room: Room = {
        code,
        hostId: player.id,
        players: [player],
        events: [],
        voicePeers: new Map(),
        lastActivityAt: Date.now()
      };

      rooms.set(code, room);
      attachSocket(socket, room, player);
      scheduleIdleCleanup(room);
      emitRoom(room);
    });
  });

  socket.on("room:join", (rawPayload: unknown = {}) => {
    tryAction(socket, "room:join", () => {
      assertSocketRate(socket, "room:join", 8, 60_000);
      assertGlobalRate(socket, "room:join", 30, 60_000);
      const payload = asPayload(rawPayload);
      const room = requireRoom(payload.roomCode);
      if (room.game) {
        throw new GameRuleError("This room has already started.");
      }
      if (room.players.length >= 4) {
        throw new GameRuleError("Room is full.");
      }

      const player = createRoomPlayer(normalizeName(payload.name), false);
      room.players.push(player);
      attachSocket(socket, room, player);
      clearCleanup(room);
      touchRoom(room);
      emitRoom(room);
    });
  });

  socket.on("room:reconnect", (rawPayload: unknown = {}) => {
    tryAction(socket, "room:reconnect", () => {
      assertSocketRate(socket, "room:reconnect", 10, 60_000);
      assertGlobalRate(socket, "room:reconnect", 40, 60_000);
      const payload = asPayload(rawPayload);
      const room = requireRoom(payload.roomCode);
      const playerId = requireString(payload.playerId, "playerId", 80);
      const reconnectToken = requireString(payload.reconnectToken, "reconnectToken", 128);
      const player = room.players.find((candidate) => candidate.id === playerId);
      if (!player || player.reconnectToken !== reconnectToken || player.reconnectTokenExpiresAt < Date.now()) {
        throw new GameRuleError("Reconnect token was not accepted.");
      }

      rotateReconnectToken(player);
      attachSocket(socket, room, player);
      clearCleanup(room);
      touchRoom(room);
      emitRoom(room);
    });
  });

  socket.on("room:start", (rawPayload: unknown = {}) => {
    tryAction(socket, "room:start", () => {
      assertSocketRate(socket, "room:start", 10, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      requireHost(room, player);

      const connectedPlayers = room.players.filter((candidate) => candidate.connected);
      if (connectedPlayers.length < 2) {
        throw new GameRuleError("At least two connected players are required.");
      }
      if (connectedPlayers.length > 4) {
        throw new GameRuleError("A game supports up to four players.");
      }

      room.players = connectedPlayers.map((candidate, index) => ({
        ...candidate,
        isHost: index === 0
      }));
      room.hostId = room.players[0].id;
      const result = startGame(room.players.map(({ id, name }) => ({ id, name })));
      room.game = result.state;
      appendEvents(room, result.events);
      touchRoom(room);
      emitRoom(room);
      scheduleTurnTimer(room);
    });
  });

  socket.on("room:leave", (rawPayload: unknown = {}) => {
    tryAction(socket, "room:leave", () => {
      assertSocketRate(socket, "room:leave", 10, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      leaveRoom(socket, room, player, true);
    });
  });

  socket.on("game:playCards", (rawPayload: unknown = {}) => {
    tryAction(socket, "game:playCards", () => {
      assertSocketRate(socket, "game:playCards", 20, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      if (!room.game) {
        throw new GameRuleError("Game has not started.");
      }

      const result = playCards(room.game, player.id, validateCardIds(payload.cardIds));
      room.game = result.state;
      appendEvents(room, result.events);
      touchRoom(room);
      emitRoom(room);
      scheduleTurnTimer(room);
    });
  });

  socket.on("game:callLiar", (rawPayload: unknown = {}) => {
    tryAction(socket, "game:callLiar", () => {
      assertSocketRate(socket, "game:callLiar", 20, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      if (!room.game) {
        throw new GameRuleError("Game has not started.");
      }

      const result = callLiar(room.game, player.id, { forceRouletteResult: E2E_FORCE_ROULETTE_RESULT });
      room.game = result.state;
      applyPostChallengeTurnGrace(room.game);
      applyPostChallengeActionLock(room.game);
      appendEvents(room, result.events);
      touchRoom(room);
      emitRoom(room);
      scheduleTurnTimer(room);
    });
  });

  socket.on("game:restart", (rawPayload: unknown = {}) => {
    tryAction(socket, "game:restart", () => {
      assertSocketRate(socket, "game:restart", 6, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      requireHost(room, player);

      const connectedPlayers = room.players.filter((candidate) => candidate.connected);
      if (connectedPlayers.length < 2) {
        throw new GameRuleError("At least two connected players are required.");
      }

      const result = startGame(connectedPlayers.map(({ id, name }) => ({ id, name })));
      room.players = connectedPlayers;
      room.game = result.state;
      room.events = [];
      appendEvents(room, result.events);
      touchRoom(room);
      emitRoom(room);
      scheduleTurnTimer(room);
    });
  });

  socket.on("voice:join", (rawPayload: unknown = {}) => {
    tryAction(socket, "voice:join", () => {
      assertSocketRate(socket, "voice:join", 8, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      const peer = {
        playerId: player.id,
        muted: false,
        speaking: false,
        connected: true,
        updatedAt: Date.now()
      };
      room.voicePeers.set(player.id, peer);
      touchRoom(room);
      emitVoicePeers(room);
    });
  });

  socket.on("voice:leave", (rawPayload: unknown = {}) => {
    tryAction(socket, "voice:leave", () => {
      assertSocketRate(socket, "voice:leave", 8, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      removeVoicePeer(room, player.id);
      touchRoom(room);
    });
  });

  socket.on("voice:muteState", (rawPayload: unknown = {}) => {
    tryAction(socket, "voice:muteState", () => {
      assertSocketRate(socket, "voice:muteState", 30, 10_000);
      const payload = asPayload(rawPayload);
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      const peer = room.voicePeers.get(player.id);
      if (!peer) {
        throw new GameRuleError("Join voice before changing voice state.");
      }
      const muted = requireBoolean(payload.muted, "muted");
      const speaking = payload.speaking === undefined ? peer.speaking : requireBoolean(payload.speaking, "speaking");
      const updated = { ...peer, muted, speaking: muted ? false : speaking, updatedAt: Date.now() };
      room.voicePeers.set(player.id, updated);
      touchRoom(room);
      io.to(room.code).emit("voice:peerState", updated);
    });
  });

  socket.on("voice:signal", (rawPayload: unknown = {}) => {
    tryAction(socket, "voice:signal", () => {
      assertSocketRate(socket, "voice:signal", 120, 10_000);
      const payload = validateVoiceSignal(asPayload(rawPayload));
      const { room, player } = requirePlayerForAction(socket, payload.roomCode);
      const target = room.players.find((candidate) => candidate.id === payload.toPlayerId);
      if (!target?.socketId || !room.voicePeers.has(player.id) || !room.voicePeers.has(target.id)) {
        throw new GameRuleError("Voice peer is not available.");
      }
      io.to(target.socketId).emit("voice:signal", {
        fromPlayerId: player.id,
        description: payload.description,
        candidate: payload.candidate
      });
    });
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!roomCode || !playerId) {
      return;
    }

    const room = rooms.get(roomCode);
    const player = room?.players.find((candidate) => candidate.id === playerId);
    if (!room || !player) {
      return;
    }

    leaveRoom(socket, room, player, false);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Russian Roulette Liar's Deck server listening on http://${HOST}:${PORT}`);
});

function tryAction(socket: Socket, actionName: string, action: () => void) {
  try {
    action();
  } catch (error) {
    const message = error instanceof GameRuleError ? error.message : IS_PRODUCTION ? "Action could not be completed." : error instanceof Error ? error.message : "Unexpected server error.";
    if (!IS_PRODUCTION && !(error instanceof GameRuleError)) {
      console.error(`Socket action failed: ${actionName}`, error);
    }
    socket.emit("game:error", { message });
  }
}

function normalizeName(name?: unknown): string {
  const normalized = requireString(name, "name", 32).replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new GameRuleError("Enter a player name.");
  }
  if (/[\p{C}]/u.test(normalized)) {
    throw new GameRuleError("Player name contains unsupported characters.");
  }
  return normalized.slice(0, 18);
}

function createRoomPlayer(name: string, isHost: boolean): RoomPlayer {
  const token = createReconnectToken();
  return {
    id: randomUUID(),
    name,
    reconnectToken: token.value,
    reconnectTokenExpiresAt: token.expiresAt,
    connected: true,
    isHost
  };
}

function createRoomCode(): string {
  let code = "";
  do {
    code = randomBytes(4).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, 5).toUpperCase();
  } while (!code || rooms.has(code));
  return code.padEnd(5, "X");
}

function attachSocket(socket: Socket, room: Room, player: RoomPlayer) {
  player.connected = true;
  player.socketId = socket.id;
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}

function leaveRoom(socket: Socket, room: Room, player: RoomPlayer, explicitLeave: boolean) {
  player.connected = false;
  player.socketId = undefined;
  removeVoicePeer(room, player.id);
  socket.leave(room.code);
  socket.data.roomCode = undefined;
  socket.data.playerId = undefined;

  if (explicitLeave && !room.game) {
    clearReconnectToken(player);
    room.players = room.players.filter((candidate) => candidate.id !== player.id);
  } else if (explicitLeave) {
    clearReconnectToken(player);
  }

  if (room.players.length === 0) {
    closeRoom(room);
    return;
  }

  if (player.isHost && !room.players.some((candidate) => candidate.isHost && candidate.connected)) {
    const nextHost = room.players.find((candidate) => candidate.connected) ?? room.players[0];
    room.players.forEach((candidate) => {
      candidate.isHost = candidate.id === nextHost.id;
    });
    room.hostId = nextHost.id;
  }

  if (!room.players.some((candidate) => candidate.connected)) {
    scheduleCleanup(room);
  }

  touchRoom(room);
  emitRoom(room);
}

function requireRoom(roomCode?: unknown): Room {
  const code = normalizeRoomCode(roomCode);
  const room = code ? rooms.get(code) : undefined;
  if (!room) {
    throw new GameRuleError("Room not found.");
  }
  return room;
}

function requirePlayerForAction(socket: Socket, roomCode?: unknown) {
  const room = requireRoom(roomCode ?? (socket.data.roomCode as string | undefined));
  const playerId = socket.data.playerId as string | undefined;
  const player = room.players.find((candidate) => candidate.id === playerId && candidate.socketId === socket.id);
  if (!player) {
    throw new GameRuleError("You are not joined to this room.");
  }
  return { room, player };
}

function requireHost(room: Room, player: RoomPlayer) {
  if (room.hostId !== player.id) {
    throw new GameRuleError("Only the host can do that.");
  }
}

function appendEvents(room: Room, events: GameEvent[]) {
  room.events.push(...events);
  if (room.events.length > MAX_LOG_EVENTS) {
    room.events = room.events.slice(-MAX_LOG_EVENTS);
  }
}

function emitRoom(room: Room) {
  const stateForRoom = buildRoomState(room);
  room.players.forEach((player) => {
    if (!player.socketId) {
      return;
    }

    const payload: RoomState = {
      ...stateForRoom,
      you: {
        playerId: player.id,
        reconnectToken: player.reconnectToken
      }
    };

    io.to(player.socketId).emit("room:state", payload);

    if (room.game) {
      io.to(player.socketId).emit("game:privateState", toPrivatePlayerState(room.game, player.id));
    }

    io.to(player.socketId).emit("game:eventLog", room.events);
  });
}

function buildRoomState(room: Room): RoomState {
  if (!room.game) {
    const players: LobbyPlayer[] = room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      isHost: player.isHost
    }));

    return {
      code: room.code,
      hostId: room.hostId,
      phase: "lobby",
      players
    };
  }

  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.game.phase,
    players: toPublicPlayers(room.game, room.players),
    game: toPublicGameState(room.game)
  };
}

function scheduleTurnTimer(room: Room) {
  if (room.timer) {
    clearTimeout(room.timer);
  }

  if (!room.game || room.game.phase !== "playing") {
    return;
  }

  const delayUntil = Math.max(room.game.turnEndsAt, room.game.actionsLockedUntil ?? 0);
  const delay = Math.max(50, delayUntil - Date.now());
  room.timer = setTimeout(() => {
    try {
      if (!room.game || room.game.phase !== "playing") {
        return;
      }
      if (isGameActionLocked(room.game)) {
        scheduleTurnTimer(room);
        return;
      }
      const result = autoAdvanceTurn(room.game);
      room.game = result.state;
      appendEvents(room, [
        {
          id: `auto-${Date.now()}`,
          kind: "system",
          message: "Turn timer expired; the server advanced the turn.",
          createdAt: Date.now()
        },
        ...result.events
      ]);
      emitRoom(room);
      scheduleTurnTimer(room);
    } catch (error) {
      appendEvents(room, [
        {
          id: `auto-error-${Date.now()}`,
          kind: "system",
          message: error instanceof Error ? error.message : "Timer could not advance the turn.",
          createdAt: Date.now()
        }
      ]);
      emitRoom(room);
    }
  }, delay);
}

function applyPostChallengeTurnGrace(game: GameState) {
  if (game.phase !== "playing" || !game.currentTurnPlayerId || POST_CHALLENGE_TURN_GRACE_MS <= 0) {
    return;
  }
  game.turnStartedAt += POST_CHALLENGE_TURN_GRACE_MS;
  game.turnEndsAt += POST_CHALLENGE_TURN_GRACE_MS;
}

function applyPostChallengeActionLock(game: GameState) {
  if (!game.lastChallenge || POST_CHALLENGE_ACTION_LOCK_MS <= 0) {
    game.actionsLockedUntil = undefined;
    return;
  }
  game.actionsLockedUntil = Date.now() + POST_CHALLENGE_ACTION_LOCK_MS;
}

function isGameActionLocked(game: GameState) {
  return Boolean(game.actionsLockedUntil && game.actionsLockedUntil > Date.now());
}

function scheduleCleanup(room: Room) {
  clearCleanup(room);
  room.cleanupTimer = setTimeout(() => closeRoom(room), EMPTY_ROOM_CLEANUP_MS);
}

function clearCleanup(room: Room) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = undefined;
  }
}

function closeRoom(room: Room) {
  if (room.timer) {
    clearTimeout(room.timer);
  }
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
  }
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
  }
  io.to(room.code).emit("room:closed", { roomCode: room.code });
  rooms.delete(room.code);
}

function parseOrigins(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseRouletteKind(value?: string): RouletteKind | undefined {
  return value === "BLANK" || value === "LETHAL" ? value : undefined;
}

function isAllowedOrigin(origin?: string) {
  if (!origin) {
    return !IS_PRODUCTION;
  }
  return ALLOWED_ORIGINS.includes(origin);
}

function securityHeaders(_request: express.Request, response: express.Response, next: express.NextFunction) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  if (IS_PRODUCTION) {
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:"
    );
  }
  next();
}

function asPayload(value: unknown): ActionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as ActionPayload;
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new GameRuleError(`Invalid ${field}.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new GameRuleError(`Invalid ${field}.`);
  }
  return trimmed;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new GameRuleError(`Invalid ${field}.`);
  }
  return value;
}

function normalizeRoomCode(roomCode?: unknown): string | undefined {
  if (roomCode === undefined) {
    return undefined;
  }
  const code = requireString(roomCode, "room code", 8).toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    throw new GameRuleError("Invalid room code.");
  }
  return code;
}

function validateCardIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new GameRuleError("Play between 1 and 3 cards.");
  }
  const cardIds = value.map((candidate) => requireString(candidate, "card id", 40));
  if (new Set(cardIds).size !== cardIds.length || cardIds.some((id) => !/^[A-Z0-9_-]+$/i.test(id))) {
    throw new GameRuleError("Invalid card selection.");
  }
  return cardIds;
}

function validateVoiceSignal(payload: ActionPayload): VoiceSignalPayload {
  const roomCode = normalizeRoomCode(payload.roomCode);
  if (!roomCode) {
    throw new GameRuleError("Invalid room code.");
  }
  const toPlayerId = requireString(payload.toPlayerId, "voice peer", 80);
  const description = payload.description === undefined ? undefined : validateDescription(payload.description);
  const candidate = payload.candidate === undefined ? undefined : validateCandidate(payload.candidate);
  if (!description && !candidate) {
    throw new GameRuleError("Voice signal is empty.");
  }
  return { roomCode, toPlayerId, description, candidate };
}

function validateDescription(value: unknown): VoiceSessionDescriptionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GameRuleError("Invalid voice description.");
  }
  const record = value as Record<string, unknown>;
  const type = requireString(record.type, "voice description type", 16);
  if (!["offer", "answer", "pranswer", "rollback"].includes(type)) {
    throw new GameRuleError("Invalid voice description type.");
  }
  const sdp = record.sdp === undefined ? undefined : requireString(record.sdp, "voice description sdp", 12_000);
  return { type: type as VoiceSessionDescriptionPayload["type"], sdp };
}

function validateCandidate(value: unknown): VoiceIceCandidatePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GameRuleError("Invalid voice candidate.");
  }
  const record = value as Record<string, unknown>;
  const candidate = record.candidate === undefined ? undefined : requireString(record.candidate, "voice candidate", 4_000);
  const sdpMid = record.sdpMid === null || record.sdpMid === undefined ? null : requireString(record.sdpMid, "voice candidate mid", 80);
  const sdpMLineIndex = record.sdpMLineIndex === null || record.sdpMLineIndex === undefined ? null : Number(record.sdpMLineIndex);
  if (sdpMLineIndex !== null && (!Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 64)) {
    throw new GameRuleError("Invalid voice candidate line.");
  }
  const usernameFragment = record.usernameFragment === null || record.usernameFragment === undefined ? null : requireString(record.usernameFragment, "voice candidate user", 128);
  return { candidate, sdpMid, sdpMLineIndex, usernameFragment };
}

function createReconnectToken() {
  return {
    value: randomBytes(16).toString("hex"),
    expiresAt: Date.now() + RECONNECT_TOKEN_TTL_MS
  };
}

function rotateReconnectToken(player: RoomPlayer) {
  const token = createReconnectToken();
  player.reconnectToken = token.value;
  player.reconnectTokenExpiresAt = token.expiresAt;
}

function clearReconnectToken(player: RoomPlayer) {
  player.reconnectToken = "";
  player.reconnectTokenExpiresAt = 0;
}

function touchRoom(room: Room) {
  room.lastActivityAt = Date.now();
  scheduleIdleCleanup(room);
}

function scheduleIdleCleanup(room: Room) {
  if (room.idleTimer) {
    clearTimeout(room.idleTimer);
  }
  room.idleTimer = setTimeout(() => {
    const idleFor = Date.now() - room.lastActivityAt;
    const hasConnectedPlayers = room.players.some((player) => player.connected);
    if (!hasConnectedPlayers || (!room.game && idleFor >= ROOM_IDLE_MS)) {
      closeRoom(room);
      return;
    }
    scheduleIdleCleanup(room);
  }, ROOM_IDLE_MS);
}

function removeVoicePeer(room: Room, playerId: string) {
  if (!room.voicePeers.delete(playerId)) {
    return;
  }
  io.to(room.code).emit("voice:peerState", {
    playerId,
    muted: true,
    speaking: false,
    connected: false,
    updatedAt: Date.now()
  } satisfies VoicePeerState);
  emitVoicePeers(room);
}

function emitVoicePeers(room: Room) {
  io.to(room.code).emit("voice:peers", { peers: Array.from(room.voicePeers.values()) });
}

function assertSocketRate(socket: Socket, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const buckets = ((socket.data.rateBuckets as Map<string, RateBucket> | undefined) ?? new Map<string, RateBucket>()) as Map<string, RateBucket>;
  socket.data.rateBuckets = buckets;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new GameRuleError("Too many requests. Slow down.");
  }
}

function assertGlobalRate(socket: Socket, key: string, limit: number, windowMs: number) {
  const identity = `${socket.handshake.address}:${key}`;
  const now = Date.now();
  const bucket = globalRateBuckets.get(identity);
  if (!bucket || bucket.resetAt <= now) {
    globalRateBuckets.set(identity, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new GameRuleError("Too many requests. Slow down.");
  }
}
