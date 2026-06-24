import {
  CARD_RANKS,
  type Card,
  type ChallengeResult,
  type GameEvent,
  type GameEventAnimation,
  type GameState,
  type Player,
  type PlayerInput,
  type PrivatePlayerState,
  type PublicGameState,
  type PublicPlayer,
  type RevolverCard,
  type RouletteKind,
  type TableRank,
  ROULETTE_CHAMBERS,
  ROULETTE_DRY_CHAMBERS
} from "./types";

export const CARDS_PER_PLAYER = 5;
export const TURN_SECONDS = 30;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

export type RandomSource = () => number;

export interface EngineContext {
  rng?: RandomSource;
  now?: () => number;
  forceRouletteResult?: RouletteKind;
}

export interface EngineResult {
  state: GameState;
  events: GameEvent[];
}

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

const defaultContext = (context: EngineContext = {}) => ({
  rng: context.rng ?? Math.random,
  now: context.now ?? Date.now
});

export function createLiarDeck(): Card[] {
  const cards: Card[] = [];

  for (const rank of CARD_RANKS) {
    for (let index = 1; index <= 6; index += 1) {
      cards.push({ id: `${rank}-${index}`, rank });
    }
  }

  cards.push({ id: "JOKER-1", rank: "JOKER" });
  cards.push({ id: "JOKER-2", rank: "JOKER" });
  return cards;
}

export function createRevolverDeck(playerId: string, rng: RandomSource = Math.random): RevolverCard[] {
  const chambers: RevolverCard[] = [
    { id: `${playerId}-lethal`, kind: "LETHAL" },
    ...Array.from({ length: ROULETTE_DRY_CHAMBERS }, (_, index) => ({
      id: `${playerId}-blank-${index + 1}`,
      kind: "BLANK" as const
    }))
  ];

  return shuffle(chambers, rng);
}

