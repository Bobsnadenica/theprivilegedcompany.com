import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  autoAdvanceTurn,
  callLiar,
  GameRuleError,
  isForcedCall,
  playCards,
  startGame,
  toPrivatePlayerState,
  toPublicGameState,
  toPublicPlayers,
  type Card,
  type EngineResult,
  type GameEvent,
  type GameState,
  type PlayerInput,
  type RoomState
} from "@rrld/shared";

export const SOLO_HUMAN_ID = "human";
export const SOLO_BOT_IDS = ["bot-1", "bot-2", "bot-3"] as const;
export const SOLO_BOT_NAMES = ["Mira", "Viktor", "Nadia"] as const;

const SOLO_EVENT_LIMIT = 80;
const BOT_MIN_DELAY_MS = 1500;
const BOT_DELAY_SPREAD_MS = 1100;
const BOT_SPECTATOR_MIN_DELAY_MS = 2800;
const BOT_SPECTATOR_DELAY_SPREAD_MS = 1800;
const BOT_POST_CHALLENGE_DELAY_MS = 2600;
const BOT_FORCED_CALL_DELAY_MS = 900;
const SOLO_POST_CHALLENGE_ACTION_LOCK_MS = 6500;
const FAST_FORWARD_BOT_MIN_DELAY_MS = 420;
const FAST_FORWARD_BOT_DELAY_SPREAD_MS = 280;
const FAST_FORWARD_POST_CHALLENGE_DELAY_MS = 520;

export type SoloTurnPhase = "idle" | "humanTurn" | "botThinking" | "resolvingChallenge" | "spectating" | "gameOver";
export type SoloBotId = (typeof SOLO_BOT_IDS)[number];

export interface BotPersonality {
  id: SoloBotId;
  name: string;
  style: "cautious" | "aggressive" | "balanced";
  challengeBase: number;
  lowHandBonus: number;
  largeClaimBonus: number;
  twoCardChance: number;
  truthfulBias: number;
}

export interface SoloSchedulerState {
  phase: SoloTurnPhase;
  botId?: string;
  botName?: string;
  nextActionAt?: number;
  fastForward: boolean;
  blockedReason?: "actionLock" | "presentation" | "pageHidden";
}

export type SoloBotIntent = BotAction & {
  botId: string;
  botName: string;
  personality: BotPersonality["id"];
};

export const BOT_PERSONALITIES: Record<SoloBotId, BotPersonality> = {
  "bot-1": {
    id: "bot-1",
    name: "Mira",
    style: "cautious",
    challengeBase: 0.22,
    lowHandBonus: 0.16,
    largeClaimBonus: 0.08,
    twoCardChance: 0.24,
    truthfulBias: 0.9
  },
  "bot-2": {
    id: "bot-2",
    name: "Viktor",
    style: "aggressive",
    challengeBase: 0.44,
    lowHandBonus: 0.24,
    largeClaimBonus: 0.16,
    twoCardChance: 0.62,
    truthfulBias: 0.52
  },
  "bot-3": {
    id: "bot-3",
    name: "Nadia",
    style: "balanced",
    challengeBase: 0.32,
    lowHandBonus: 0.28,
    largeClaimBonus: 0.14,
    twoCardChance: 0.44,
    truthfulBias: 0.72
  }
};

export interface SoloSnapshot {
  gameState: GameState | null;
  room: RoomState | null;
  privateState: ReturnType<typeof toPrivatePlayerState> | null;
  events: GameEvent[];
  error: string | null;
}

export interface SoloController extends SoloSnapshot {
  scheduler: SoloSchedulerState;
  fastForward: boolean;
  start: (name?: string) => void;
  playSelectedCards: (cardIds: string[]) => boolean;
  callLiar: () => boolean;
  restart: () => void;
  exit: () => void;
  setFastForward: (enabled: boolean) => void;
  setPresentationLocked: (locked: boolean) => void;
  clearError: () => void;
}

