import { ROULETTE_CHAMBERS, type Card, type GameEvent, type PublicPlayer, type RoomState, type RouletteKind } from "@rrld/shared";

export type RouletteSceneState = "idle" | "entering" | "spinning" | "aiming" | "trigger" | "dryFire" | "waterShot" | "splash" | "blank" | "lethal";
export type RouletteVisualResult = "dry" | "water";
export type RouletteDisplayPhase = "hidden" | "spinning" | "aiming" | "triggering" | "revealed";
export type ChamberDotState = "spent" | "remaining" | "last" | "eliminated";

export interface RouletteSpoilerState {
  challengeKey?: string;
  displayPhase: RouletteDisplayPhase;
  resultUiUnlocked: boolean;
}

export type ChallengeState = NonNullable<NonNullable<RoomState["game"]>["lastChallenge"]>;

export type CinematicAssetId = "bar-room" | "card-table" | "playing-card" | "characters" | "toy-roulette";

export type CinematicQualityProfile = "desktop" | "mobile" | "reduced-motion";

export type CharacterAssetId = "host" | "challenger" | "watcher" | "wildcard";

export type CharacterPose =
  | "idle"
  | "active"
  | "thinking"
  | "play"
  | "accuse"
  | "accused"
  | "roulette"
  | "relief"
  | "eliminated"
  | "winner";

export type CharacterSceneState = "loading" | "textured" | "fallback";

export type MotionPreset = "ambient" | "focused" | "impact" | "roulette" | "celebration";

export type CameraPresetId = "lobby" | "table" | "activeSeat" | "cardPlay" | "liarImpact" | "reveal" | "roulette" | "winner";

export type CharacterMotionState = CharacterPose;

export type CardMotionState = "idle" | "selected" | "dealing" | "throwing" | "revealing" | "settled";

export type SoloScenePhase = "idle" | "humanTurn" | "botThinking" | "resolvingChallenge" | "spectating" | "gameOver";

export type TimelineStep =
  | { type: "sequence"; label: string; steps: TimelineStep[] }
  | { type: "parallel"; label: string; steps: TimelineStep[] }
  | { type: "wait"; label?: string; durationMs: number }
  | { type: "tween"; label: string; durationMs: number };

export interface TimelineHandle {
  id: string;
  readonly cancelled: boolean;
  cancel(): void;
  finished: Promise<void>;
}

export interface CharacterRigSnapshot {
  assetIds: CharacterAssetId[];
  visibleCount: number;
  activePose: CharacterPose;
  sceneState: CharacterSceneState;
}

export interface SeatChamberIndicator {
  playerId: string;
  name: string;
  shotsTaken: number;
  remaining: number;
  total: number;
  isLastChamber: boolean;
  eliminated: boolean;
  dots: ChamberDotState[];
}

export interface VoiceSceneState {
  connected: boolean;
  muted: boolean;
  speaking: boolean;
}

export interface SeatNameplateSnapshot {
  playerId: string;
  name: string;
  cardsLeft: number;
  shotsLeft: number;
  voice: "off" | "on" | "muted" | "speaking";
  status?: "WINNER" | "LOSER";
}

export interface PileVisualTransform {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
}

export type AnimationBeat =
  | {
      id: string;
      type: "round";
      roundNumber: number;
      tableRank: Card["rank"];
      playerIds: string[];
    }
  | {
      id: string;
      type: "play";
      playerId: string;
      cardCount: number;
      turnNumber: number;
    }
  | {
      id: string;
      type: "challenge";
      callerId: string;
      accusedId: string;
      revealedCards: Card[];
      liarCardIds: string[];
    }
  | {
      id: string;
      type: "roulette";
      playerId: string;
      result: "BLANK" | "LETHAL";
      shotNumber?: number;
      remainingAfter?: number;
    }
  | {
      id: string;
      type: "elimination";
      playerId: string;
    }
  | {
      id: string;
      type: "winner";
      playerId: string;
    };

export type CinematicBeat = AnimationBeat;

export interface CinematicTimelineTask {
  id: string;
  beat: CinematicBeat;
  epoch: number;
}

