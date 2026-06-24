import { describe, expect, it } from "vitest";
import type { GameEvent } from "@rrld/shared";
import {
  createTimelineHandle,
  deriveAnimationBeats,
  getChallengeKey,
  getCinematicDuration,
  getPileVisualTransform,
  getSeatChamberIndicator,
  getTimelineDuration,
  getTimelineLabels,
  makeCinematicTasks,
  maskSuspenseEvents,
  rouletteDisplayPhaseFromSceneState,
  roulettePendingLabel,
  roulettePendingReadout,
  rouletteResultLabel,
  rouletteResultReadout,
  rouletteVisualResult,
  shouldShowPlayerEliminated,
  type TimelineStep
} from "./animationTypes";

describe("deriveAnimationBeats", () => {
  it("maps structured server events to animation beats once", () => {
    const processed = new Set<string>();
    const events: GameEvent[] = [
      {
        id: "event-1",
        kind: "round",
        message: "Round 1",
        createdAt: 1,
        animation: {
          kind: "round",
          roundNumber: 1,
          tableRank: "KING",
          playerIds: ["p1", "p2"]
        }
      },
      {
        id: "event-2",
        kind: "play",
        message: "p1 played",
        createdAt: 2,
        animation: {
          kind: "play",
          playerId: "p1",
          cardCount: 2,
          turnNumber: 1
        }
      }
    ];

    const first = deriveAnimationBeats(events, processed);
    first.forEach((beat) => processed.add(beat.id));
    const second = deriveAnimationBeats(events, processed);

    expect(first.map((beat) => beat.type)).toEqual(["round", "play"]);
    expect(second).toEqual([]);
  });

  it("creates epoch-bound cinematic timeline tasks", () => {
    const beats = [
      {
        id: "event-1",
        type: "roulette" as const,
        playerId: "p1",
        result: "BLANK" as const
      }
    ];

    expect(makeCinematicTasks(beats, 7)).toEqual([
      {
        id: "event-1",
        beat: beats[0],
        epoch: 7
      }
    ]);
  });

  it("scales cinematic duration for reduced motion and mobile profiles", () => {
    expect(getCinematicDuration(1000, "desktop")).toBe(1000);
    expect(getCinematicDuration(1000, "mobile")).toBe(720);
    expect(getCinematicDuration(1000, "reduced-motion")).toBe(280);
    expect(getCinematicDuration(10, "reduced-motion")).toBe(16);
  });

  it("maps authoritative roulette results to roulette-gun presentation labels", () => {
    expect(rouletteVisualResult("BLANK")).toBe("dry");
    expect(rouletteVisualResult("LETHAL")).toBe("water");
    expect(rouletteResultLabel("BLANK")).toBe("dry click");
    expect(rouletteResultLabel("LETHAL")).toBe("hit");
    expect(rouletteResultReadout("BLANK")).toBe("Dry chamber: missed");
    expect(rouletteResultReadout("LETHAL")).toBe("Hit: eliminated");
  });

  it("keeps roulette result UI hidden until the scene unlocks it", () => {
    expect(rouletteDisplayPhaseFromSceneState("entering")).toBe("spinning");
    expect(rouletteDisplayPhaseFromSceneState("spinning")).toBe("spinning");
    expect(rouletteDisplayPhaseFromSceneState("aiming")).toBe("aiming");
    expect(rouletteDisplayPhaseFromSceneState("trigger")).toBe("triggering");
    expect(rouletteDisplayPhaseFromSceneState("waterShot")).toBe("triggering");
    expect(rouletteDisplayPhaseFromSceneState("splash", true)).toBe("revealed");
    expect(rouletteDisplayPhaseFromSceneState("blank")).toBe("revealed");
    expect(rouletteDisplayPhaseFromSceneState("lethal")).toBe("revealed");
  });

  it("shows suspense copy before roulette results are revealed", () => {
    expect(roulettePendingLabel("spinning", "Host")).toBe("Roulette gun spinning...");
    expect(roulettePendingLabel("aiming", "Host")).toBe("Taking aim at Host...");
    expect(roulettePendingReadout("triggering")).toBe("Hold your breath");
  });

  it("masks current roulette, elimination, and winner log spoilers before reveal", () => {
    const challenge = {
      callerId: "p2",
      accusedId: "p1",
      revealedCards: [{ id: "card-1", rank: "KING" as const }],
      liarCardIds: ["card-1"],
      roulettePlayerId: "p1",
      rouletteResult: "LETHAL" as const,
      eliminatedPlayerId: "p1"
    };
    const players = [
      { id: "p1", name: "Host", eliminated: true, connected: true, isHost: true, handCount: 0, revolverRemaining: 5, blanksSpent: 0, rouletteShotsTaken: 1 },
      { id: "p2", name: "Guest", eliminated: false, connected: true, isHost: false, handCount: 5, revolverRemaining: 6, blanksSpent: 0, rouletteShotsTaken: 0 }
    ];
    const events: GameEvent[] = [
      {
        id: "event-1",
        kind: "roulette",
        message: "Host got hit.",
        createdAt: 1,
        animation: { kind: "roulette", playerId: "p1", result: "LETHAL", shotNumber: 2, remainingAfter: 4 }
      },
      {
        id: "event-2",
        kind: "elimination",
        message: "Host was eliminated.",
        createdAt: 2,
        animation: { kind: "elimination", playerId: "p1" }
      },
      {
        id: "event-3",
        kind: "winner",
        message: "Guest wins the table.",
        createdAt: 3,
        animation: { kind: "winner", playerId: "p2" }
      }
    ];

    const masked = maskSuspenseEvents(events, challenge, true, players, "p2");
    expect(masked.map((event) => event.message)).toEqual([
      "Host faces the roulette gun...",
      "Outcome still hidden...",
      "Table outcome still hidden..."
    ]);
    expect(masked.map((event) => event.kind)).toEqual(["roulette", "system", "system"]);
    expect(JSON.stringify(masked)).not.toMatch(/got hit|eliminated|wins/);
    expect(maskSuspenseEvents(events, challenge, false, players, "p2")).toEqual(events);
  });

  it("conceals only the active unresolved eliminated player styling", () => {
    const player = { id: "p1", name: "Host", eliminated: true, connected: true, isHost: true, handCount: 0, revolverRemaining: 5, blanksSpent: 0, rouletteShotsTaken: 1 };
    expect(shouldShowPlayerEliminated(player, "p1")).toBe(false);
    expect(shouldShowPlayerEliminated(player, "p2")).toBe(true);
    expect(getChallengeKey(undefined)).toBeUndefined();
  });

  it("builds chamber indicators without revealing hidden hit position", () => {
    const safe = getSeatChamberIndicator({
      id: "p1",
      name: "Host",
      eliminated: false,
      connected: true,
      isHost: true,
      handCount: 2,
      revolverRemaining: 4,
      blanksSpent: 2,
      rouletteShotsTaken: 2
    });
    const last = getSeatChamberIndicator({
      id: "p2",
      name: "Guest",
      eliminated: false,
      connected: true,
      isHost: false,
      handCount: 4,
      revolverRemaining: 1,
      blanksSpent: 5,
      rouletteShotsTaken: 5
    });

    expect(safe.dots).toEqual(["spent", "spent", "remaining", "remaining", "remaining", "remaining"]);
    expect(safe.isLastChamber).toBe(false);
    expect(last.dots).toEqual(["spent", "spent", "spent", "spent", "spent", "last"]);
    expect(last.isLastChamber).toBe(true);
  });

  it("describes timeline sequence and parallel ordering", () => {
    const timeline: TimelineStep = {
      type: "sequence",
      label: "challenge",
      steps: [
        {
          type: "parallel",
          label: "impact",
          steps: [
            { type: "tween", label: "camera-punch", durationMs: 400 },
            { type: "wait", label: "red-sweep", durationMs: 250 }
          ]
        },
        { type: "tween", label: "reveal-flip", durationMs: 600 }
      ]
    };

    expect(getTimelineLabels(timeline)).toEqual(["challenge", "impact", "camera-punch", "red-sweep", "reveal-flip"]);
    expect(getTimelineDuration(timeline, "desktop")).toBe(1000);
    expect(getTimelineDuration(timeline, "reduced-motion")).toBe(280);
  });

  it("describes simplified roulette gun timeline labels", () => {
    const timeline: TimelineStep = {
      type: "sequence",
      label: "roulette",
      steps: [
        { type: "tween", label: "gun-ready", durationMs: 760 },
        { type: "tween", label: "roulette-gun-aim", durationMs: 1120 },
        { type: "wait", label: "roulette-suspense-hold", durationMs: 1180 },
        { type: "tween", label: "trigger-squeeze", durationMs: 780 },
        { type: "tween", label: "water-result-effect", durationMs: 1650 }
      ]
    };

    expect(getTimelineLabels(timeline)).toEqual([
      "roulette",
      "gun-ready",
      "roulette-gun-aim",
      "roulette-suspense-hold",
      "trigger-squeeze",
      "water-result-effect"
    ]);
    expect(getTimelineDuration(timeline, "desktop")).toBe(5490);
    expect(getTimelineDuration(timeline, "reduced-motion")).toBe(1537);
  });

  it("stacks pile cards into stable readable layers", () => {
    for (const count of [1, 2, 3, 5, 8, 12]) {
      const cards = Array.from({ length: count }, (_, index) => getPileVisualTransform(index, count));
      expect(new Set(cards.map((slot) => `${slot.x.toFixed(3)}:${slot.y.toFixed(3)}:${slot.z.toFixed(3)}`)).size).toBe(count);
      if (count > 1) {
        expect(cards[count - 1].y).toBeGreaterThan(cards[0].y);
      }
    }

    const threeCards = [0, 1, 2].map((index) => getPileVisualTransform(index, 3));
    const eightCards = Array.from({ length: 8 }, (_, index) => getPileVisualTransform(index, 8));
    const twelveCards = Array.from({ length: 12 }, (_, index) => getPileVisualTransform(index, 12));

    expect(Math.max(...threeCards.map((slot) => slot.x)) - Math.min(...threeCards.map((slot) => slot.x))).toBeLessThan(0.12);
    expect(Math.max(...eightCards.map((slot) => slot.z)) - Math.min(...eightCards.map((slot) => slot.z))).toBeLessThan(0.08);
    expect(Math.max(...twelveCards.map((slot) => slot.y)) - Math.min(...twelveCards.map((slot) => slot.y))).toBeGreaterThan(0.2);
  });

  it("creates cancellable timeline handles", async () => {
    const handle = createTimelineHandle("roulette");
    expect(handle.cancelled).toBe(false);
    handle.cancel();
    await handle.finished;
    expect(handle.cancelled).toBe(true);
  });
});