export type BotAction = { type: "call" } | { type: "play"; cardIds: string[] };

export function useSoloGame(): SoloController {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(0);
  const [fastForward, setFastForward] = useState(false);
  const [presentationLocked, setPresentationLockedState] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => (typeof document === "undefined" ? true : document.visibilityState !== "hidden"));
  const [scheduler, setScheduler] = useState<SoloSchedulerState>({ phase: "idle", fastForward: false });
  const gameRef = useRef<GameState | null>(gameState);
  const humanNameRef = useRef("You");
  const sessionIdRef = useRef(sessionId);
  const fastForwardRef = useRef(fastForward);
  const presentationLockedRef = useRef(presentationLocked);
  const pageVisibleRef = useRef(pageVisible);

  useEffect(() => {
    gameRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    fastForwardRef.current = fastForward;
  }, [fastForward]);

  useEffect(() => {
    presentationLockedRef.current = presentationLocked;
  }, [presentationLocked]);

  useEffect(() => {
    pageVisibleRef.current = pageVisible;
  }, [pageVisible]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const handleVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const applyResult = useCallback((result: EngineResult) => {
    setGameState(result.state);
    setEvents((current) => [...current, ...result.events].slice(-SOLO_EVENT_LIMIT));
    setError(null);
  }, []);

  const start = useCallback(
    (name?: string) => {
      const displayName = sanitizeSoloName(name);
      humanNameRef.current = displayName;
      try {
        const result = startGame(createSoloPlayers(displayName));
        setSessionId((current) => current + 1);
        setGameState(result.state);
        setEvents(result.events);
        setError(null);
      } catch (caught) {
        setError(errorMessage(caught));
      }
    },
    []
  );

  const restart = useCallback(() => {
    start(humanNameRef.current);
  }, [start]);

  const exit = useCallback(() => {
    setGameState(null);
    setEvents([]);
    setError(null);
    setFastForward(false);
    setSessionId((current) => current + 1);
  }, []);

  const setPresentationLocked = useCallback((locked: boolean) => {
    setPresentationLockedState(locked);
  }, []);

  const playSelectedCards = useCallback(
    (cardIds: string[]) => {
      const current = gameRef.current;
      if (!current || current.currentTurnPlayerId !== SOLO_HUMAN_ID) {
        return false;
      }
      try {
        applyResult(playCards(current, SOLO_HUMAN_ID, cardIds));
        return true;
      } catch (caught) {
        setError(errorMessage(caught));
        return false;
      }
    },
    [applyResult]
  );

  const callLiarForHuman = useCallback(() => {
    const current = gameRef.current;
    if (!current || current.currentTurnPlayerId !== SOLO_HUMAN_ID) {
      return false;
    }
    try {
      applyResult(applySoloChallengeLock(callLiar(current, SOLO_HUMAN_ID)));
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    }
  }, [applyResult]);

  useEffect(() => {
    const now = Date.now();
    const phase = getSoloTurnPhase(gameState, presentationLocked, pageVisible, now);
    const botId = gameState?.currentTurnPlayerId;
    const bot = gameState?.players.find((player) => player.id === botId);
    const isBotTurn = Boolean(botId && botId !== SOLO_HUMAN_ID && isSoloBotId(botId));
    const actionLocked = Boolean(gameState?.actionsLockedUntil && gameState.actionsLockedUntil > now);

    if (!gameState || gameState.phase !== "playing") {
      setScheduler({ phase, fastForward });
      return;
    }

    if (!isBotTurn || !botId || !bot) {
      setScheduler({ phase, fastForward });
      return;
    }

    if (presentationLocked || actionLocked || !pageVisible) {
      setScheduler({
        phase,
        botId,
        botName: bot.name,
        fastForward,
        blockedReason: !pageVisible ? "pageHidden" : actionLocked ? "actionLock" : "presentation"
      });
      return;
    }

    const delay = getSoloBotDelayMs(gameState, Math.random, now, fastForward);
    const scheduledSessionId = sessionId;
    const nextActionAt = now + delay;
    setScheduler({ phase, botId, botName: bot.name, nextActionAt, fastForward });

    const timeout = window.setTimeout(() => {
      const current = gameRef.current;
      if (
        sessionIdRef.current !== scheduledSessionId ||
        presentationLockedRef.current ||
        !pageVisibleRef.current ||
        !current ||
        current.phase !== "playing" ||
        current.currentTurnPlayerId !== botId ||
        Boolean(current.actionsLockedUntil && current.actionsLockedUntil > Date.now())
      ) {
        return;
      }
      try {
        applyResult(applySoloChallengeLock(runBotTurn(current, botId)));
      } catch (caught) {
        setError(errorMessage(caught));
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [applyResult, fastForward, gameState, pageVisible, presentationLocked, sessionId]);

  useEffect(() => {
    if (!gameState || gameState.phase !== "playing" || gameState.currentTurnPlayerId !== SOLO_HUMAN_ID) {
      return;
    }

    const waitUntil = Math.max(gameState.turnEndsAt, gameState.actionsLockedUntil ?? 0);
    const delay = Math.max(50, waitUntil - Date.now());
    const timeout = window.setTimeout(() => {
      const current = gameRef.current;
      if (!current || presentationLockedRef.current || current.phase !== "playing" || current.currentTurnPlayerId !== SOLO_HUMAN_ID) {
        return;
      }
      try {
        applyResult(applySoloChallengeLock(autoAdvanceTurn(current)));
      } catch (caught) {
        setError(errorMessage(caught));
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [applyResult, gameState]);

  const room = useMemo(() => (gameState ? createSoloRoom(gameState, sessionId) : null), [gameState, sessionId]);
  const privateState = useMemo(() => (gameState ? toPrivatePlayerState(gameState, SOLO_HUMAN_ID) : null), [gameState]);

  return {
    gameState,
    room,
    privateState,
    events,
    error,
    scheduler,
    fastForward,
    start,
    playSelectedCards,
    callLiar: callLiarForHuman,
    restart,
    exit,
    setFastForward,
    setPresentationLocked,
    clearError: () => setError(null)
  };
}

export function createSoloPlayers(humanName = "You"): PlayerInput[] {
  return [
    { id: SOLO_HUMAN_ID, name: sanitizeSoloName(humanName) },
    ...SOLO_BOT_IDS.map((id, index) => ({ id, name: SOLO_BOT_NAMES[index] }))
  ];
}

export function createSoloRoom(state: GameState, sessionId = 0): RoomState {
  const roomPlayers = createSoloPlayers(state.players.find((player) => player.id === SOLO_HUMAN_ID)?.name ?? "You").map((player) => ({
    id: player.id,
    connected: true,
    isHost: player.id === SOLO_HUMAN_ID
  }));

  return {
    code: `SOLO-${sessionId}`,
    hostId: SOLO_HUMAN_ID,
    phase: state.phase,
    players: toPublicPlayers(state, roomPlayers),
    game: toPublicGameState(state),
    you: {
      playerId: SOLO_HUMAN_ID,
      reconnectToken: `solo-${sessionId}`
    }
  };
}

export function runBotTurn(state: GameState, botId: string, rng: () => number = Math.random): EngineResult {
  const action = chooseBotAction(state, botId, rng);
  if (action.type === "call") {
    return callLiar(state, botId);
  }
  return playCards(state, botId, action.cardIds);
}

export function getSoloBotDelayMs(state: GameState, rng: () => number = Math.random, now = Date.now(), fastForward = false): number {
  const human = state.players.find((player) => player.id === SOLO_HUMAN_ID);
  const humanIsSpectating = Boolean(human?.eliminated);
  const baseDelay = fastForward ? FAST_FORWARD_BOT_MIN_DELAY_MS : humanIsSpectating ? BOT_SPECTATOR_MIN_DELAY_MS : BOT_MIN_DELAY_MS;
  const spread = fastForward ? FAST_FORWARD_BOT_DELAY_SPREAD_MS : humanIsSpectating ? BOT_SPECTATOR_DELAY_SPREAD_MS : BOT_DELAY_SPREAD_MS;
  const postChallengeDelay = fastForward ? FAST_FORWARD_POST_CHALLENGE_DELAY_MS : BOT_POST_CHALLENGE_DELAY_MS;
  const lockedDelay = Math.max(0, (state.actionsLockedUntil ?? 0) - now + 120);
  const thinkingDelay =
    baseDelay +
    Math.round(rng() * spread) +
    (state.lastChallenge ? postChallengeDelay : 0) +
    (isForcedCall(state) ? BOT_FORCED_CALL_DELAY_MS : 0);

  return Math.max(thinkingDelay, lockedDelay);
}

export function getSoloTurnPhase(state: GameState | null, presentationLocked = false, pageVisible = true, now = Date.now()): SoloTurnPhase {
  if (!state) {
    return "idle";
  }
  if (state.phase === "gameOver") {
    return "gameOver";
  }
  if (presentationLocked || !pageVisible || Boolean(state.actionsLockedUntil && state.actionsLockedUntil > now)) {
    return "resolvingChallenge";
  }
  if (state.currentTurnPlayerId === SOLO_HUMAN_ID) {
    return "humanTurn";
  }
  const human = state.players.find((player) => player.id === SOLO_HUMAN_ID);
  return human?.eliminated ? "spectating" : "botThinking";
}

function applySoloChallengeLock(result: EngineResult): EngineResult {
  if (!result.state.lastChallenge || !result.events.some((event) => event.kind === "challenge")) {
    return result;
  }
  return {
    ...result,
    state: {
      ...result.state,
      actionsLockedUntil: Date.now() + SOLO_POST_CHALLENGE_ACTION_LOCK_MS
    }
  };
}

export function chooseBotAction(state: GameState, botId: string, rng: () => number = Math.random): BotAction {
  const bot = state.players.find((player) => player.id === botId);
  if (!bot) {
    throw new GameRuleError("Bot is not seated.");
  }
  const personality = isSoloBotId(botId) ? BOT_PERSONALITIES[botId] : BOT_PERSONALITIES["bot-3"];
  if (isForcedCall(state)) {
    return { type: "call" };
  }
  if (state.previousPlay) {
    const lowHandPressure = bot.hand.length <= 2 ? personality.lowHandBonus : 0;
    const largeClaimPressure = state.previousPlay.cards.length >= 2 ? personality.largeClaimBonus : 0;
    const challengeChance = Math.min(0.78, personality.challengeBase + lowHandPressure + largeClaimPressure);
    if (rng() < challengeChance) {
      return { type: "call" };
    }
  }

  const truthfulCards = bot.hand.filter((card) => isTruthfulForTable(card, state.tableRank));
  const shouldPreferTruth = truthfulCards.length > 0 && rng() < personality.truthfulBias;
  const source = shouldPreferTruth ? truthfulCards : bot.hand;
  const count = source.length >= 2 && rng() < personality.twoCardChance ? 2 : 1;
  return { type: "play", cardIds: source.slice(0, count).map((card) => card.id) };
}

function isSoloBotId(playerId: string): playerId is SoloBotId {
  return SOLO_BOT_IDS.includes(playerId as SoloBotId);
}

function isTruthfulForTable(card: Card, tableRank: GameState["tableRank"]) {
  return card.rank === "JOKER" || card.rank === tableRank;
}

function sanitizeSoloName(name?: string) {
  const trimmed = name?.trim();
  return trimmed ? trimmed.slice(0, 18) : "You";
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Solo demo action failed.";
}