export interface CinematicSceneSnapshot {
  ready: boolean;
  failed: boolean;
  quality: CinematicQualityProfile;
  activeBeat: string;
  assetIds: CinematicAssetId[];
  playerCount: number;
  pileCount: number;
  selectedCount: number;
  visibleMotionCards: number;
  visibleRevealCards: number;
  rouletteState: RouletteSceneState;
  rouletteVisualResult: RouletteVisualResult;
  rouletteDisplayPhase: RouletteDisplayPhase;
  resultUiUnlocked: boolean;
  aimedPlayerId?: string;
  waterStreamVisible: boolean;
  waterSplashVisible: boolean;
  dryPuffVisible: boolean;
  toyGunMeshNames: string[];
  tableMeshNames: string[];
  characterAssetIds: CharacterAssetId[];
  visibleCharacterCount: number;
  activeCharacterPose: CharacterPose;
  characterSceneState: CharacterSceneState;
  activeTimeline: string;
  completedTimelines: string[];
  queuedTimelineCount: number;
  cameraPreset: CameraPresetId;
  cameraMode: "lobby" | "player" | "orbit" | "cinematic";
  cameraDistance: number;
  cameraSettled: boolean;
  userCameraYaw: number;
  userCameraPitch: number;
  cameraUserControlled: boolean;
  actionsLocked: boolean;
  localSeatIndex: number;
  visibleNameplateCount: number;
  characterMotionStates: CharacterMotionState[];
  seatChamberIndicators: SeatChamberIndicator[];
  seatNameplates: SeatNameplateSnapshot[];
  motionCardCount: number;
  settledPileVisualCount: number;
  localHandVisualCount: number;
  selectedHandVisualCount: number;
  localHandFacingPlayer: boolean;
  pileVisualPositions: Array<{ x: number; y: number; z: number; rotationZ: number }>;
  cardMotionState: CardMotionState;
  soloPhase?: SoloScenePhase;
  visibleSpeechBubblePlayerId?: string;
  speechBubbleVisible: boolean;
  visibleQuoteCount: number;
  botThinkingPlayerId?: string;
  gunParked: boolean;
  localHandVisible: boolean;
  phase?: RoomState["phase"];
}

export type SceneCommand =
  | { type: "sync"; players: PublicPlayer[]; currentTurnPlayerId?: string; phase?: RoomState["phase"]; pileCount: number; voiceStates?: Record<string, VoiceSceneState> }
  | { type: "dealCards"; playerIds: string[]; roundNumber: number; tableRank: Card["rank"] }
  | { type: "throwCards"; playerId: string; cardCount: number }
  | { type: "revealCards"; callerId: string; accusedId: string; revealedCards: Card[]; liarCardIds: string[] }
  | { type: "focusPlayer"; playerId?: string }
  | { type: "playLiarImpact"; callerId: string; accusedId: string }
  | { type: "playRoulette"; playerId: string; result: "BLANK" | "LETHAL" }
  | { type: "playWin"; playerId: string }
  | { type: "playLoss"; playerId: string }
  | { type: "setSelectedCards"; count: number }
  | { type: "resetRoundVisuals" };

export interface BarSceneHandle {
  preloadAssets(): Promise<void>;
  syncSceneState(snapshot: {
    players: PublicPlayer[];
    currentTurnPlayerId?: string;
    winnerId?: string;
    phase?: RoomState["phase"];
    pileCount?: number;
    hasChallenge?: boolean;
    resultConcealed?: boolean;
    concealedEliminatedPlayerId?: string;
    voiceStates?: Record<string, VoiceSceneState>;
    localPlayerId?: string;
    localHand?: Card[];
    selectedCardIds?: string[];
    actionsLocked?: boolean;
    soloPhase?: SoloScenePhase;
    botThinkingPlayerId?: string;
    tableQuote?: {
      playerId: string;
      speaker: string;
      text: string;
      tone: "thinking" | "play" | "challenge" | "roulette" | "winner";
    } | null;
  }): void;
  playBeat(beat: CinematicBeat): Promise<void>;
  cancelAnimations(): void;
  setQualityProfile(profile: CinematicQualityProfile): void;
  getSceneSnapshot(): CinematicSceneSnapshot;
  dealCards(playerIds: string[], roundNumber: number, tableRank: Card["rank"]): void;
  throwCards(playerId: string, cardCount: number): void;
  revealCards(callerId: string, accusedId: string, revealedCards: Card[], liarCardIds: string[]): void;
  focusPlayer(playerId?: string): void;
  playLiarImpact(callerId: string, accusedId: string): void;
  playRoulette(playerId: string, result: "BLANK" | "LETHAL"): void;
  playWin(playerId: string): void;
  playLoss(playerId: string): void;
  resetRoundVisuals(): void;
  setSelectedCards(count: number): void;
  setQueuedTimelineCount(count: number): void;
}

