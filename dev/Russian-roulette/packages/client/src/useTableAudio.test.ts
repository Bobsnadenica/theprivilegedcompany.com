import { describe, expect, it } from "vitest";
import type { GameEvent } from "@rrld/shared";
import { getTableAudioEventForGameEvent, getTableAudioEventForRoulette } from "./useTableAudio";

describe("table audio event mapping", () => {
  it("maps public game events to non-spoiler audio cues", () => {
    expect(getTableAudioEventForGameEvent({ id: "round-1", kind: "round", message: "Round 1" } as GameEvent)).toBe("round");
    expect(getTableAudioEventForGameEvent({ id: "play-1", kind: "play", message: "Mira played 1 card" } as GameEvent)).toBe("card");
    expect(getTableAudioEventForGameEvent({ id: "challenge-1", kind: "challenge", message: "LIAR called" } as GameEvent)).toBe("challenge");
    expect(getTableAudioEventForGameEvent({ id: "winner-1", kind: "winner", message: "Mira wins" } as GameEvent)).toBe("winner");
  });

  it("does not map roulette outcome sounds before the visual result reveal", () => {
    expect(getTableAudioEventForGameEvent({ id: "roulette-1", kind: "roulette", message: "Result is hidden" } as GameEvent)).toBeUndefined();
    expect(getTableAudioEventForRoulette("BLANK")).toBe("dry");
    expect(getTableAudioEventForRoulette("LETHAL")).toBe("hit");
  });
});