export function startGame(players: PlayerInput[], context: EngineContext = {}): EngineResult {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameRuleError(`Game requires ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  }

  const ids = new Set(players.map((player) => player.id));
  if (ids.size !== players.length) {
    throw new GameRuleError("Player ids must be unique.");
  }

  const { rng, now } = defaultContext(context);
  const enginePlayers: Player[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    hand: [],
    revolver: createRevolverDeck(player.id, rng),
    eliminated: false
  }));

  const initial: GameState = {
    phase: "playing",
    players: enginePlayers,
    roundNumber: 0,
    turnNumber: 0,
    tableRank: pickTableRank(rng),
    currentTurnPlayerId: players[0]?.id,
    pile: [],
    turnStartedAt: now(),
    turnEndsAt: now() + TURN_SECONDS * 1000,
    eventSequence: 0
  };

  return startRound(initial, players[0].id, context);
}

export function playCards(
  state: GameState,
  playerId: string,
  cardIds: string[],
  context: EngineContext = {}
): EngineResult {
  const { now } = defaultContext(context);
  const actionNow = now();
  assertPlaying(state);
  assertActionsUnlocked(state, actionNow);
  assertCurrentTurn(state, playerId);

  if (isForcedCall(state)) {
    throw new GameRuleError("You must call LIAR because only one player still has cards.");
  }

  if (cardIds.length < 1 || cardIds.length > 3) {
    throw new GameRuleError("Play between 1 and 3 cards.");
  }

  if (new Set(cardIds).size !== cardIds.length) {
    throw new GameRuleError("Duplicate card selection.");
  }

  const next = cloneState(state);
  if (next.actionsLockedUntil && next.actionsLockedUntil <= actionNow) {
    next.actionsLockedUntil = undefined;
  }
  const player = requirePlayer(next, playerId);

  if (player.eliminated) {
    throw new GameRuleError("Eliminated players cannot act.");
  }

  const cards = cardIds.map((cardId) => {
    const card = player.hand.find((candidate) => candidate.id === cardId);
    if (!card) {
      throw new GameRuleError("Selected card is not in your hand.");
    }
    return card;
  });

  player.hand = player.hand.filter((card) => !cardIds.includes(card.id));
  next.turnNumber += 1;

  const playedSet = {
    id: `play-${next.turnNumber}`,
    playerId,
    cards,
    turnNumber: next.turnNumber
  };

  next.pile.push(playedSet);
  next.previousPlay = playedSet;
  setNextTurnAfterPlay(next, playerId, actionNow);

  const events = [
    createEvent(next, "play", `${player.name} played ${cards.length} card${cards.length === 1 ? "" : "s"} face down.`, actionNow, {
      kind: "play",
      playerId,
      cardCount: cards.length,
      turnNumber: next.turnNumber
    })
  ];
  return { state: next, events };
}

export function callLiar(state: GameState, callerId: string, context: EngineContext = {}): EngineResult {
  const { rng, now } = defaultContext(context);
  assertPlaying(state);
  assertActionsUnlocked(state, now());
  assertCurrentTurn(state, callerId);

  if (!state.previousPlay) {
    throw new GameRuleError("There is no previous play to challenge.");
  }

  const next = cloneState(state);
  const caller = requirePlayer(next, callerId);
  const previousPlay = next.previousPlay;
  if (!previousPlay) {
    throw new GameRuleError("There is no previous play to challenge.");
  }
  const accused = requirePlayer(next, previousPlay.playerId);

  if (caller.id === accused.id) {
    throw new GameRuleError("You cannot challenge your own play.");
  }

  const liarCards = previousPlay.cards.filter((card) => isLiarCard(card, next.tableRank));
  const roulettePlayer = liarCards.length > 0 ? accused : caller;
  const shotNumber = ROULETTE_CHAMBERS - roulettePlayer.revolver.length + 1;
  const rouletteResult = drawRoulette(roulettePlayer, context.forceRouletteResult);
  const remainingAfter = roulettePlayer.revolver.length;
  const eliminatedPlayerId = rouletteResult === "LETHAL" ? roulettePlayer.id : undefined;

  if (eliminatedPlayerId) {
    roulettePlayer.eliminated = true;
  }

  const challenge: ChallengeResult = {
    callerId: caller.id,
    accusedId: accused.id,
    revealedCards: previousPlay.cards,
    liarCardIds: liarCards.map((card) => card.id),
    roulettePlayerId: roulettePlayer.id,
    rouletteResult,
    eliminatedPlayerId
  };

  next.lastChallenge = challenge;

  const events: GameEvent[] = [
    createEvent(
      next,
      "challenge",
      `${caller.name} called LIAR on ${accused.name}. Revealed: ${formatCards(previousPlay.cards)}.`,
      now(),
      {
        kind: "challenge",
        callerId: caller.id,
        accusedId: accused.id,
        revealedCards: previousPlay.cards,
        liarCardIds: liarCards.map((card) => card.id)
      }
    ),
    createEvent(
      next,
      "roulette",
      `${roulettePlayer.name} got ${rouletteResult === "LETHAL" ? "hit" : "a dry click"}.`,
      now(),
      {
        kind: "roulette",
        playerId: roulettePlayer.id,
        result: rouletteResult,
        shotNumber,
        remainingAfter
      }
    )
  ];

  if (eliminatedPlayerId) {
    events.push(
      createEvent(next, "elimination", `${roulettePlayer.name} was eliminated.`, now(), {
        kind: "elimination",
        playerId: roulettePlayer.id
      })
    );
  }

  const winner = getWinner(next);
  if (winner) {
    next.phase = "gameOver";
    next.winnerId = winner.id;
    next.currentTurnPlayerId = undefined;
    next.turnStartedAt = now();
    next.turnEndsAt = now();
    events.push(
      createEvent(next, "winner", `${winner.name} wins the table.`, now(), {
        kind: "winner",
        playerId: winner.id
      })
    );
    return { state: next, events };
  }

  const firstPlayerId = getRoundStarterAfterRoulette(next, roulettePlayer.id);
  const roundResult = startRound(next, firstPlayerId, { rng, now });
  return { state: roundResult.state, events: [...events, ...roundResult.events] };
}

export function autoAdvanceTurn(state: GameState, context: EngineContext = {}): EngineResult {
  const { rng, now } = defaultContext(context);
  assertPlaying(state);
  assertActionsUnlocked(state, now());
  const current = state.currentTurnPlayerId;
  if (!current) {
    throw new GameRuleError("No active turn to advance.");
  }

  if (isForcedCall(state)) {
    return callLiar(state, current, context);
  }

  const player = requirePlayer(state, current);
  if (player.hand.length === 0) {
    throw new GameRuleError("Current player has no cards.");
  }
  const randomIndex = Math.min(player.hand.length - 1, Math.floor(rng() * player.hand.length));
  const autoCard = player.hand[randomIndex];

  return playCards(state, current, [autoCard.id], context);
}

export function toPublicGameState(state: GameState): PublicGameState {
  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    tableRank: state.tableRank,
    currentTurnPlayerId: state.currentTurnPlayerId,
    previousPlay: state.previousPlay
      ? {
          playerId: state.previousPlay.playerId,
          cardCount: state.previousPlay.cards.length,
          turnNumber: state.previousPlay.turnNumber
        }
      : undefined,
    pileCount: state.pile.reduce((total, play) => total + play.cards.length, 0),
    forcedCall: isForcedCall(state),
    activeCardHolderCount: getActiveCardHolders(state).length,
    turnStartedAt: state.turnStartedAt,
    turnEndsAt: state.turnEndsAt,
    actionsLockedUntil: state.actionsLockedUntil,
    lastChallenge: state.lastChallenge,
    winnerId: state.winnerId
  };
}

export function toPublicPlayers(
  state: GameState,
  roomPlayers: Array<{ id: string; connected: boolean; isHost: boolean }>
): PublicPlayer[] {
  return state.players.map((player) => {
    const roomPlayer = roomPlayers.find((candidate) => candidate.id === player.id);
    return {
      id: player.id,
      name: player.name,
      eliminated: player.eliminated,
      connected: roomPlayer?.connected ?? false,
      isHost: roomPlayer?.isHost ?? false,
      handCount: player.hand.length,
      revolverRemaining: player.revolver.length,
      blanksSpent: ROULETTE_DRY_CHAMBERS - player.revolver.filter((card) => card.kind === "BLANK").length,
      rouletteShotsTaken: ROULETTE_CHAMBERS - player.revolver.length
    };
  });
}

export function toPrivatePlayerState(state: GameState, playerId: string): PrivatePlayerState {
  const player = requirePlayer(state, playerId);
  return {
    playerId,
    hand: [...player.hand]
  };
}

export function isLiarCard(card: Card, tableRank: TableRank): boolean {
  return card.rank !== "JOKER" && card.rank !== tableRank;
}

export function isForcedCall(state: GameState): boolean {
  const activeHolders = getActiveCardHolders(state);
  return Boolean(
    state.previousPlay &&
      state.currentTurnPlayerId &&
      activeHolders.length === 1 &&
      activeHolders[0]?.id === state.currentTurnPlayerId
  );
}

export function getActiveCardHolders(state: GameState): Player[] {
  return state.players.filter((player) => !player.eliminated && player.hand.length > 0);
}

export function getWinner(state: GameState): Player | undefined {
  const activePlayers = state.players.filter((player) => !player.eliminated);
  return activePlayers.length === 1 ? activePlayers[0] : undefined;
}

function startRound(state: GameState, firstPlayerId: string, context: EngineContext = {}): EngineResult {
  const { rng, now } = defaultContext(context);
  const next = cloneState(state);
  const activePlayers = next.players.filter((player) => !player.eliminated);

  if (activePlayers.length < 2) {
    const winner = getWinner(next);
    next.phase = "gameOver";
    next.winnerId = winner?.id;
    next.currentTurnPlayerId = undefined;
    next.turnStartedAt = now();
    next.turnEndsAt = now();
    return {
      state: next,
      events: winner
        ? [
            createEvent(next, "winner", `${winner.name} wins the table.`, now(), {
              kind: "winner",
              playerId: winner.id
            })
          ]
        : []
    };
  }

  const deck = shuffle(createLiarDeck(), rng);
  const cardsNeeded = activePlayers.length * CARDS_PER_PLAYER;
  if (deck.length < cardsNeeded) {
    throw new GameRuleError("Not enough cards to deal this round.");
  }

  activePlayers.forEach((player, index) => {
    player.hand = deck.slice(index * CARDS_PER_PLAYER, (index + 1) * CARDS_PER_PLAYER);
  });

  next.players
    .filter((player) => player.eliminated)
    .forEach((player) => {
      player.hand = [];
    });

  next.phase = "playing";
  next.roundNumber += 1;
  next.turnNumber = 0;
  next.tableRank = pickTableRank(rng);
  next.pile = [];
  next.previousPlay = undefined;
  next.actionsLockedUntil = undefined;
  next.currentTurnPlayerId = activePlayers.some((player) => player.id === firstPlayerId)
    ? firstPlayerId
    : activePlayers[0]?.id;
  next.turnStartedAt = now();
  next.turnEndsAt = now() + TURN_SECONDS * 1000;

  return {
    state: next,
    events: [
      createEvent(next, "round", `Round ${next.roundNumber}: table card is ${formatRank(next.tableRank)}.`, now(), {
        kind: "round",
        roundNumber: next.roundNumber,
        tableRank: next.tableRank,
        playerIds: activePlayers.map((player) => player.id)
      })
    ]
  };
}

function drawRoulette(player: Player, forceResult?: RouletteKind): RouletteKind {
  const forcedIndex = forceResult ? player.revolver.findIndex((chamber) => chamber.kind === forceResult) : -1;
  const chamber = forcedIndex >= 0 ? player.revolver.splice(forcedIndex, 1)[0] : player.revolver.shift();
  if (!chamber) {
    throw new GameRuleError("No roulette chambers remain.");
  }
  return chamber.kind;
}

function setNextTurnAfterPlay(state: GameState, playerId: string, now: number) {
  const activeHolders = getActiveCardHolders(state);
  if (activeHolders.length === 1) {
    state.currentTurnPlayerId = activeHolders[0].id;
  } else {
    state.currentTurnPlayerId = nextPlayerWithCards(state, playerId)?.id;
  }

  state.turnStartedAt = now;
  state.turnEndsAt = now + TURN_SECONDS * 1000;
}

function nextPlayerWithCards(state: GameState, afterPlayerId: string): Player | undefined {
  const startIndex = state.players.findIndex((player) => player.id === afterPlayerId);
  if (startIndex === -1) {
    return undefined;
  }

  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(startIndex + offset) % state.players.length];
    if (!candidate.eliminated && candidate.hand.length > 0) {
      return candidate;
    }
  }

  return undefined;
}

function getRoundStarterAfterRoulette(state: GameState, roulettePlayerId: string): string {
  const nextActive = nextNonEliminatedPlayer(state, roulettePlayerId);
  if (!nextActive) {
    throw new GameRuleError("No active player can start the round.");
  }

  return nextActive.id;
}

function nextNonEliminatedPlayer(state: GameState, afterPlayerId: string): Player | undefined {
  const startIndex = state.players.findIndex((player) => player.id === afterPlayerId);
  if (startIndex === -1) {
    return state.players.find((player) => !player.eliminated);
  }

  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(startIndex + offset) % state.players.length];
    if (!candidate.eliminated) {
      return candidate;
    }
  }

  return undefined;
}

function assertPlaying(state: GameState) {
  if (state.phase !== "playing") {
    throw new GameRuleError("Game is not currently playing.");
  }
}

function assertActionsUnlocked(state: GameState, now: number) {
  if (state.actionsLockedUntil && state.actionsLockedUntil > now) {
    throw new GameRuleError("Challenge is resolving.");
  }
}

function assertCurrentTurn(state: GameState, playerId: string) {
  if (state.currentTurnPlayerId !== playerId) {
    throw new GameRuleError("It is not your turn.");
  }
}

function requirePlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new GameRuleError("Unknown player.");
  }
  return player;
}

function pickTableRank(rng: RandomSource): TableRank {
  return CARD_RANKS[Math.floor(rng() * CARD_RANKS.length)] ?? "KING";
}

function shuffle<T>(items: T[], rng: RandomSource): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.hand.map((card) => ({ ...card })),
      revolver: player.revolver.map((card) => ({ ...card }))
    })),
    pile: state.pile.map((play) => ({
      ...play,
      cards: play.cards.map((card) => ({ ...card }))
    })),
    previousPlay: state.previousPlay
      ? {
          ...state.previousPlay,
          cards: state.previousPlay.cards.map((card) => ({ ...card }))
        }
      : undefined,
    lastChallenge: state.lastChallenge
      ? {
          ...state.lastChallenge,
          revealedCards: state.lastChallenge.revealedCards.map((card) => ({ ...card })),
          liarCardIds: [...state.lastChallenge.liarCardIds]
        }
      : undefined
  };
}

function createEvent(
  state: GameState,
  kind: GameEvent["kind"],
  message: string,
  createdAt: number,
  animation?: GameEventAnimation
): GameEvent {
  state.eventSequence += 1;
  return {
    id: `event-${state.eventSequence}`,
    kind,
    message,
    createdAt,
    animation
  };
}

function formatCards(cards: Card[]): string {
  return cards.map((card) => formatRank(card.rank)).join(", ");
}

function formatRank(rank: Card["rank"]): string {
  if (rank === "JOKER") {
    return "Joker";
  }
  return rank.charAt(0) + rank.slice(1).toLowerCase();
}