export interface RulesStep {
  title: string;
  kicker: string;
  body: string;
}

export function rouletteVisualResult(result: RouletteKind): RouletteVisualResult {
  return result === "LETHAL" ? "water" : "dry";
}

export function rouletteResultLabel(result: RouletteKind): string {
  return result === "LETHAL" ? "hit" : "dry click";
}

export function rouletteResultReadout(result: RouletteKind): string {
  return result === "LETHAL" ? "Hit: eliminated" : "Dry chamber: missed";
}

export function rouletteDisplayPhaseFromSceneState(state: RouletteSceneState, resultUiUnlocked = false): RouletteDisplayPhase {
  if (resultUiUnlocked || state === "blank" || state === "lethal") {
    return "revealed";
  }
  if (state === "entering" || state === "spinning") {
    return "spinning";
  }
  if (state === "aiming") {
    return "aiming";
  }
  if (state === "trigger" || state === "dryFire" || state === "waterShot" || state === "splash") {
    return "triggering";
  }
  return "hidden";
}

export function roulettePendingLabel(phase: RouletteDisplayPhase, playerName = "Player"): string {
  if (phase === "aiming") {
    return `Taking aim at ${playerName}...`;
  }
  if (phase === "triggering") {
    return "Trigger squeezed...";
  }
  if (phase === "spinning") {
    return "Roulette gun spinning...";
  }
  return "Outcome hidden...";
}

export function roulettePendingReadout(phase: RouletteDisplayPhase): string {
  if (phase === "aiming") {
    return "Chamber still hidden";
  }
  if (phase === "triggering") {
    return "Hold your breath";
  }
  if (phase === "spinning") {
    return "Six chambers. One splash.";
  }
  return "Waiting for the roulette gun";
}

export function getChallengeKey(challenge?: ChallengeState): string | undefined {
  if (!challenge) {
    return undefined;
  }
  return [
    challenge.callerId,
    challenge.accusedId,
    challenge.roulettePlayerId,
    challenge.rouletteResult,
    challenge.eliminatedPlayerId ?? "survived",
    challenge.revealedCards.map((card) => card.id).join(","),
    challenge.liarCardIds.join(",")
  ].join("|");
}

export function shouldShowPlayerEliminated(player: PublicPlayer, concealedEliminatedPlayerId?: string): boolean {
  return player.eliminated && player.id !== concealedEliminatedPlayerId;
}

export function maskSuspenseEvents(
  events: GameEvent[],
  challenge: ChallengeState | undefined,
  conceal: boolean,
  players: PublicPlayer[],
  winnerId?: string
): GameEvent[] {
  if (!challenge || !conceal) {
    return events;
  }
  const roulettePlayerName = players.find((player) => player.id === challenge.roulettePlayerId)?.name ?? "Player";
  return events.map((event) => {
    if (event.animation?.kind === "roulette" && event.animation.playerId === challenge.roulettePlayerId) {
      return {
        ...event,
        message: `${roulettePlayerName} faces the roulette gun...`
      };
    }
    if (event.animation?.kind === "elimination" && event.animation.playerId === challenge.eliminatedPlayerId) {
      return {
        ...event,
        kind: "system",
        message: "Outcome still hidden..."
      };
    }
    if (event.animation?.kind === "winner" && event.animation.playerId === winnerId) {
      return {
        ...event,
        kind: "system",
        message: "Table outcome still hidden..."
      };
    }
    return event;
  });
}

export function eventToAnimationBeat(event: GameEvent): AnimationBeat | undefined {
  const animation = event.animation;
  if (!animation) {
    return undefined;
  }

  switch (animation.kind) {
    case "round":
      return {
        id: event.id,
        type: "round",
        roundNumber: animation.roundNumber,
        tableRank: animation.tableRank,
        playerIds: animation.playerIds
      };
    case "play":
      return {
        id: event.id,
        type: "play",
        playerId: animation.playerId,
        cardCount: animation.cardCount,
        turnNumber: animation.turnNumber
      };
    case "challenge":
      return {
        id: event.id,
        type: "challenge",
        callerId: animation.callerId,
        accusedId: animation.accusedId,
        revealedCards: animation.revealedCards,
        liarCardIds: animation.liarCardIds
      };
    case "roulette":
      return {
        id: event.id,
        type: "roulette",
        playerId: animation.playerId,
        result: animation.result,
        shotNumber: animation.shotNumber,
        remainingAfter: animation.remainingAfter
      };
    case "elimination":
      return {
        id: event.id,
        type: "elimination",
        playerId: animation.playerId
      };
    case "winner":
      return {
        id: event.id,
        type: "winner",
        playerId: animation.playerId
      };
    default:
      return undefined;
  }
}

