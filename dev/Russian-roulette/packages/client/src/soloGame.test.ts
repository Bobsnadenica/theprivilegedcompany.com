import { describe, expect, it } from "vitest";
import { playCards, startGame } from "@rrld/shared";
import {
  BOT_PERSONALITIES,
  chooseBotAction,
  createSoloPlayers,
  createSoloRoom,
  getSoloBotDelayMs,
  getSoloTurnPhase,
  runBotTurn,
  SOLO_BOT_IDS,
  SOLO_HUMAN_ID
} from "./soloGame";

describe("solo bot demo helpers", () => {
  it("starts one human with three named bot opponents", () => {
    const players = createSoloPlayers("Dimitar");

    expect(players).toEqual([
      { id: SOLO_HUMAN_ID, name: "Dimitar" },
      { id: "bot-1", name: "Mira" },
      { id: "bot-2", name: "Viktor" },
      { id: "bot-3", name: "Nadia" }
    ]);
  });

  it("creates a public solo room without exposing bot hands", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));
    const room = createSoloRoom(state, 3);

    expect(room.code).toBe("SOLO-3");
    expect(room.hostId).toBe(SOLO_HUMAN_ID);
    expect(room.you?.playerId).toBe(SOLO_HUMAN_ID);
    expect(room.game?.phase).toBe("playing");
    expect(room.players).toHaveLength(4);
    expect(room.players.every((player) => typeof player.handCount === "number")).toBe(true);
    expect(JSON.stringify(room)).not.toContain("KING-");
    expect(JSON.stringify(room)).not.toContain("QUEEN-");
    expect(JSON.stringify(room)).not.toContain("ACE-");
  });

  it("forces bots to call LIAR when the engine says a challenge is required", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));
    const humanCards = state.players.find((player) => player.id === SOLO_HUMAN_ID)!.hand.slice(0, 1).map((card) => card.id);
    const afterHumanPlay = playCards(state, SOLO_HUMAN_ID, humanCards).state;
    afterHumanPlay.players
      .filter((player) => player.id !== SOLO_BOT_IDS[0])
      .forEach((player) => {
        player.hand = [];
      });

    expect(afterHumanPlay.currentTurnPlayerId).toBe(SOLO_BOT_IDS[0]);
    expect(chooseBotAction(afterHumanPlay, SOLO_BOT_IDS[0], () => 0.99)).toEqual({ type: "call" });
  });

  it("lets bots play cards locally without a socket server", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));
    const firstHumanCard = state.players.find((player) => player.id === SOLO_HUMAN_ID)!.hand[0]!.id;
    const afterHumanPlay = playCards(state, SOLO_HUMAN_ID, [firstHumanCard]).state;
    const result = runBotTurn(afterHumanPlay, afterHumanPlay.currentTurnPlayerId!, () => 0.99);

    expect(result.state.turnNumber).toBeGreaterThan(afterHumanPlay.turnNumber);
    expect(result.events.some((event) => event.kind === "play")).toBe(true);
  });

  it("uses distinct bot personalities when choosing challenges", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));
    const firstHumanCard = state.players.find((player) => player.id === SOLO_HUMAN_ID)!.hand[0]!.id;
    const afterHumanPlay = playCards(state, SOLO_HUMAN_ID, [firstHumanCard]).state;

    expect(BOT_PERSONALITIES["bot-1"].style).toBe("cautious");
    expect(BOT_PERSONALITIES["bot-2"].style).toBe("aggressive");
    expect(chooseBotAction(afterHumanPlay, "bot-1", () => 0.3).type).toBe("play");
    expect(chooseBotAction(afterHumanPlay, "bot-2", () => 0.3)).toEqual({ type: "call" });
  });

  it("slows bot turns when the human is only spectating", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));
    const normalDelay = getSoloBotDelayMs(state, () => 0, 1_000);
    state.players.find((player) => player.id === SOLO_HUMAN_ID)!.eliminated = true;

    expect(getSoloBotDelayMs(state, () => 0, 1_000)).toBeGreaterThan(normalDelay);
  });

  it("never lets solo bots move before a roulette lock expires", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));
    state.actionsLockedUntil = 8_000;

    expect(getSoloBotDelayMs(state, () => 0, 1_000)).toBeGreaterThanOrEqual(7_120);
  });

  it("reports solo scheduler phases for human, bot, challenge, spectator, and game over states", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));

    expect(getSoloTurnPhase(state, false, true, 1_000)).toBe("humanTurn");
    expect(getSoloTurnPhase(state, true, true, 1_000)).toBe("resolvingChallenge");

    const firstHumanCard = state.players.find((player) => player.id === SOLO_HUMAN_ID)!.hand[0]!.id;
    const botTurn = playCards(state, SOLO_HUMAN_ID, [firstHumanCard]).state;
    expect(getSoloTurnPhase(botTurn, false, true, 1_000)).toBe("botThinking");

    botTurn.players.find((player) => player.id === SOLO_HUMAN_ID)!.eliminated = true;
    expect(getSoloTurnPhase(botTurn, false, true, 1_000)).toBe("spectating");

    botTurn.phase = "gameOver";
    expect(getSoloTurnPhase(botTurn, false, true, 1_000)).toBe("gameOver");
  });

  it("shortens bot delays only when fast forward is enabled", () => {
    const { state } = startGame(createSoloPlayers("Solo Player"));
    state.players.find((player) => player.id === SOLO_HUMAN_ID)!.eliminated = true;

    const normalDelay = getSoloBotDelayMs(state, () => 0, 1_000);
    const fastDelay = getSoloBotDelayMs(state, () => 0, 1_000, true);

    expect(fastDelay).toBeLessThan(normalDelay);
    expect(fastDelay).toBeGreaterThanOrEqual(420);
  });
});
