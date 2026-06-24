import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import type { GameEvent, PrivatePlayerState, RoomState, VoicePeerState } from "@rrld/shared";

const SERVER_PORT = 3101;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

let server: ChildProcessWithoutNullStreams;

beforeAll(async () => {
  server = spawn("npm", ["run", "serve:test", "--workspace", "@rrld/server"], {
    cwd: new URL("../../..", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      CLIENT_ORIGIN: "http://127.0.0.1:5173",
      E2E_FORCE_ROULETTE_RESULT: "BLANK",
      POST_CHALLENGE_ACTION_LOCK_MS: "300",
      POST_CHALLENGE_TURN_GRACE_MS: "2000"
    }
  });

  await waitForHealth();
}, 20_000);

afterAll(() => {
  server?.kill("SIGTERM");
});

describe("Socket.IO room flow", () => {
  it("creates, joins, starts, emits private state, and rejects invalid actions", async () => {
    const host = await connectSocket();
    const guest = await connectSocket();

    host.emit("room:create", { name: "Host" });
    const created = await waitForSocketEvent<RoomState>(host, "room:state", (state) => state.phase === "lobby");
    expect(created.code).toHaveLength(5);
    expect(created.you?.reconnectToken).toBeTruthy();

    guest.emit("room:join", { name: "Guest", roomCode: created.code });
    const joined = await waitForSocketEvent<RoomState>(host, "room:state", (state) => state.players.length === 2);
    expect(joined.players.map((player) => player.name)).toEqual(["Host", "Guest"]);

    const hostPrivatePromise = waitForSocketEvent<PrivatePlayerState>(host, "game:privateState", (state) => state.hand.length === 5);
    const guestPrivatePromise = waitForSocketEvent<PrivatePlayerState>(guest, "game:privateState", (state) => state.hand.length === 5);
    const logPromise = waitForSocketEvent<GameEvent[]>(host, "game:eventLog", (events) => events.some((event) => event.kind === "round"));

    host.emit("room:start", { roomCode: created.code });
    const hostPrivate = await hostPrivatePromise;
    const guestPrivate = await guestPrivatePromise;
    const log = await logPromise;

    expect(hostPrivate.hand.map((card) => card.id)).not.toEqual(guestPrivate.hand.map((card) => card.id));
    expect(log.length).toBeGreaterThan(0);

    guest.emit("game:playCards", { roomCode: created.code, cardIds: [guestPrivate.hand[0].id] });
    const error = await waitForSocketEvent<{ message: string }>(guest, "game:error", (payload) => payload.message.includes("turn"));
    expect(error.message).toBe("It is not your turn.");

    host.disconnect();
    guest.disconnect();
  }, 15_000);

  it("rotates reconnect tokens and rejects a reused token", async () => {
    const host = await connectSocket();

    host.emit("room:create", { name: "Reconnect Host" });
    const created = await waitForSocketEvent<RoomState>(host, "room:state", (state) => state.phase === "lobby");
    const playerId = created.you?.playerId;
    const firstToken = created.you?.reconnectToken;
    expect(playerId).toBeTruthy();
    expect(firstToken).toBeTruthy();

    host.disconnect();

    const reconnected = await connectSocket();
    reconnected.emit("room:reconnect", { roomCode: created.code, playerId, reconnectToken: firstToken });
    const resumed = await waitForSocketEvent<RoomState>(reconnected, "room:state", (state) => state.you?.playerId === playerId);
    expect(resumed.you?.reconnectToken).toBeTruthy();
    expect(resumed.you?.reconnectToken).not.toBe(firstToken);

    const stale = await connectSocket();
    stale.emit("room:reconnect", { roomCode: created.code, playerId, reconnectToken: firstToken });
    const error = await waitForSocketEvent<{ message: string }>(stale, "game:error", (payload) => payload.message.includes("Reconnect"));
    expect(error.message).toBe("Reconnect token was not accepted.");

    reconnected.disconnect();
    stale.disconnect();
  }, 15_000);

  it("locks gameplay actions while a LIAR challenge is resolving", async () => {
    const host = await connectSocket();
    const guest = await connectSocket();

    host.emit("room:create", { name: "Lock Host" });
    const created = await waitForSocketEvent<RoomState>(host, "room:state", (state) => state.phase === "lobby");
    const hostPlayerId = created.you?.playerId;
    expect(hostPlayerId).toBeTruthy();

    guest.emit("room:join", { name: "Lock Guest", roomCode: created.code });
    const joined = await waitForSocketEvent<RoomState>(guest, "room:state", (state) => state.players.length === 2);
    const guestPlayerId = joined.you?.playerId;
    expect(guestPlayerId).toBeTruthy();

    let latestHostPrivate: PrivatePlayerState | undefined;
    let latestGuestPrivate: PrivatePlayerState | undefined;
    host.on("game:privateState", (state: PrivatePlayerState) => {
      latestHostPrivate = state;
    });
    guest.on("game:privateState", (state: PrivatePlayerState) => {
      latestGuestPrivate = state;
    });

    const hostPrivatePromise = waitForSocketEvent<PrivatePlayerState>(host, "game:privateState", (state) => state.hand.length === 5);
    const guestPrivatePromise = waitForSocketEvent<PrivatePlayerState>(guest, "game:privateState", (state) => state.hand.length === 5);
    host.emit("room:start", { roomCode: created.code });
    const hostPrivate = await hostPrivatePromise;
    await guestPrivatePromise;

    host.emit("game:playCards", { roomCode: created.code, cardIds: [hostPrivate.hand[0].id] });
    await waitForSocketEvent<RoomState>(guest, "room:state", (state) => state.game?.currentTurnPlayerId === guestPlayerId && state.game.previousPlay?.playerId === hostPlayerId);

    guest.emit("game:callLiar", { roomCode: created.code });
    const lockedState = await waitForSocketEvent<RoomState>(
      guest,
      "room:state",
      (state) => Boolean(state.game?.lastChallenge && state.game.actionsLockedUntil && state.game.actionsLockedUntil > Date.now())
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(lockedState.game?.actionsLockedUntil).toBeGreaterThan(Date.now());

    const activePlayerId = lockedState.game?.currentTurnPlayerId;
    const activeSocket = activePlayerId === hostPlayerId ? host : guest;
    const activePrivate = activePlayerId === hostPlayerId ? latestHostPrivate : latestGuestPrivate;
    expect(activePrivate?.hand.length).toBeGreaterThan(0);

    const lockedErrorPromise = waitForSocketEvent<{ message: string }>(activeSocket, "game:error", (payload) => payload.message.includes("resolving"));
    activeSocket.emit("game:playCards", { roomCode: created.code, cardIds: [activePrivate!.hand[0].id] });
    const lockedError = await lockedErrorPromise;
    expect(lockedError.message).toBe("Challenge is resolving.");

    const waitForLockToExpire = Math.max(0, (lockedState.game?.actionsLockedUntil ?? Date.now()) - Date.now() + 120);
    await new Promise((resolve) => setTimeout(resolve, waitForLockToExpire));
    const playedAfterLockPromise = Promise.race([
      waitForSocketEvent<RoomState>(activeSocket, "room:state", (state) => Boolean(state.game && state.game.pileCount >= 1)).then((state) => ({ type: "state" as const, state })),
      waitForSocketEvent<{ message: string }>(activeSocket, "game:error").then((error) => ({ type: "error" as const, error }))
    ]);
    activeSocket.emit("game:playCards", { roomCode: created.code, cardIds: [activePrivate!.hand[0].id] });
    const playedAfterLock = await playedAfterLockPromise;
    expect(playedAfterLock.type, playedAfterLock.type === "error" ? playedAfterLock.error.message : undefined).toBe("state");
    if (playedAfterLock.type !== "state") {
      throw new Error(playedAfterLock.error.message);
    }
    expect(playedAfterLock.state.game?.actionsLockedUntil).toBeUndefined();

    host.disconnect();
    guest.disconnect();
  }, 15_000);

  it("validates payloads and keeps WebRTC voice signaling inside one room", async () => {
    const host = await connectSocket();
    const guest = await connectSocket();
    const outsider = await connectSocket();

    host.emit("room:create", { name: "Voice Host" });
    const created = await waitForSocketEvent<RoomState>(host, "room:state", (state) => state.phase === "lobby");
    const hostPlayerId = created.you?.playerId;
    expect(hostPlayerId).toBeTruthy();

    guest.emit("room:join", { name: "Voice Guest", roomCode: created.code });
    const guestJoined = await waitForSocketEvent<RoomState>(guest, "room:state", (state) => state.players.length === 2);
    const guestPlayerId = guestJoined.you?.playerId;
    expect(guestPlayerId).toBeTruthy();

    guest.emit("room:join", { name: "Bad Payload", roomCode: "???" });
    const invalidRoomCodeError = await waitForSocketEvent<{ message: string }>(guest, "game:error", (payload) => payload.message.includes("room code"));
    expect(invalidRoomCodeError.message).toBe("Invalid room code.");

    host.emit("voice:join", { roomCode: created.code });
    await waitForSocketEvent<{ peers: VoicePeerState[] }>(host, "voice:peers", (payload) => payload.peers.length === 1);
    guest.emit("voice:join", { roomCode: created.code });
    const hostPeers = await waitForSocketEvent<{ peers: VoicePeerState[] }>(host, "voice:peers", (payload) => payload.peers.length === 2);
    expect(hostPeers.peers.map((peer) => peer.playerId).sort()).toEqual([guestPlayerId, hostPlayerId].sort());

    const guestMutePromise = waitForSocketEvent<VoicePeerState>(guest, "voice:peerState", (peer) => peer.playerId === hostPlayerId && peer.muted);
    host.emit("voice:muteState", { roomCode: created.code, muted: true, speaking: true });
    const mutedPeer = await guestMutePromise;
    expect(mutedPeer.speaking).toBe(false);

    const guestSignalPromise = waitForSocketEvent<{ fromPlayerId: string; description?: { type: string; sdp?: string } }>(
      guest,
      "voice:signal",
      (message) => message.fromPlayerId === hostPlayerId
    );
    host.emit("voice:signal", {
      roomCode: created.code,
      toPlayerId: guestPlayerId,
      description: { type: "offer", sdp: "v=0\r\n" }
    });
    const signal = await guestSignalPromise;
    expect(signal.description?.type).toBe("offer");

    outsider.emit("room:create", { name: "Other Room" });
    const otherRoom = await waitForSocketEvent<RoomState>(outsider, "room:state", (state) => state.phase === "lobby");
    outsider.emit("voice:join", { roomCode: otherRoom.code });
    await waitForSocketEvent<{ peers: VoicePeerState[] }>(outsider, "voice:peers", (payload) => payload.peers.length === 1);
    outsider.emit("voice:signal", {
      roomCode: otherRoom.code,
      toPlayerId: guestPlayerId,
      description: { type: "offer", sdp: "v=0\r\n" }
    });
    const blocked = await waitForSocketEvent<{ message: string }>(outsider, "game:error", (payload) => payload.message.includes("Voice peer"));
    expect(blocked.message).toBe("Voice peer is not available.");

    host.disconnect();
    guest.disconnect();
    outsider.disconnect();
  }, 15_000);

  it("only emits CORS headers for configured origins", async () => {
    const allowed = await fetch(`${SERVER_URL}/health`, { headers: { Origin: "http://127.0.0.1:5173" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");

    const denied = await fetch(`${SERVER_URL}/health`, { headers: { Origin: "https://example.invalid" } });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});

async function connectSocket(): Promise<Socket> {
  const socket = io(SERVER_URL, { transports: ["websocket"] });
  await waitForSocketEvent(socket, "connect");
  return socket;
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SERVER_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server did not become healthy.");
}

function waitForSocketEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 8_000);

    const handler = (payload: T) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });
}