export function deriveAnimationBeats(events: GameEvent[], processedIds: Set<string>): AnimationBeat[] {
  return events
    .filter((event) => !processedIds.has(event.id))
    .map(eventToAnimationBeat)
    .filter((beat): beat is AnimationBeat => Boolean(beat));
}

export function getCinematicDuration(durationMs: number, quality: CinematicQualityProfile): number {
  if (quality === "reduced-motion") {
    return Math.max(16, Math.round(durationMs * 0.28));
  }
  if (quality === "mobile") {
    return Math.max(16, Math.round(durationMs * 0.72));
  }
  return durationMs;
}

export function getTimelineDuration(step: TimelineStep, quality: CinematicQualityProfile): number {
  if (step.type === "wait" || step.type === "tween") {
    return getCinematicDuration(step.durationMs, quality);
  }
  const childDurations = step.steps.map((child) => getTimelineDuration(child, quality));
  if (step.type === "parallel") {
    return childDurations.length ? Math.max(...childDurations) : 0;
  }
  return childDurations.reduce((total, duration) => total + duration, 0);
}

export function getTimelineLabels(step: TimelineStep): string[] {
  if (step.type === "wait") {
    return step.label ? [step.label] : [];
  }
  if (step.type === "tween") {
    return [step.label];
  }
  return [step.label, ...step.steps.flatMap(getTimelineLabels)];
}

export function createTimelineHandle(id: string): TimelineHandle {
  let cancelled = false;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  return {
    id,
    get cancelled() {
      return cancelled;
    },
    cancel() {
      cancelled = true;
      resolveFinished();
    },
    finished
  };
}

export function getPileVisualTransform(index: number, total: number): PileVisualTransform {
  const safeTotal = Math.max(1, Math.min(16, Math.floor(total || 1)));
  const safeIndex = Math.max(0, Math.min(safeTotal - 1, Math.floor(index || 0)));
  const stackLayer = safeIndex;
  const offsetCycle = safeIndex % 5;
  const centeredOffset = offsetCycle - 2;
  const jitterX = Math.sin((safeIndex + 1) * 1.618) * 0.012;
  const jitterZ = Math.cos((safeIndex + 1) * 1.31) * 0.012;

  return {
    x: centeredOffset * 0.018 + jitterX,
    y: stackLayer * 0.022,
    z: (safeIndex % 3 - 1) * 0.018 + jitterZ,
    rotationX: -0.105 + Math.sin(safeIndex * 0.9) * 0.01,
    rotationY: Math.cos(safeIndex * 0.7) * 0.018,
    rotationZ: Math.sin(safeIndex * 1.47) * 0.075,
    scale: 0.94
  };
}

export function makeCinematicTasks(beats: CinematicBeat[], epoch: number): CinematicTimelineTask[] {
  return beats.map((beat) => ({
    id: beat.id,
    beat,
    epoch
  }));
}

export function getSeatChamberIndicator(player: PublicPlayer): SeatChamberIndicator {
  const remaining = clampInt(player.revolverRemaining ?? ROULETTE_CHAMBERS, 0, ROULETTE_CHAMBERS);
  const shotsTaken = clampInt(player.rouletteShotsTaken ?? ROULETTE_CHAMBERS - remaining, 0, ROULETTE_CHAMBERS);
  const isLastChamber = !player.eliminated && remaining === 1;
  const dots = Array.from({ length: ROULETTE_CHAMBERS }, (_, index): ChamberDotState => {
    if (player.eliminated) {
      return "eliminated";
    }
    if (index < shotsTaken) {
      return "spent";
    }
    if (isLastChamber) {
      return "last";
    }
    return "remaining";
  });

  return {
    playerId: player.id,
    name: player.name,
    shotsTaken,
    remaining,
    total: ROULETTE_CHAMBERS,
    isLastChamber,
    eliminated: player.eliminated,
    dots
  };
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
