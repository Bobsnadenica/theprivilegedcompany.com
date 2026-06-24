import { useEffect, useRef, type RefObject } from "react";
import type { GameEvent, PrivatePlayerState, PublicPlayer, RoomState } from "@rrld/shared";
import type { BarSceneHandle } from "./animationTypes";
import { deriveAnimationBeats, makeCinematicTasks } from "./animationTypes";

interface AnimationDirectorInput {
  sceneRef: RefObject<BarSceneHandle | null>;
  room: RoomState | null;
  privateState: PrivatePlayerState | null;
  events: GameEvent[];
  selectedCardIds: string[];
  localPlayerId?: string;
  concealedEliminatedPlayerId?: string;
  hasChallenge?: boolean;
}

export function useAnimationDirector({
  sceneRef,
  room,
  privateState,
  events,
  selectedCardIds,
  localPlayerId,
  concealedEliminatedPlayerId,
  hasChallenge = false
}: AnimationDirectorInput) {
  const players = (room?.players ?? []) as PublicPlayer[];
  const game = room?.game;
  const processedEventIds = useRef(new Set<string>());
  const queueRef = useRef(Promise.resolve());
  const epochRef = useRef(0);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    scene.syncSceneState({
      players,
      currentTurnPlayerId: game?.currentTurnPlayerId,
      phase: room?.phase,
      pileCount: game?.pileCount ?? 0,
      hasChallenge,
      localPlayerId,
      concealedEliminatedPlayerId,
      localHand: privateState?.hand ?? [],
      selectedCardIds
    });
  }, [
    sceneRef,
    players,
    game?.currentTurnPlayerId,
    game?.pileCount,
    hasChallenge,
    localPlayerId,
    concealedEliminatedPlayerId,
    privateState?.hand,
    room?.phase,
    selectedCardIds
  ]);

  useEffect(() => {
    epochRef.current += 1;
    processedEventIds.current.clear();
    queueRef.current = Promise.resolve();
    sceneRef.current?.cancelAnimations();
  }, [room?.code, sceneRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    scene.focusPlayer(game?.currentTurnPlayerId);
  }, [game?.currentTurnPlayerId, sceneRef]);

  useEffect(() => {
    sceneRef.current?.setSelectedCards(selectedCardIds.length);
  }, [sceneRef, selectedCardIds.length]);

  useEffect(() => {
    if (!privateState) {
      sceneRef.current?.setSelectedCards(0);
    }
  }, [privateState, sceneRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const beats = deriveAnimationBeats(events, processedEventIds.current);
    beats.forEach((beat) => processedEventIds.current.add(beat.id));
    const tasks = makeCinematicTasks(beats, epochRef.current);
    let queuedCount = tasks.length;
    scene.setQueuedTimelineCount(queuedCount);

    for (const task of tasks) {
      queueRef.current = queueRef.current
        .then(async () => {
          if (task.epoch !== epochRef.current) {
            return;
          }
          await scene.preloadAssets();
          if (task.epoch !== epochRef.current) {
            return;
          }
          await scene.playBeat(task.beat);
        })
        .catch(() => undefined)
        .finally(() => {
          queuedCount = Math.max(0, queuedCount - 1);
          scene.setQueuedTimelineCount(queuedCount);
        });
    }
  }, [events, sceneRef]);

  useEffect(() => {
    if (room?.phase === "lobby") {
      epochRef.current += 1;
      queueRef.current = Promise.resolve();
      sceneRef.current?.cancelAnimations();
      sceneRef.current?.setQueuedTimelineCount(0);
      sceneRef.current?.resetRoundVisuals();
    }
  }, [room?.phase, sceneRef]);

  return {
    players,
    game
  };
}
