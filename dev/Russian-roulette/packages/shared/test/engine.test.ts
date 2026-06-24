import { describe, expect, it } from "vitest";
import {
  autoAdvanceTurn,
  callLiar,
  createLiarDeck,
  GameRuleError,
  isForcedCall,
  playCards,
  startGame,
  toPrivatePlayerState,
  toPublicPlayers,
  toPublicGameState,
  type Card,
  type GameState,
  type RevolverCard,
  ROULETTE_CHAMBERS
} from "../src";

const players = [
  { id: "p1", name: "Mira" },
  { id: "p2", name: "Noah" }
];

const fixedContext = {
  rng: () => 0.42,
  now: () => 1_000
};

const card = (id: string, rank: Card["rank"]): Card => ({ id, rank });
const chamber = (id: string, kind: RevolverCard["kind"]): RevolverCard => ({ id, kind });

function preparedState(): GameState {
  const { state } = startGame(players, fixedContext);
  state.tableRank = "KING";
  state.currentTurnPlayerId = "p1";
  state.players[0].hand = [card("p1-king", "KING"), card("p1-queen", "QUEEN")];
  state.players[1].hand = [card("p2-ace", "ACE")];
  state.players[0].revolver = [chamber("p1-blank", "BLANK"), chamber("p1-lethal", "LETHAL")];
  state.players[1].revolver = [chamber("p2-blank", "BLANK"), chamber("p2-lethal", "LETHAL")];
  return state;
}

