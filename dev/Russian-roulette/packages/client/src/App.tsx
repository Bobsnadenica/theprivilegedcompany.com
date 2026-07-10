import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  DoorOpen,
  Flame,
  History,
  HelpCircle,
  Mic,
  MicOff,
  Play,
  Radio,
  RefreshCcw,
  Shield,
  Timer,
  Users,
  Volume2,
  VolumeX
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Card, GameEvent, PrivatePlayerState, PublicPlayer, RoomState, RouletteKind } from "@rrld/shared";
import { BarScene } from "./BarScene";
import {
  getChallengeKey,
  maskSuspenseEvents,
  roulettePendingLabel,
  roulettePendingReadout,
  rouletteResultLabel,
  rouletteResultReadout,
  type BarSceneHandle,
  type RouletteDisplayPhase,
  type RouletteSpoilerState
} from "./animationTypes";
import { RulesOverlay } from "./RulesOverlay";
import { SOLO_HUMAN_ID, useSoloGame, type SoloSchedulerState } from "./soloGame";
import { useAnimationDirector } from "./useAnimationDirector";
import { useTableAudio } from "./useTableAudio";
import { useVoiceChat, type VoiceClientState, type VoicePeerAudioStatus } from "./useVoiceChat";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
const STATIC_SOLO_ONLY = import.meta.env.VITE_STATIC_SOLO_ONLY === "true";
const SESSION_KEY = "rrld-session";
const RULES_DISMISSED_KEY = "rrld-rules-dismissed";
const SOUND_ENABLED_KEY = "rrld-table-sounds-enabled";
const CHALLENGE_RESULT_DISPLAY_MS = 3800;
const SOLO_CHALLENGE_RESULT_DISPLAY_MS = 6200;
const AUTO_START_PARAM = "autostart";

type CockpitPhase = "entry" | "lobby" | "playing" | "challenge" | "roulette" | "gameOver";
type PlayMode = "entry" | "online" | "solo";
type PendingOnlineAction = { type: "create"; name: string } | { type: "join"; name: string; roomCode: string };
type TableQuoteTone = "thinking" | "play" | "challenge" | "roulette" | "winner";

interface TableQuote {
  playerId: string;
  speaker: string;
  text: string;
  tone: TableQuoteTone;
}

interface SavedSession {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export function App() {
  const [playMode, setPlayMode] = useState<PlayMode>("entry");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<RoomState | null>(null);
  const [onlinePrivateState, setOnlinePrivateState] = useState<PrivatePlayerState | null>(null);
  const [onlineEvents, setOnlineEvents] = useState<GameEvent[]>([]);
  const [pendingOnlineAction, setPendingOnlineAction] = useState<PendingOnlineAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("Choose mode");
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [soloDockCollapsed, setSoloDockCollapsed] = useState(false);
  const [dismissedChallengeKey, setDismissedChallengeKey] = useState<string | undefined>(undefined);
  const [rouletteSpoiler, setRouletteSpoiler] = useState<RouletteSpoilerState>({ displayPhase: "hidden", resultUiUnlocked: false });
  const [lockNow, setLockNow] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState(() => readSoundPreference());
  const [tableQuote, setTableQuote] = useState<TableQuote | null>(null);
  const sceneRef = useRef<BarSceneHandle | null>(null);
  const currentChallengeKeyRef = useRef<string | undefined>(undefined);
  const pendingOnlineActionRef = useRef<PendingOnlineAction | null>(null);
  const lastEventSoundIdRef = useRef<string | undefined>(undefined);
  const lastChallengeSoundKeyRef = useRef<string | undefined>(undefined);
  const lastResultSoundKeyRef = useRef<string | undefined>(undefined);
  const lastQuoteKeyRef = useRef<string | undefined>(undefined);
  const lastQuoteSoundKeyRef = useRef<string | undefined>(undefined);
  const lastThinkingQuoteKeyRef = useRef<string | undefined>(undefined);
  const lastQuoteAtRef = useRef(0);
  const autoStartedRef = useRef(false);
  const solo = useSoloGame();
  const tableAudio = useTableAudio(soundEnabled);

  useEffect(() => {
    if (!STATIC_SOLO_ONLY && readSavedSession()) {
      setPlayMode("online");
    }
  }, []);

  useEffect(() => {
    pendingOnlineActionRef.current = pendingOnlineAction;
  }, [pendingOnlineAction]);

  useEffect(() => {
    if (!STATIC_SOLO_ONLY || playMode !== "entry") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (!autoStartedRef.current && (params.get(AUTO_START_PARAM) === "1" || params.get(AUTO_START_PARAM) === "true")) {
      autoStartedRef.current = true;
      startSolo();
    }
  }, [playMode]);

  useEffect(() => {
    if (playMode !== "online") {
      setConnectionLabel(playMode === "solo" ? "Solo Demo" : "Choose mode");
      setSocket(null);
      return;
    }

    setConnectionLabel("Connecting");
    const nextSocket = io(SERVER_URL, {
      transports: ["websocket", "polling"]
    });

    nextSocket.on("connect", () => {
      setConnectionLabel("Online");
      const saved = pendingOnlineActionRef.current ? undefined : readSavedSession();
      if (saved) {
        nextSocket.emit("room:reconnect", saved);
      }
    });
    nextSocket.on("disconnect", () => setConnectionLabel("Offline"));
    nextSocket.on("room:state", (payload: RoomState) => {
      setOnlineRoom(payload);
      if (payload.you) {
        writeSavedSession({
          roomCode: payload.code,
          playerId: payload.you.playerId,
          reconnectToken: payload.you.reconnectToken
        });
      }
    });
    nextSocket.on("game:privateState", (payload: PrivatePlayerState) => {
      setOnlinePrivateState(payload);
      setSelectedCardIds((current) => current.filter((id) => payload.hand.some((card) => card.id === id)));
    });
    nextSocket.on("game:eventLog", (payload: GameEvent[]) => setOnlineEvents(payload));
    nextSocket.on("game:error", (payload: { message: string }) => {
      setError(payload.message);
      window.setTimeout(() => setError(null), 3500);
    });
    nextSocket.on("room:closed", () => {
      clearSavedSession();
      setOnlineRoom(null);
      setOnlinePrivateState(null);
      setOnlineEvents([]);
      setPlayMode("entry");
    });

    setSocket(nextSocket);
    return () => {
      nextSocket.disconnect();
    };
  }, [playMode]);

  useEffect(() => {
    if (playMode !== "online" || !socket?.connected || !pendingOnlineAction) {
      return;
    }

    if (pendingOnlineAction.type === "create") {
      socket.emit("room:create", { name: pendingOnlineAction.name });
    } else {
      socket.emit("room:join", { name: pendingOnlineAction.name, roomCode: pendingOnlineAction.roomCode.trim().toUpperCase() });
    }
    setPendingOnlineAction(null);
  }, [connectionLabel, pendingOnlineAction, playMode, socket]);

  useEffect(() => {
    if (solo.error) {
      setError(solo.error);
      const timeout = window.setTimeout(() => {
        solo.clearError();
        setError(null);
      }, 3500);
      return () => window.clearTimeout(timeout);
    }
  }, [solo.error]);

  const room = playMode === "solo" ? solo.room : onlineRoom;
  const privateState = playMode === "solo" ? solo.privateState : onlinePrivateState;
  const events = playMode === "solo" ? solo.events : onlineEvents;
  const isSoloMode = playMode === "solo";
  const soloScheduler = solo.scheduler;

  useEffect(() => {
    if (!privateState) {
      setSelectedCardIds([]);
    }
  }, [privateState]);

  const myPlayerId = room?.you?.playerId;
  const publicPlayers = (room?.players ?? []) as PublicPlayer[];
  const me = publicPlayers.find((player) => player.id === myPlayerId);
  const game = room?.game;
  const isHost = Boolean(myPlayerId && room?.hostId === myPlayerId);
  const isMyTurn = Boolean(game?.currentTurnPlayerId && game.currentTurnPlayerId === myPlayerId);
  const humanEliminated = Boolean(isSoloMode && publicPlayers.find((player) => player.id === SOLO_HUMAN_ID)?.eliminated);
  const { voice, joinVoice, leaveVoice, toggleMute, resetVoice, retryAudioPlayback, testSpeaker, testMicLoopback } = useVoiceChat(isSoloMode ? null : socket, room, myPlayerId);
  const sceneVoiceStates = useMemo(
    () =>
      Object.fromEntries(
        voice.peers.map((peer) => [
          peer.playerId,
          {
            connected: peer.connected,
            muted: peer.muted,
            speaking: peer.speaking
          }
        ])
      ),
    [voice.peers]
  );

  const previousPlayer = publicPlayers.find((player) => player.id === game?.previousPlay?.playerId);
  const winner = publicPlayers.find((player) => player.id === game?.winnerId);
  const hasPlayableSoloCard = Boolean(isSoloMode && isMyTurn && privateState?.hand.length && selectedCardIds.length === 0);
  const currentChallengeKey = useMemo(() => getChallengeKey(game?.lastChallenge), [game?.lastChallenge]);
  currentChallengeKeyRef.current = currentChallengeKey;
  const serverActionsLocked = Boolean(game?.actionsLockedUntil && game.actionsLockedUntil > lockNow);
  const serverLockExpired = Boolean(game?.actionsLockedUntil && game.actionsLockedUntil <= lockNow);
  const sceneResultUnlocked = Boolean(rouletteSpoiler.resultUiUnlocked && rouletteSpoiler.challengeKey === currentChallengeKey);
  const sceneStillResolving = rouletteSpoiler.displayPhase !== "hidden" && rouletteSpoiler.displayPhase !== "revealed";
  const resultConcealed = Boolean(game?.lastChallenge && !sceneResultUnlocked && (!serverLockExpired || sceneStillResolving));
  const concealedEliminatedPlayerId = resultConcealed ? game?.lastChallenge?.eliminatedPlayerId : undefined;
  const showChallengePanel = Boolean(game?.lastChallenge && dismissedChallengeKey !== currentChallengeKey);
  const challengeVisualActive = showChallengePanel || resultConcealed;
  const controlsBlocked = Boolean(game && (challengeVisualActive || serverActionsLocked));
  const canPlay = Boolean(!controlsBlocked && isMyTurn && game?.phase === "playing" && !game.forcedCall && (selectedCardIds.length > 0 || hasPlayableSoloCard));
  const canCall = Boolean(!controlsBlocked && isMyTurn && game?.phase === "playing" && game.previousPlay);
  const visibleWinner = resultConcealed ? undefined : winner;
  const showEndGameActions = Boolean(game?.phase === "gameOver" && !resultConcealed);
  const cockpitPhase = room ? getCockpitPhase(room, game, resultConcealed, showEndGameActions, challengeVisualActive) : "entry";
  const bottomStatusLine = getBottomStatusLine({
    game,
    controlsBlocked,
    isMyTurn,
    isSoloMode,
    soloScheduler,
    humanEliminated
  });
  const actionHint = getActionHint({
    game,
    isMyTurn,
    canPlay,
    canCall,
    controlsBlocked,
    selectedCount: selectedCardIds.length,
    isSoloMode,
    soloScheduler,
    humanEliminated
  });

  const sortedEvents = useMemo(() => [...events].reverse().slice(0, 12), [events]);
  const displayEvents = useMemo(
    () => maskSuspenseEvents(sortedEvents, game?.lastChallenge, resultConcealed, publicPlayers, game?.winnerId),
    [sortedEvents, game?.lastChallenge, resultConcealed, publicPlayers, game?.winnerId]
  );
  const latestEvent = displayEvents[0];
  const latestRawEvent = events[events.length - 1];

  useEffect(() => {
    if (!soundEnabled || !latestRawEvent || resultConcealed) {
      return;
    }
    if (["challenge", "roulette", "elimination"].includes(latestRawEvent.kind)) {
      return;
    }
    if (lastEventSoundIdRef.current === latestRawEvent.id) {
      return;
    }
    lastEventSoundIdRef.current = latestRawEvent.id;
    void tableAudio.playEvent(latestRawEvent);
  }, [latestRawEvent, resultConcealed, soundEnabled, tableAudio]);

  useEffect(() => {
    if (!soundEnabled || !currentChallengeKey || lastChallengeSoundKeyRef.current === currentChallengeKey) {
      return;
    }
    lastChallengeSoundKeyRef.current = currentChallengeKey;
    void tableAudio.playChallenge();
  }, [currentChallengeKey, soundEnabled, tableAudio]);

  useEffect(() => {
    if (!soundEnabled || !game?.lastChallenge || !currentChallengeKey || resultConcealed) {
      return;
    }
    if (lastResultSoundKeyRef.current === currentChallengeKey) {
      return;
    }
    lastResultSoundKeyRef.current = currentChallengeKey;
    void tableAudio.playRoulette(game.lastChallenge.rouletteResult);
  }, [currentChallengeKey, game?.lastChallenge, resultConcealed, soundEnabled, tableAudio]);

  useEffect(() => {
    if (!isSoloMode || !latestRawEvent || resultConcealed) {
      return;
    }
    const quote =
      getSoloResultQuote(game?.lastChallenge, currentChallengeKey, publicPlayers, resultConcealed, lastQuoteKeyRef.current) ??
      getSoloEventQuote(latestRawEvent, publicPlayers, myPlayerId);
    if (!quote) {
      return;
    }
    const now = Date.now();
    if (quote.quote.tone === "play" && now - lastQuoteAtRef.current < 1800) {
      return;
    }
    lastQuoteKeyRef.current = quote.key;
    lastQuoteAtRef.current = now;
    setTableQuote(quote.quote);
    const timeout = window.setTimeout(() => setTableQuote(null), quote.durationMs);
    return () => window.clearTimeout(timeout);
  }, [currentChallengeKey, game?.lastChallenge, isSoloMode, latestRawEvent, myPlayerId, publicPlayers, resultConcealed]);

  useEffect(() => {
    if (!tableQuote) {
      lastQuoteSoundKeyRef.current = undefined;
      return;
    }
    if (!soundEnabled || tableQuote.playerId === SOLO_HUMAN_ID) {
      return;
    }
    const quoteSoundKey = `${tableQuote.playerId}:${tableQuote.tone}:${tableQuote.text}`;
    if (lastQuoteSoundKeyRef.current === quoteSoundKey) {
      return;
    }
    lastQuoteSoundKeyRef.current = quoteSoundKey;
    void tableAudio.playCharacterVoice(tableQuote.playerId, tableQuote.speaker, tableQuote.tone);
  }, [soundEnabled, tableAudio, tableQuote]);