describe("Liar's roulette engine", () => {
  it("creates the expected liar deck composition", () => {
    const deck = createLiarDeck();
    expect(deck).toHaveLength(20);
    expect(deck.filter((candidate) => candidate.rank === "KING")).toHaveLength(6);
    expect(deck.filter((candidate) => candidate.rank === "QUEEN")).toHaveLength(6);
    expect(deck.filter((candidate) => candidate.rank === "ACE")).toHaveLength(6);
    expect(deck.filter((candidate) => candidate.rank === "JOKER")).toHaveLength(2);
  });

  it("starts a game by dealing private hands and redacting public state", () => {
    const { state } = startGame(players, fixedContext);

    expect(state.roundNumber).toBe(1);
    expect(state.players.every((player) => player.hand.length === 5)).toBe(true);
    expect(state.players.every((player) => player.revolver.length === ROULETTE_CHAMBERS)).toBe(true);

    const publicState = toPublicGameState(state);
    const privateState = toPrivatePlayerState(state, "p1");

    expect(publicState.pileCount).toBe(0);
    expect(publicState.previousPlay).toBeUndefined();
    expect(JSON.stringify(publicState)).not.toContain(privateState.hand[0].id);
    expect(privateState.hand).toHaveLength(5);
  });

  it("rejects out-of-turn and duplicate card actions", () => {
    const state = preparedState();

    expect(() => playCards(state, "p2", ["p2-ace"], fixedContext)).toThrow(GameRuleError);
    expect(() => playCards(state, "p1", ["p1-king", "p1-king"], fixedContext)).toThrow(GameRuleError);
  });

  it("auto-plays a random legal card when a turn times out", () => {
    const state = preparedState();
    const advanced = autoAdvanceTurn(state, { ...fixedContext, rng: () => 0.99 });

    expect(advanced.state.previousPlay?.playerId).toBe("p1");
    expect(advanced.state.previousPlay?.cards.map((playedCard) => playedCard.id)).toEqual(["p1-queen"]);
    expect(advanced.events[0].message).toContain("played 1 card");
  });

  it("sends the accused player to roulette when a liar card is revealed", () => {
    const state = preparedState();
    const played = playCards(state, "p1", ["p1-queen"], fixedContext);
    const challenged = callLiar(played.state, "p2", fixedContext);

    expect(played.events[0].animation).toMatchObject({
      kind: "play",
      playerId: "p1",
      cardCount: 1
    });
    expect(challenged.events.map((event) => event.animation?.kind)).toContain("challenge");
    expect(challenged.events.map((event) => event.animation?.kind)).toContain("roulette");
    expect(challenged.state.lastChallenge?.accusedId).toBe("p1");
    expect(challenged.state.lastChallenge?.liarCardIds).toEqual(["p1-queen"]);
    expect(challenged.state.lastChallenge?.roulettePlayerId).toBe("p1");
    expect(challenged.state.lastChallenge?.rouletteResult).toBe("BLANK");
    expect(challenged.state.players.find((player) => player.id === "p1")?.revolver).toHaveLength(1);
    expect(challenged.state.currentTurnPlayerId).toBe("p2");
    expect(challenged.events.find((event) => event.animation?.kind === "roulette")?.animation).toMatchObject({
      kind: "roulette",
      playerId: "p1",
      result: "BLANK",
      shotNumber: 5,
      remainingAfter: 1
    });
  });

  it("sends the caller to roulette when the accused player was truthful", () => {
    const state = preparedState();
    const played = playCards(state, "p1", ["p1-king"], fixedContext);
    const challenged = callLiar(played.state, "p2", fixedContext);

    expect(challenged.state.lastChallenge?.liarCardIds).toEqual([]);
    expect(challenged.state.lastChallenge?.roulettePlayerId).toBe("p2");
    expect(challenged.state.lastChallenge?.rouletteResult).toBe("BLANK");
  });

  it("eliminates a player and declares the final winner on lethal roulette", () => {
    const state = preparedState();
    state.players[0].revolver = [chamber("p1-lethal", "LETHAL")];

    const played = playCards(state, "p1", ["p1-queen"], fixedContext);
    const challenged = callLiar(played.state, "p2", fixedContext);

    expect(challenged.state.phase).toBe("gameOver");
    expect(challenged.state.winnerId).toBe("p2");
    expect(challenged.state.players.find((player) => player.id === "p1")?.eliminated).toBe(true);
  });

  it("keeps a 3-player game playing after lethal roulette eliminates one player", () => {
    const { state } = startGame(
      [
        ...players,
        { id: "p3", name: "Vale" }
      ],
      fixedContext
    );
    state.tableRank = "KING";
    state.currentTurnPlayerId = "p1";
    state.players[0].hand = [card("p1-queen", "QUEEN")];
    state.players[1].hand = [card("p2-king", "KING")];
    state.players[2].hand = [card("p3-ace", "ACE")];
    state.players[0].revolver = [chamber("p1-lethal", "LETHAL")];
    state.players[1].revolver = [chamber("p2-blank", "BLANK"), chamber("p2-lethal", "LETHAL")];
    state.players[2].revolver = [chamber("p3-blank", "BLANK"), chamber("p3-lethal", "LETHAL")];

    const played = playCards(state, "p1", ["p1-queen"], fixedContext);
    const challenged = callLiar(played.state, "p2", fixedContext);
    const eliminated = challenged.state.players.find((player) => player.id === "p1");
    const activeTurnPlayer = challenged.state.players.find((player) => player.id === challenged.state.currentTurnPlayerId);

    expect(challenged.state.phase).toBe("playing");
    expect(challenged.state.winnerId).toBeUndefined();
    expect(challenged.state.currentTurnPlayerId).toBe("p2");
    expect(eliminated?.eliminated).toBe(true);
    expect(eliminated?.hand).toHaveLength(0);
    expect(activeTurnPlayer?.eliminated).toBe(false);
    expect(challenged.state.currentTurnPlayerId).not.toBe("p1");
    expect(challenged.state.previousPlay).toBeUndefined();
    expect(challenged.state.pile).toHaveLength(0);
    expect(challenged.events.map((event) => event.animation?.kind)).toContain("round");
    expect(challenged.state.players.filter((player) => !player.eliminated).every((player) => player.hand.length === 5)).toBe(true);
  });

  it("moves turns clockwise and skips empty or eliminated seats", () => {
    const { state } = startGame(
      [
        { id: "p1", name: "P1" },
        { id: "p2", name: "P2" },
        { id: "p3", name: "P3" },
        { id: "p4", name: "P4" }
      ],
      fixedContext
    );
    state.tableRank = "KING";
    state.currentTurnPlayerId = "p1";
    state.players[0].hand = [card("p1-k", "KING")];
    state.players[1].hand = [card("p2-k", "KING")];
    state.players[2].hand = [card("p3-k", "KING")];
    state.players[3].hand = [card("p4-k", "KING")];

    const p1Played = playCards(state, "p1", ["p1-k"], fixedContext);
    expect(p1Played.state.currentTurnPlayerId).toBe("p2");

    p1Played.state.players[0].hand = [card("p1-extra", "KING")];
    p1Played.state.players[2].hand = [];
    p1Played.state.players[3].eliminated = true;
    const p2Played = playCards(p1Played.state, "p2", ["p2-k"], fixedContext);
    expect(p2Played.state.currentTurnPlayerId).toBe("p1");
  });

  it("starts the next round clockwise after the roulette player on a dry click", () => {
    const { state } = startGame(
      [
        { id: "p1", name: "P1" },
        { id: "p2", name: "P2" },
        { id: "p3", name: "P3" },
        { id: "p4", name: "P4" }
      ],
      fixedContext
    );
    state.tableRank = "KING";
    state.currentTurnPlayerId = "p1";
    state.players[0].hand = [card("p1-queen", "QUEEN")];
    state.players[1].hand = [card("p2-king", "KING")];
    state.players[2].hand = [card("p3-king", "KING")];
    state.players[3].hand = [card("p4-king", "KING")];
    state.players.forEach((player) => {
      player.revolver = [chamber(`${player.id}-blank`, "BLANK"), chamber(`${player.id}-lethal`, "LETHAL")];
    });

    const played = playCards(state, "p1", ["p1-queen"], fixedContext);
    const challenged = callLiar(played.state, "p2", fixedContext);

    expect(challenged.state.lastChallenge?.roulettePlayerId).toBe("p1");
    expect(challenged.state.lastChallenge?.rouletteResult).toBe("BLANK");
    expect(challenged.state.currentTurnPlayerId).toBe("p2");
    expect(challenged.state.roundNumber).toBe(2);
  });

  it("rejects manual and timer actions while a challenge is resolving", () => {
    const state = preparedState();
    state.actionsLockedUntil = 2_000;
    const lockedContext = { ...fixedContext, now: () => 1_500 };

    expect(() => playCards(state, "p1", ["p1-king"], lockedContext)).toThrow("Challenge is resolving.");
    expect(() => callLiar({ ...state, previousPlay: { id: "play-1", playerId: "p2", cards: [card("p2-a", "ACE")], turnNumber: 1 } }, "p1", lockedContext)).toThrow(
      "Challenge is resolving."
    );
    expect(() => autoAdvanceTurn(state, lockedContext)).toThrow("Challenge is resolving.");
    expect(() => toPublicGameState(state)).not.toThrow();
    expect(toPublicGameState(state).actionsLockedUntil).toBe(2_000);
  });

  it("guarantees the sixth roulette draw hits after five dry chambers are spent", () => {
    const state = preparedState();
    state.players[0].revolver = [chamber("p1-lethal", "LETHAL")];

    const played = playCards(state, "p1", ["p1-queen"], fixedContext);
    const challenged = callLiar(played.state, "p2", fixedContext);
    const rouletteEvent = challenged.events.find((event) => event.animation?.kind === "roulette");
    const publicPlayers = toPublicPlayers(challenged.state, [
      { id: "p1", connected: true, isHost: true },
      { id: "p2", connected: true, isHost: false }
    ]);
    const publicP1 = publicPlayers.find((player) => player.id === "p1");

    expect(challenged.state.lastChallenge?.rouletteResult).toBe("LETHAL");
    expect(rouletteEvent?.animation).toMatchObject({
      kind: "roulette",
      playerId: "p1",
      result: "LETHAL",
      shotNumber: 6,
      remainingAfter: 0
    });
    expect(publicP1).toMatchObject({
      revolverRemaining: 0,
      blanksSpent: 5,
      rouletteShotsTaken: 6,
      eliminated: true
    });
  });

  it("can force a roulette result for deterministic non-production validation", () => {
    const state = preparedState();
    state.players[0].revolver = [chamber("p1-lethal", "LETHAL"), chamber("p1-blank", "BLANK")];

    const played = playCards(state, "p1", ["p1-queen"], fixedContext);
    const challenged = callLiar(played.state, "p2", { ...fixedContext, forceRouletteResult: "BLANK" });
    const p1 = challenged.state.players.find((player) => player.id === "p1");

    expect(challenged.state.lastChallenge?.rouletteResult).toBe("BLANK");
    expect(p1?.revolver.map((rouletteCard) => rouletteCard.kind)).toEqual(["LETHAL"]);
  });

  it("forces the last card holder to call LIAR instead of playing", () => {
    const state = preparedState();
    state.players.push({
      id: "p3",
      name: "Vale",
      hand: [],
      revolver: [chamber("p3-blank", "BLANK")],
      eliminated: false
    });

    const played = playCards(state, "p1", ["p1-king", "p1-queen"], fixedContext);
    played.state.players.find((player) => player.id === "p1")!.hand = [];
    played.state.players.find((player) => player.id === "p2")!.hand = [card("p2-ace", "ACE")];
    played.state.currentTurnPlayerId = "p2";

    expect(isForcedCall(played.state)).toBe(true);
    expect(() => playCards(played.state, "p2", ["p2-ace"], fixedContext)).toThrow(GameRuleError);
  });
});