  useEffect(() => {
    if (!isSoloMode || resultConcealed || !soloScheduler.botId || !["botThinking", "spectating"].includes(soloScheduler.phase)) {
      return;
    }
    const player = publicPlayers.find((candidate) => candidate.id === soloScheduler.botId);
    if (!player) {
      return;
    }
    const quoteKey = `thinking:${soloScheduler.botId}:${game?.roundNumber ?? 0}:${game?.pileCount ?? 0}:${soloScheduler.phase}`;
    const now = Date.now();
    if (lastThinkingQuoteKeyRef.current === quoteKey || now - lastQuoteAtRef.current < 2400) {
      return;
    }

    const quoteTimeout = window.setTimeout(() => {
      lastThinkingQuoteKeyRef.current = quoteKey;
      lastQuoteAtRef.current = Date.now();
      setTableQuote({
        playerId: player.id,
        speaker: player.name,
        text: pickDeterministic(getSoloQuoteLines(player.id, "thinking"), quoteKey),
        tone: "thinking"
      });
    }, 520);
    const clearTimeoutId = window.setTimeout(() => setTableQuote(null), 3300);
    return () => {
      window.clearTimeout(quoteTimeout);
      window.clearTimeout(clearTimeoutId);
    };
  }, [game?.pileCount, game?.roundNumber, isSoloMode, publicPlayers, resultConcealed, soloScheduler.botId, soloScheduler.phase]);

  useAnimationDirector({
    sceneRef,
    room,
    privateState,
    events,
    selectedCardIds,
    localPlayerId: myPlayerId,
    concealedEliminatedPlayerId,
    hasChallenge: challengeVisualActive
  });

  useEffect(() => {
    solo.setPresentationLocked(Boolean(isSoloMode && controlsBlocked));
  }, [controlsBlocked, isSoloMode, solo.setPresentationLocked]);

  useEffect(() => {
    if (!game?.actionsLockedUntil) {
      return;
    }
    setLockNow(Date.now());
    const interval = window.setInterval(() => setLockNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, [game?.actionsLockedUntil]);

  const handKey = privateState?.hand.map((card) => card.id).join("|") ?? "";
  useEffect(() => {
    setSelectedCardIds([]);
  }, [controlsBlocked, game?.currentTurnPlayerId, handKey]);

  useEffect(() => {
    setDismissedChallengeKey(undefined);
    setRouletteSpoiler((current) => {
      if (!currentChallengeKey) {
        return { displayPhase: "hidden", resultUiUnlocked: false };
      }
      if (current.challengeKey === currentChallengeKey) {
        return current;
      }
      return { challengeKey: currentChallengeKey, displayPhase: "hidden", resultUiUnlocked: false };
    });
  }, [currentChallengeKey]);

  useEffect(() => {
    if (!currentChallengeKey || !game?.lastChallenge || resultConcealed || dismissedChallengeKey === currentChallengeKey) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setDismissedChallengeKey(currentChallengeKey);
    }, isSoloMode ? SOLO_CHALLENGE_RESULT_DISPLAY_MS : CHALLENGE_RESULT_DISPLAY_MS);

    return () => window.clearTimeout(timeout);
  }, [currentChallengeKey, dismissedChallengeKey, game?.lastChallenge, isSoloMode, resultConcealed]);

  const handleRouletteStageChange = useCallback(
    (stage: { displayPhase: RouletteDisplayPhase; resultUiUnlocked: boolean }) => {
      setRouletteSpoiler((current) => {
        const challengeKey = currentChallengeKeyRef.current;
        if (!challengeKey) {
          return current;
        }
        return {
          challengeKey,
          displayPhase: stage.displayPhase,
          resultUiUnlocked: stage.resultUiUnlocked
        };
      });
    },
    []
  );

  useEffect(() => {
    if (room?.phase === "lobby" && window.localStorage.getItem(RULES_DISMISSED_KEY) !== "true") {
      setRulesOpen(true);
    }
  }, [room?.code, room?.phase]);

  useEffect(() => {
    if (room?.phase && room.phase !== "lobby") {
      setRulesOpen(false);
    }
  }, [room?.phase]);

  function createRoom(name: string) {
    setError(null);
    solo.exit();
    setPlayMode("online");
    setPendingOnlineAction({ type: "create", name });
  }

  function joinRoom(name: string, roomCode: string) {
    setError(null);
    solo.exit();
    setPlayMode("online");
    setPendingOnlineAction({ type: "join", name, roomCode });
  }

  function startSolo(name?: string) {
    leaveVoice();
    setError(null);
    clearSavedSession();
    setOnlineRoom(null);
    setOnlinePrivateState(null);
    setOnlineEvents([]);
    setPendingOnlineAction(null);
    setPlayMode("solo");
    solo.start(name);
  }

  function startRoom() {
    socket?.emit("room:start", { roomCode: room?.code });
  }

  function leaveRoom() {
    if (isSoloMode) {
      solo.exit();
      setPlayMode("entry");
      setSelectedCardIds([]);
      setDismissedChallengeKey(undefined);
      setRouletteSpoiler({ displayPhase: "hidden", resultUiUnlocked: false });
      return;
    }
    if (room?.code) {
      socket?.emit("room:leave", { roomCode: room.code });
    }
    leaveVoice();
    clearSavedSession();
    setOnlineRoom(null);
    setOnlinePrivateState(null);
    setOnlineEvents([]);
    setPendingOnlineAction(null);
    setPlayMode("entry");
  }

  function restartGame() {
    if (isSoloMode) {
      solo.restart();
      setSelectedCardIds([]);
      setDismissedChallengeKey(undefined);
      setRouletteSpoiler({ displayPhase: "hidden", resultUiUnlocked: false });
      return;
    }
    if (room?.code) {
      socket?.emit("game:restart", { roomCode: room.code });
    }
  }

  function openRules() {
    setRulesOpen(true);
  }

  function closeRules() {
    setRulesOpen(false);
    window.localStorage.setItem(RULES_DISMISSED_KEY, "true");
  }

  function toggleTableSound() {
    setSoundEnabled((current) => {
      const next = !current;
      window.localStorage.setItem(SOUND_ENABLED_KEY, String(next));
      if (next) {
        void tableAudio.warm();
      }
      return next;
    });
  }

  function playSelected() {
    if (!canPlay) {
      return;
    }
    const cardIdsToPlay = selectedCardIds.length > 0 ? selectedCardIds : isSoloMode ? privateState?.hand.slice(0, 1).map((card) => card.id) ?? [] : selectedCardIds;
    if (cardIdsToPlay.length === 0) {
      return;
    }
    if (isSoloMode) {
      solo.playSelectedCards(cardIdsToPlay);
    } else {
      socket?.emit("game:playCards", { roomCode: room?.code, cardIds: cardIdsToPlay });
    }
    setSelectedCardIds([]);
  }

  function callLiar() {
    if (!canCall) {
      return;
    }
    if (isSoloMode) {
      solo.callLiar();
    } else {
      socket?.emit("game:callLiar", { roomCode: room?.code });
    }
  }

  function toggleCard(cardId: string) {
    if (!isMyTurn || game?.forcedCall || controlsBlocked) {
      return;
    }

    setSelectedCardIds((current) => {
      if (current.includes(cardId)) {
        return current.filter((id) => id !== cardId);
      }
      if (current.length >= 3) {
        return current;
      }
      return [...current, cardId];
    });
  }

  useEffect(() => {
    if (!isSoloMode) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) {
        return;
      }

      if ((event.key === "Enter" || event.key === " ") && canPlay) {
        event.preventDefault();
        playSelected();
      }

      if (event.key.toLowerCase() === "l" && canCall) {
        event.preventDefault();
        callLiar();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canCall, canPlay, isSoloMode, privateState?.hand, selectedCardIds]);

  return (
    <main className="app-shell" data-game-ui={game && (game.phase !== "gameOver" || resultConcealed) ? "active" : room ? "room" : "entry"}>
      <BarScene
        ref={sceneRef}
        players={publicPlayers}
        currentTurnPlayerId={game?.currentTurnPlayerId}
        winnerId={visibleWinner?.id}
        phase={room?.phase}
        pileCount={game?.pileCount}
        hasChallenge={challengeVisualActive}
        resultConcealed={resultConcealed}
        concealedEliminatedPlayerId={concealedEliminatedPlayerId}
        voiceStates={sceneVoiceStates}
        localPlayerId={myPlayerId}
        localHand={privateState?.hand ?? []}
        selectedCardIds={selectedCardIds}
        actionsLocked={controlsBlocked}
        soloPhase={isSoloMode ? soloScheduler.phase : undefined}
        botThinkingPlayerId={isSoloMode ? soloScheduler.botId : undefined}
        tableQuote={tableQuote}
        onLocalCardToggle={toggleCard}
        onRouletteStageChange={handleRouletteStageChange}
      />
      <div className="noise" aria-hidden="true" />
      <header className="topbar" data-compact={Boolean(room)}>
        <div className="brand-lockup">
          <p className="eyebrow">Online room bluff game</p>
          <h1>Russian Roulette Liar&apos;s Deck</h1>
          {room ? <span className="phase-chip">{phaseLabel(cockpitPhase)}</span> : null}
        </div>
        <div className="topbar-actions">
          {room ? (
            <RoomHeader
              room={room}
              soundEnabled={soundEnabled}
              onLeave={leaveRoom}
              onRules={openRules}
              onToggleSound={toggleTableSound}
            />
          ) : null}
          <div className="status-pill" data-status={connectionLabel.toLowerCase()}>
            <span />
            {connectionLabel}
          </div>
        </div>
      </header>

      {error ? (
        <div className="toast" role="alert">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {!room ? (
        <EntryPanel onCreate={createRoom} onJoin={joinRoom} onStartSolo={startSolo} soloOnly={STATIC_SOLO_ONLY} />
      ) : (
        <section
          className="game-cockpit"
          data-phase={cockpitPhase}
          data-history-open={historyOpen}
          data-cinematic={resultConcealed || Boolean(showChallengePanel)}
          data-controls-blocked={controlsBlocked}
          data-mode={isSoloMode ? "solo" : "online"}
        >
          <section
            className="table-surface"
            aria-label="Game table"
            data-challenge={challengeVisualActive}
            data-roulette-phase={rouletteSpoiler.displayPhase}
          >
            <RulesOverlay open={rulesOpen} onClose={closeRules} />
            {game ? (
              <>
                <div className="round-strip">
                  <div>
                    <span>Round {game.roundNumber}</span>
                    <strong>{displayRank(game.tableRank)} table</strong>
                  </div>
                  <TimerBar turnEndsAt={game.turnEndsAt} turnStartedAt={game.turnStartedAt} running={game.phase === "playing" && !controlsBlocked} />
                </div>

                <div className="table-center" data-has-play={Boolean(game.previousPlay)}>
                  <div className="table-card">
                    <span>{rankGlyph(game.tableRank)}</span>
                    <strong>{displayRank(game.tableRank)}</strong>
                  </div>
                  <div className="pile-stack" data-testid="pile-count" data-pile={game.pileCount}>
                    {game.pileCount > 0 ? <div className="card-back" /> : null}
                    <div>
                      <span>{game.pileCount}</span>
                      <p>Face down</p>
                    </div>
                  </div>
                  <div className="previous-play" data-claimed={Boolean(previousPlayer && game.previousPlay)}>
                    {previousPlayer && game.previousPlay ? (
                      <>
                        <span>{previousPlayer.name}</span>
                        <strong>
                          {game.previousPlay.cardCount} card{game.previousPlay.cardCount === 1 ? "" : "s"}
                        </strong>
                      </>
                    ) : (
                      <>
                        <span>Opening turn</span>
                        <strong>No claim yet</strong>
                      </>
                    )}
                  </div>
                </div>

                {showChallengePanel ? <ChallengePanel game={game} players={publicPlayers} spoiler={rouletteSpoiler} resultConcealed={resultConcealed} /> : null}
                {visibleWinner ? (
                  <div className="winner-banner" data-testid="winner-banner">
                    <Shield size={20} />
                    {visibleWinner.name} wins the table
                  </div>
                ) : null}
                {showEndGameActions ? <EndGameActions isHost={isHost} onPlayAgain={restartGame} onExit={leaveRoom} /> : null}
              </>
            ) : (
              <div className="waiting-table">
                <Users size={28} />
                <h2>Room is open</h2>
                <p>{isHost ? "Invite players with the code above, then start when at least two seats are filled." : "Waiting for the host to start."}</p>
                <LobbyCommand isHost={isHost} playerCount={publicPlayers.length} onStart={startRoom} />
              </div>
            )}
          </section>

          <aside className="voice-dock cockpit-panel" data-collapsed={isSoloMode && soloDockCollapsed} data-testid={isSoloMode ? "solo-dock" : "voice-dock"}>
            {isSoloMode ? (
              <button
                className="dock-toggle"
                type="button"
                onClick={() => setSoloDockCollapsed((collapsed) => !collapsed)}
                aria-expanded={!soloDockCollapsed}
                data-testid="solo-dock-toggle"
              >
                {soloDockCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                <span>{soloDockCollapsed ? "Open status" : "Minimize"}</span>
              </button>
            ) : null}
            {!(isSoloMode && soloDockCollapsed) ? (
              <>
                {isSoloMode ? (
                  <SoloDemoPanel
                    scheduler={soloScheduler}
                    players={publicPlayers}
                    humanEliminated={humanEliminated}
                    soundEnabled={soundEnabled}
                    onToggleSound={toggleTableSound}
                    onToggleFastForward={() => solo.setFastForward(!solo.fastForward)}
                  />
                ) : (
                  <VoicePanel
                    voice={voice}
                    disabled={!room || !myPlayerId}
                    players={publicPlayers}
                    myPlayerId={myPlayerId}
                    onJoin={joinVoice}
                    onLeave={leaveVoice}
                    onToggleMute={toggleMute}
                    onResetVoice={resetVoice}
                    onRetryAudio={retryAudioPlayback}
                    onTestSpeaker={testSpeaker}
                    onTestMicLoopback={testMicLoopback}
                  />
                )}
                <EventTicker latestEvent={latestEvent} historyOpen={historyOpen} onToggleHistory={() => setHistoryOpen((open) => !open)} />
                <HistoryPanel events={displayEvents} open={historyOpen} onToggle={() => setHistoryOpen((open) => !open)} />
              </>
            ) : null}
          </aside>

          {game && game.phase !== "gameOver" ? (
            <section className="bottom-action-tray" data-testid="bottom-action-tray">
              <div className="bottom-status">
                <p className="eyebrow">Seat</p>
                <h2>{me?.name ?? "Joining"}</h2>
                <p>{bottomStatusLine}</p>
              </div>
              <Hand
                cards={privateState?.hand ?? []}
                selectedCardIds={selectedCardIds}
                disabled={!isMyTurn || Boolean(game?.forcedCall) || controlsBlocked}
                onToggle={toggleCard}
              />
              <div className="action-cluster">
                <div className="action-row">
                  <button className="primary-button" type="button" disabled={!canPlay} onClick={playSelected} data-testid="play-selected">
                    <Play size={18} />
                    Play {selectedCardIds.length || ""}
                  </button>
                  <button className="danger-button" type="button" disabled={!canCall} onClick={callLiar} data-testid="call-liar">
                    <Flame size={18} />
                    LIAR
                  </button>
                </div>
                <p className="action-hint" data-testid="action-hint">{actionHint}</p>
              </div>
            </section>
          ) : null}

        </section>
      )}
    </main>
  );
}

function EntryPanel({
  onCreate,
  onJoin,
  onStartSolo,
  soloOnly = false
}: {
  onCreate: (name: string) => void;
  onJoin: (name: string, roomCode: string) => void;
  onStartSolo: (name?: string) => void;
  soloOnly?: boolean;
}) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");

  return (
    <section className="entry-grid" data-mode={mode} data-testid="entry-cockpit">
      <div className="entry-panel entry-cockpit-panel">
        <div className="entry-copy">
          <p className="eyebrow">{soloOnly ? "GitLab playable demo" : "Private table"}</p>
          <h2>{soloOnly ? "Play instantly" : mode === "create" ? "Host a table" : "Join a table"}</h2>
          <p>
            {soloOnly
              ? "Jump straight into the browser-only solo demo against three bot opponents. No clone, install, server, or room code needed."
              : mode === "create"
                ? "Create a room code, share it, and start once two players are seated."
                : "Enter a room code from the host and take a seat at the table."}
          </p>
        </div>
        <button className="solo-demo-button" type="button" onClick={() => onStartSolo(name)} data-testid="play-solo-demo">
          <Play size={19} />
          <span>
            Play Solo Demo
            <small>No server needed · 3 bot opponents</small>
          </span>
        </button>
        {!soloOnly ? (
          <div className="entry-segment" role="tablist" aria-label="Entry mode">
            <button type="button" role="tab" aria-selected={mode === "create"} data-active={mode === "create"} onClick={() => setMode("create")} data-testid="entry-mode-create">
              <Users size={17} />
              Create
            </button>
            <button type="button" role="tab" aria-selected={mode === "join"} data-active={mode === "join"} onClick={() => setMode("join")} data-testid="entry-mode-join">
              <DoorOpen size={17} />
              Join
            </button>
          </div>
        ) : null}

        {!soloOnly && mode === "create" ? (
          <form
            className="entry-form"
            onSubmit={(event) => {
              event.preventDefault();
              onCreate(name);
            }}
          >
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="Player name" data-testid="create-name" />
            </label>
            <button className="primary-button" type="submit" data-testid="create-room">
              <Users size={18} />
              Create room
            </button>
          </form>
        ) : !soloOnly ? (
          <form
            className="entry-form"
            onSubmit={(event) => {
              event.preventDefault();
              onJoin(name, roomCode);
            }}
          >
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} placeholder="Player name" data-testid="join-name" />
            </label>
            <label>
              Code
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                maxLength={5}
                placeholder="A1B2C"
                data-testid="join-code"
              />
            </label>
            <button className="primary-button" type="submit" data-testid="join-room">
              <DoorOpen size={18} />
              Join room
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function RoomHeader({
  room,
  soundEnabled,
  onLeave,
  onRules,
  onToggleSound
}: {
  room: RoomState;
  soundEnabled: boolean;
  onLeave: () => void;
  onRules: () => void;
  onToggleSound: () => void;
}) {
  const isSolo = room.code.startsWith("SOLO-");
  const showInviteCode = room.phase === "lobby" && !isSolo;

  async function copyCode() {
    await navigator.clipboard?.writeText(room.code);
  }

  return (
    <section className="room-header">
      <p className="eyebrow">Room</p>
      <div className="room-code">
        {isSolo ? <span className="solo-mode-pill" data-testid="solo-mode-pill">Solo Demo</span> : null}
        {showInviteCode ? (
          <>
            <div className="invite-code" data-testid="invite-code">
              <span>Invite code</span>
              <strong data-testid="room-code">{room.code}</strong>
            </div>
            <button type="button" title="Copy room code" aria-label="Copy invite code" onClick={copyCode}>
              <Clipboard size={16} />
              <span>Copy</span>
            </button>
          </>
        ) : null}
        <button type="button" title="Show rules" aria-label="Show rules" onClick={onRules} data-testid="open-rules">
          <HelpCircle size={16} />
          <span>Rules</span>
        </button>
        <button
          type="button"
          title={soundEnabled ? "Mute table sounds" : "Enable table sounds"}
          aria-label={soundEnabled ? "Mute table sounds" : "Enable table sounds"}
          onClick={onToggleSound}
          data-testid="toggle-table-sound"
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span>{soundEnabled ? "Sound" : "Muted"}</span>
        </button>
        <button type="button" title="Leave room" aria-label="Leave room" onClick={onLeave}>
          <DoorOpen size={16} />
          <span>Exit</span>
        </button>
      </div>
    </section>
  );
}

function LobbyCommand({ isHost, playerCount, onStart }: { isHost: boolean; playerCount: number; onStart: () => void }) {
  const ready = isHost && playerCount >= 2;
  return (
    <section className="lobby-command" data-ready={ready} data-testid="lobby-command">
      <div>
        <p className="eyebrow">Next move</p>
        <strong>{playerCount < 2 ? "Need one more player" : isHost ? "Ready to start" : "Waiting for host"}</strong>
        <span>{playerCount < 2 ? "Share the room code with someone on this network or online server." : "Rules are available anytime from the top bar."}</span>
      </div>
      <button className="primary-button" type="button" disabled={!ready} onClick={onStart}>
        <Play size={18} />
        Start
      </button>
    </section>
  );
}

function SoloDemoPanel({
  scheduler,
  players,
  humanEliminated,
  soundEnabled,
  onToggleSound,
  onToggleFastForward
}: {
  scheduler: SoloSchedulerState;
  players: PublicPlayer[];
  humanEliminated: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onToggleFastForward: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const activeBot = scheduler.botId ? players.find((player) => player.id === scheduler.botId) : undefined;
  const activeLabel = activeBot?.name ?? (scheduler.phase === "humanTurn" ? "You" : "Table");
  return (
    <section className="solo-demo-panel" data-expanded={detailsOpen} data-testid="solo-demo-panel">
      <div className="voice-panel-head">
        <div>
          <p className="eyebrow">Solo Demo</p>
          <strong>{soloPhaseLabel(scheduler, activeBot?.name)}</strong>
        </div>
        <span className="voice-live-dot" data-live={scheduler.phase !== "gameOver"} />
      </div>
      <p>{soloPhaseDescription(scheduler, activeBot?.name)}</p>
      <div className="solo-quick-row" data-testid="solo-quick-row">
        <span>
          <small>Focus</small>
          <strong>{activeLabel}</strong>
        </span>
        <button className="secondary-button solo-sound-button" type="button" onClick={onToggleSound} data-active={soundEnabled} data-testid="solo-sound-toggle">
          {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          {soundEnabled ? "Sound on" : "Sound off"}
        </button>
        <button className="secondary-button solo-details-button" type="button" onClick={() => setDetailsOpen((open) => !open)} data-testid="solo-details-toggle">
          {detailsOpen ? "Hide details" : "Details"}
        </button>
      </div>
      <div className="solo-status-grid" hidden={!detailsOpen} data-testid="solo-status-grid">
        {players.map((player) => (
          <span key={player.id} data-eliminated={player.eliminated}>
            <strong>{player.name}</strong>
            <small>
              {player.handCount} card{player.handCount === 1 ? "" : "s"} · {player.revolverRemaining ?? 0} shot
              {(player.revolverRemaining ?? 0) === 1 ? "" : "s"}
            </small>
          </span>
        ))}
      </div>
      {humanEliminated ? (
        <button
          className="secondary-button solo-fast-forward"
          type="button"
          onClick={onToggleFastForward}
          data-active={scheduler.fastForward}
          data-testid="solo-fast-forward"
        >
          <RefreshCcw size={16} />
          {scheduler.fastForward ? "Normal pace" : "Fast forward"}
        </button>
      ) : null}
    </section>
  );
}

function VoicePanel({
  voice,
  disabled,
  players,
  myPlayerId,
  onJoin,
  onLeave,
  onToggleMute,
  onResetVoice,
  onRetryAudio,
  onTestSpeaker,
  onTestMicLoopback
}: {
  voice: VoiceClientState;
  disabled: boolean;
  players: PublicPlayer[];
  myPlayerId?: string;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onResetVoice: () => void;
  onRetryAudio: () => void;
  onTestSpeaker: () => void;
  onTestMicLoopback: () => void;
}) {
  const connected = voice.status === "connected";
  const requesting = voice.status === "requesting";
  const activePeerCount = voice.peers.filter((peer) => peer.connected).length;
  const remotePeers = voice.peers.filter((peer) => peer.connected && peer.playerId !== myPlayerId);
  const hasBlockedAudio = Object.values(voice.peerAudioStates).includes("blocked");
  const hasStuckPeer = remotePeers.some((peer) => ["connecting", "negotiating", "ice-checking", "failed"].includes(voice.peerAudioStates[peer.playerId] ?? "connecting"));

  return (
    <section className="voice-panel" data-status={voice.status} data-testid="voice-panel">
      <div className="voice-panel-head">
        <div>
          <p className="eyebrow">Voice</p>
          <strong>{connected ? "Room voice live" : "Push-to-room mic"}</strong>
        </div>
        <span className="voice-live-dot" data-live={connected} />
      </div>
      <p className="voice-status" data-testid="voice-status">
        {voiceStatusLabel(voice)}
        {connected ? ` · ${activePeerCount} in voice · ${voice.remoteAudioCount} speaker link${voice.remoteAudioCount === 1 ? "" : "s"}` : ""}
      </p>
      {connected ? (
        <div className="voice-peer-list" data-testid="voice-peer-list">
          {remotePeers.length === 0 ? <span>No remote speakers yet</span> : null}
          {remotePeers.map((peer) => {
            const player = players.find((candidate) => candidate.id === peer.playerId);
            const status = voice.peerAudioStates[peer.playerId] ?? "connecting";
            const diagnostics = voice.peerDiagnostics[peer.playerId];
            return (
              <div className="voice-peer-row" data-audio-state={status} key={peer.playerId}>
                <span>
                  {player?.name ?? "Player"}
                  {diagnostics ? (
                    <small>
                      {diagnostics.signalingState ?? "new"} / {diagnostics.iceConnectionState ?? "new"}
                    </small>
                  ) : null}
                </span>
                <strong>{voiceAudioStatusLabel(status, diagnostics)}</strong>
              </div>
            );
          })}
        </div>
      ) : null}
      {hasBlockedAudio ? (
        <button className="voice-warning" type="button" onClick={onRetryAudio} data-testid="enable-audio">
          Click to enable audio
        </button>
      ) : null}
      <div className="voice-actions">
        {connected ? (
          <button className="secondary-button" type="button" onClick={onLeave} data-testid="leave-voice">
            <Radio size={17} />
            Leave
          </button>
        ) : (
          <button className="primary-button" type="button" disabled={disabled || requesting || voice.status === "unsupported"} onClick={onJoin} data-testid="join-voice">
            <Mic size={17} />
            {requesting ? "Requesting" : "Join"}
          </button>
        )}
        <button className="secondary-button" type="button" disabled={!connected} onClick={onToggleMute} data-testid="toggle-mute">
          {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
          {voice.muted ? "Unmute" : "Mute"}
        </button>
        {connected && hasStuckPeer ? (
          <button className="secondary-button" type="button" onClick={onResetVoice} data-testid="reset-voice">
            <RefreshCcw size={17} />
            Reset voice
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={onTestSpeaker} data-testid="test-speaker">
          <Volume2 size={17} />
          {voice.speakerTestRunning ? "Playing" : "Test speaker"}
        </button>
        <button className="secondary-button" type="button" disabled={!connected} onClick={onTestMicLoopback} data-testid="test-mic-loopback">
          <Radio size={17} />
          {voice.micLoopbackRunning ? "Looping" : "Test mic"}
        </button>
      </div>
    </section>
  );
}

function EventTicker({
  latestEvent,
  historyOpen,
  onToggleHistory
}: {
  latestEvent?: GameEvent;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  return (
    <section className="event-ticker" data-testid="event-ticker">
      <div>
        <p className="eyebrow">Latest</p>
        <strong>{latestEvent?.message ?? "Waiting for the table..."}</strong>
      </div>
      <button className="secondary-button" type="button" onClick={onToggleHistory} data-testid="history-toggle">
        <History size={17} />
        {historyOpen ? "Hide history" : "History"}
      </button>
    </section>
  );
}

function HistoryPanel({ events, open, onToggle }: { events: GameEvent[]; open: boolean; onToggle: () => void }) {
  return (
    <section className="history-panel" data-open={open} data-testid="history-panel">
      <button className="history-panel-head" type="button" onClick={onToggle}>
        <span>Full history</span>
        <strong>{events.length}</strong>
      </button>
      {open ? <EventLog events={events} /> : null}
    </section>
  );
}

function EndGameActions({
  isHost,
  onPlayAgain,
  onExit
}: {
  isHost: boolean;
  onPlayAgain: () => void;
  onExit: () => void;
}) {
  return (
    <section className="endgame-actions" aria-label="End game actions" data-testid="endgame-actions">
      <div>
        <p className="eyebrow">Game over</p>
        <h2>Play another round?</h2>
        {!isHost ? <p>Waiting for the host to restart, or you can exit the room.</p> : <p>Start a fresh game with the same seated players, or leave the room.</p>}
      </div>
      <div className="endgame-buttons">
        <button className="primary-button" type="button" disabled={!isHost} onClick={onPlayAgain} data-testid="play-again">
          <RefreshCcw size={18} />
          Play again
        </button>
        <button className="secondary-button" type="button" onClick={onExit} data-testid="exit-room">
          <DoorOpen size={18} />
          Exit
        </button>
      </div>
    </section>
  );
}

function Hand({
  cards,
  selectedCardIds,
  disabled,
  onToggle
}: {
  cards: Card[];
  selectedCardIds: string[];
  disabled: boolean;
  onToggle: (cardId: string) => void;
}) {
  return (
    <section className="hand" aria-label="Your hand">
      {cards.length === 0 ? <p className="empty-hand">No cards in hand</p> : null}
      <div className="hand-cards">
        {cards.map((card) => (
          <button
            type="button"
            className="playing-card"
            data-selected={selectedCardIds.includes(card.id)}
            disabled={disabled}
            key={card.id}
            onClick={() => onToggle(card.id)}
            data-testid={`hand-card-${card.id}`}
          >
            <span>{rankGlyph(card.rank)}</span>
            <strong>{displayRank(card.rank)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChallengePanel({
  game,
  players,
  spoiler,
  resultConcealed
}: {
  game: NonNullable<RoomState["game"]>;
  players: PublicPlayer[];
  spoiler: RouletteSpoilerState;
  resultConcealed: boolean;
}) {
  const challenge = game.lastChallenge;
  if (!challenge) {
    return null;
  }

  const roulettePlayer = players.find((player) => player.id === challenge.roulettePlayerId);
  const accused = players.find((player) => player.id === challenge.accusedId);
  const caller = players.find((player) => player.id === challenge.callerId);
  const displayPhase = resultConcealed ? spoiler.displayPhase : "revealed";

  return (
    <section className="challenge-panel" data-result-unlocked={!resultConcealed} data-testid="challenge-panel">
      <div className="liar-stamp">LIAR CALLED</div>
      <div>
        <p className="eyebrow">Challenge</p>
        <h2>
          {caller?.name} vs {accused?.name}
        </h2>
      </div>
      <div className="revealed-cards">
        {challenge.revealedCards.map((card) => (
          <div className="mini-card" data-liar={challenge.liarCardIds.includes(card.id)} key={card.id}>
            <span>{rankGlyph(card.rank)}</span>
            <strong>{displayRank(card.rank)}</strong>
          </div>
        ))}
      </div>
      <div className="roulette-result" data-lethal={!resultConcealed && challenge.rouletteResult === "LETHAL"}>
        <Flame size={18} />
        <span>
          {resultConcealed ? roulettePendingLabel(displayPhase, roulettePlayer?.name) : rouletteResultSentence(roulettePlayer?.name, challenge.rouletteResult)}
        </span>
      </div>
      <div
        className="toy-roulette-readout"
        data-lethal={!resultConcealed && challenge.rouletteResult === "LETHAL"}
        data-result-unlocked={!resultConcealed}
        data-testid="toy-roulette-readout"
      >
        <span />
        <strong>{resultConcealed ? roulettePendingReadout(displayPhase) : rouletteResultReadout(challenge.rouletteResult)}</strong>
      </div>
    </section>
  );
}

function TimerBar({ turnStartedAt, turnEndsAt, running }: { turnStartedAt: number; turnEndsAt: number; running: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!running) {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running]);

  const total = Math.max(1, turnEndsAt - turnStartedAt);
  const remaining = Math.max(0, turnEndsAt - now);
  const percent = Math.max(0, Math.min(100, (remaining / total) * 100));
  const seconds = Math.min(Math.ceil(total / 1000), Math.ceil(remaining / 1000));

  return (
    <div className="timer-wrap" title="Turn timer">
      <Timer size={16} />
      <div className="timer-track">
        <span style={{ width: `${percent}%` }} />
      </div>
      <strong>{seconds}s</strong>
    </div>
  );
}

function EventLog({ events }: { events: GameEvent[] }) {
  return (
    <section className="event-log" aria-label="Event log">
      <p className="eyebrow">Log</p>
      {events.map((event) => (
        <article key={event.id} data-kind={event.kind}>
          {event.message}
        </article>
      ))}
    </section>
  );
}

function displayRank(rank: Card["rank"]): string {
  if (rank === "JOKER") {
    return "Joker";
  }
  return rank.charAt(0) + rank.slice(1).toLowerCase();
}

function rankGlyph(rank: Card["rank"]): string {
  if (rank === "KING") return "K";
  if (rank === "QUEEN") return "Q";
  if (rank === "ACE") return "A";
  return "J";
}

function voiceStatusLabel(voice: VoiceClientState): string {
  if (voice.status === "requesting") {
    return "Waiting for microphone permission";
  }
  if (voice.error) {
    return voice.error;
  }
  if (voice.status === "connected") {
    return voice.speaking ? "Speaking" : voice.muted ? "Muted" : "Connected";
  }
  if (voice.status === "unsupported") {
    return "Voice needs WebRTC and microphone support";
  }
  if (voice.status === "error") {
    return voice.error ?? "Voice could not start";
  }
  return "Voice is off";
}

function voiceAudioStatusLabel(status: VoicePeerAudioStatus, diagnostics?: VoiceClientState["peerDiagnostics"][string]): string {
  switch (status) {
    case "audio-playing":
      return "Receiving audio";
    case "speaker-linked":
      return diagnostics?.remoteTrackCount ? "Speaker linked" : "Connected, waiting";
    case "blocked":
      return "Audio blocked";
    case "silent":
      return "No voice detected";
    case "negotiating":
      return "Negotiating";
    case "ice-checking":
      return "ICE checking";
    case "failed":
      return "Failed";
    case "connecting":
    default:
      return "Connecting";
  }
}

function soloPhaseLabel(scheduler: SoloSchedulerState, botName = "Bot"): string {
  if (scheduler.phase === "humanTurn") {
    return "Your move";
  }
  if (scheduler.phase === "botThinking") {
    return `${botName} is thinking`;
  }
  if (scheduler.phase === "spectating") {
    return `${botName} is playing`;
  }
  if (scheduler.phase === "resolvingChallenge") {
    return "Resolving challenge";
  }
  if (scheduler.phase === "gameOver") {
    return "Table finished";
  }
  return "Browser-only table";
}

function soloPhaseDescription(scheduler: SoloSchedulerState, botName = "Bot"): string {
  if (scheduler.blockedReason === "pageHidden") {
    return "The demo is paused while this tab is hidden.";
  }
  if (scheduler.phase === "humanTurn") {
    return "Pick 1-3 cards or challenge the last play before the timer expires.";
  }
  if (scheduler.phase === "botThinking" || scheduler.phase === "spectating") {
    return `${botName} will act shortly. Bots wait for roulette and challenge beats before moving.`;
  }
  if (scheduler.phase === "resolvingChallenge") {
    return "Cards and LIAR are locked until the roulette result is visible.";
  }
  if (scheduler.phase === "gameOver") {
    return "Use Play again or Exit when you are ready.";
  }
  return "You are playing locally against Master Chief, Anduin Wrynn, and Gordon Freeman. No server, clone, install, room code, or voice channel is needed.";
}

function getCockpitPhase(
  room: RoomState,
  game: RoomState["game"] | undefined,
  resultConcealed: boolean,
  showEndGameActions: boolean,
  challengeVisualActive: boolean
): CockpitPhase {
  if (room.phase === "lobby" || !game) {
    return "lobby";
  }
  if (resultConcealed) {
    return "roulette";
  }
  if (showEndGameActions || game.phase === "gameOver") {
    return "gameOver";
  }
  if (challengeVisualActive) {
    return "challenge";
  }
  return "playing";
}

function phaseLabel(phase: CockpitPhase): string {
  if (phase === "entry") return "Choose table";
  if (phase === "lobby") return "Lobby";
  if (phase === "challenge") return "Challenge";
  if (phase === "roulette") return "Roulette";
  if (phase === "gameOver") return "Game over";
  return "In play";
}

function getActionHint({
  game,
  isMyTurn,
  canPlay,
  canCall,
  controlsBlocked,
  selectedCount,
  isSoloMode = false,
  soloScheduler,
  humanEliminated = false
}: {
  game: RoomState["game"] | undefined;
  isMyTurn: boolean;
  canPlay: boolean;
  canCall: boolean;
  controlsBlocked: boolean;
  selectedCount: number;
  isSoloMode?: boolean;
  soloScheduler?: SoloSchedulerState;
  humanEliminated?: boolean;
}): string {
  if (!game) {
    return "Waiting for the table to start.";
  }
  if (game.phase === "gameOver") {
    return "The table is finished.";
  }
  if (controlsBlocked) {
    return isSoloMode ? "Wait for the gun result." : "Resolving LIAR challenge. Wait for the gun result.";
  }
  if (!isMyTurn) {
    if (isSoloMode && soloScheduler?.botName) {
      return humanEliminated ? `Spectating: ${soloScheduler.botName} is thinking...` : `${soloScheduler.botName} is thinking...`;
    }
    if (isSoloMode && humanEliminated) {
      return "Spectating the table. Bots will keep playing at a watchable pace.";
    }
    return "Watch the table and prepare your next bluff.";
  }
  if (game.forcedCall) {
    return canCall ? "Forced challenge: call LIAR to continue." : "Waiting for a previous play to challenge.";
  }
  if (canPlay) {
    if (isSoloMode && selectedCount === 0) {
      return "Press Play, Enter, or Space to auto-play one card.";
    }
    return `Ready to play ${selectedCount} card${selectedCount === 1 ? "" : "s"} face down.`;
  }
  if (canCall) {
    return "Select 1-3 cards to play, or call LIAR on the last play.";
  }
  return "Select 1-3 cards from your hand.";
}

function getBottomStatusLine({
  game,
  controlsBlocked,
  isMyTurn,
  isSoloMode,
  soloScheduler,
  humanEliminated
}: {
  game: RoomState["game"] | undefined;
  controlsBlocked: boolean;
  isMyTurn: boolean;
  isSoloMode: boolean;
  soloScheduler?: SoloSchedulerState;
  humanEliminated: boolean;
}): string {
  if (!game) {
    return "Waiting for table";
  }
  if (game.phase === "gameOver") {
    return "Game over";
  }
  if (controlsBlocked) {
    return "Resolving LIAR";
  }
  if (isSoloMode && humanEliminated) {
    return "Spectating";
  }
  if (isSoloMode && soloScheduler?.botName && !isMyTurn) {
    return `${soloScheduler.botName} is thinking`;
  }
  if (isMyTurn) {
    return game.forcedCall ? "Forced LIAR" : "Your move";
  }
  return "Waiting for turn";
}

function rouletteResultSentence(playerName = "Player", result: RouletteKind): string {
  return result === "LETHAL" ? `${playerName} got hit` : `${playerName} got a ${rouletteResultLabel(result)}`;
}

const SOLO_QUOTE_BANK: Record<TableQuoteTone | "rouletteDry" | "rouletteHit", string[]> = {
  thinking: ["Reading it.", "Counting tells.", "Too quiet.", "One more look."],
  play: ["Cards down.", "Your read.", "Small story.", "Buy it or don't."],
  challenge: ["LIAR.", "Show them.", "Too neat.", "I want the reveal."],
  roulette: ["Easy now.", "Hold steady.", "One pull."],
  rouletteDry: ["Dry. Lucky.", "Still seated.", "That missed."],
  rouletteHit: ["Hit. Out.", "Wet exit.", "The table takes one."],
  winner: ["Table's mine.", "I read the room.", "Last seat standing."]
};

const SOLO_PERSONALITY_QUOTES: Record<string, Partial<Record<keyof typeof SOLO_QUOTE_BANK, string[]>>> = {
  "bot-1": {
    thinking: ["Assessing the table.", "Hold the line.", "Reading the target.", "No wasted moves."],
    play: ["Card deployed.", "Move made.", "Keeping formation.", "Clean and quiet."],
    challenge: ["That story breaks. LIAR.", "I am calling it.", "Reveal the claim.", "No cover there."],
    roulette: ["Brace.", "Steady.", "One pull."],
    rouletteDry: ["Dry chamber. Continue.", "Still mission-ready.", "Missed. Reset."],
    rouletteHit: ["Hit confirmed. I'm out.", "Armor soaked.", "Leaving the table."],
    winner: ["Table secured.", "Mission complete.", "Last seat standing."]
  },
  "bot-2": {
    thinking: ["Patience first.", "The room has a rhythm.", "Choose with care.", "A calm hand wins."],
    play: ["A measured move.", "Let this stand.", "With steady hands.", "No need to rush."],
    challenge: ["Truth has a shape. LIAR.", "I cannot accept that.", "Show us the cards.", "This claim bends."],
    roulette: ["Hold steady.", "Let chance speak.", "No fear, only resolve."],
    rouletteDry: ["A mercy of chance.", "Still at the table.", "That was close."],
    rouletteHit: ["I yield this hand.", "The table has judged.", "I am out."],
    winner: ["A steady hand prevails.", "The last seat is mine.", "Calm carried the table."]
  },
  "bot-3": {
    thinking: ["...", "Silent calculation.", "He adjusts his glasses.", "The math is loud enough."],
    play: ["No comment.", "A quiet play.", "The card speaks.", "..."],
    challenge: ["He taps the table: LIAR.", "The numbers disagree.", "Silent doubt.", "Reveal it."],
    roulette: ["...", "Variable unknown.", "Testing chance."],
    rouletteDry: ["The apparatus clicks dry.", "A close variable.", "Still silent."],
    rouletteHit: ["Experiment concluded.", "A wet variable.", "He exits without a word."],
    winner: ["No speech. Just results.", "Observation complete.", "The quiet one remains."]
  }
};

function getSoloEventQuote(event: GameEvent, players: PublicPlayer[], localPlayerId?: string): { key: string; quote: TableQuote; durationMs: number } | null {
  const animation = event.animation;
  if (!animation) {
    return null;
  }

  let playerId: string | undefined;
  let tone: TableQuoteTone | undefined;
  let quoteKey: keyof typeof SOLO_QUOTE_BANK | undefined;

  if (animation.kind === "play") {
    playerId = animation.playerId;
    tone = "play";
    quoteKey = "play";
  } else if (animation.kind === "challenge") {
    playerId = animation.callerId;
    tone = "challenge";
    quoteKey = "challenge";
  } else if (animation.kind === "winner") {
    playerId = animation.playerId;
    tone = "winner";
    quoteKey = "winner";
  }

  if (!playerId || !tone || !quoteKey) {
    return null;
  }

  const player = players.find((candidate) => candidate.id === playerId);
  if (!player || (player.id === localPlayerId && tone !== "winner")) {
    return null;
  }

  return {
    key: `event:${event.id}`,
    quote: {
      playerId: player.id,
      speaker: player.name,
      text: pickDeterministic(getSoloQuoteLines(player.id, quoteKey), event.id),
      tone
    },
    durationMs: tone === "challenge" ? 3200 : 2800
  };
}

function getSoloResultQuote(
  challenge: NonNullable<RoomState["game"]>["lastChallenge"] | undefined,
  challengeKey: string | undefined,
  players: PublicPlayer[],
  resultConcealed: boolean,
  lastQuoteKey?: string
): { key: string; quote: TableQuote; durationMs: number } | null {
  if (!challenge || !challengeKey || resultConcealed) {
    return null;
  }

  const key = `result:${challengeKey}`;
  if (lastQuoteKey === key) {
    return null;
  }

  const player = players.find((candidate) => candidate.id === challenge.roulettePlayerId);
  if (!player) {
    return null;
  }

  const hit = challenge.rouletteResult === "LETHAL";
  return {
    key,
    quote: {
      playerId: player.id,
      speaker: player.name,
      text: pickDeterministic(getSoloQuoteLines(player.id, hit ? "rouletteHit" : "rouletteDry"), key),
      tone: "roulette"
    },
    durationMs: 3600
  };
}

function getSoloQuoteLines(playerId: string, quoteKey: keyof typeof SOLO_QUOTE_BANK): string[] {
  return SOLO_PERSONALITY_QUOTES[playerId]?.[quoteKey] ?? SOLO_QUOTE_BANK[quoteKey];
}

function pickDeterministic(values: string[], seed: string): string {
  const hash = Array.from(seed).reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
  return values[hash % values.length] ?? values[0] ?? "";
}

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

function readSavedSession(): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}

function writeSavedSession(session: SavedSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSavedSession() {
  window.localStorage.removeItem(SESSION_KEY);
}
