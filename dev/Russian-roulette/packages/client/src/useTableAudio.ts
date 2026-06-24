import { useCallback } from "react";
import type { GameEvent, RouletteKind } from "@rrld/shared";

export type TableAudioEvent = "card" | "round" | "winner" | "challenge" | "dry" | "hit";

let tableAudioContext: AudioContext | null = null;

export function useTableAudio(enabled: boolean) {
  const warm = useCallback(async () => {
    await warmTableAudio();
  }, []);

  const playEvent = useCallback(
    async (event: GameEvent) => {
      if (!enabled) {
        return;
      }
      const audioEvent = getTableAudioEventForGameEvent(event);
      if (audioEvent) {
        await playTableAudioEvent(audioEvent);
      }
    },
    [enabled]
  );

  const playChallenge = useCallback(async () => {
    if (enabled) {
      await playTableAudioEvent("challenge");
    }
  }, [enabled]);

  const playRoulette = useCallback(
    async (result: RouletteKind) => {
      if (enabled) {
        await playTableAudioEvent(getTableAudioEventForRoulette(result));
      }
    },
    [enabled]
  );

  return { warm, playEvent, playChallenge, playRoulette };
}

export function getTableAudioEventForGameEvent(event: GameEvent): TableAudioEvent | undefined {
  if (event.kind === "play") {
    return "card";
  }
  if (event.kind === "round") {
    return "round";
  }
  if (event.kind === "winner") {
    return "winner";
  }
  if (event.kind === "challenge") {
    return "challenge";
  }
  return undefined;
}

export function getTableAudioEventForRoulette(result: RouletteKind): TableAudioEvent {
  return result === "LETHAL" ? "hit" : "dry";
}

async function warmTableAudio() {
  const context = getTableAudioContext();
  if (!context) {
    return;
  }
  await context.resume();
}

async function playTableAudioEvent(event: TableAudioEvent) {
  const context = await readyTableAudio();
  if (!context) {
    return;
  }

  if (event === "challenge") {
    playTone(context, 150, 0, 0.16, 0.055, "sawtooth");
    playTone(context, 95, 0.13, 0.22, 0.045, "triangle");
  } else if (event === "hit") {
    playNoise(context, 0, 0.24, 0.055, 920);
    playTone(context, 180, 0.06, 0.24, 0.045, "square");
  } else if (event === "dry") {
    playTone(context, 760, 0, 0.045, 0.045, "square");
    playTone(context, 360, 0.08, 0.08, 0.024, "triangle");
  } else if (event === "card") {
    playTone(context, 155, 0, 0.06, 0.034, "triangle");
    playTone(context, 120, 0.05, 0.08, 0.022, "sine");
  } else if (event === "round") {
    playTone(context, 520, 0, 0.075, 0.026, "triangle");
    playTone(context, 760, 0.075, 0.08, 0.02, "triangle");
  } else if (event === "winner") {
    playTone(context, 330, 0, 0.12, 0.035, "triangle");
    playTone(context, 440, 0.12, 0.14, 0.035, "triangle");
    playTone(context, 660, 0.26, 0.2, 0.04, "triangle");
  }
}

async function readyTableAudio(): Promise<AudioContext | null> {
  const context = getTableAudioContext();
  if (!context) {
    return null;
  }
  try {
    await context.resume();
    return context;
  } catch {
    return null;
  }
}

function getTableAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (tableAudioContext) {
    return tableAudioContext;
  }
  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }
  tableAudioContext = new AudioContextConstructor();
  return tableAudioContext;
}

function playTone(context: AudioContext, frequency: number, startOffset: number, duration: number, gainValue: number, type: OscillatorType) {
  const start = context.currentTime + startOffset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(gainValue, 0.0001), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playNoise(context: AudioContext, startOffset: number, duration: number, gainValue: number, frequency: number) {
  const start = context.currentTime + startOffset;
  const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(0.8, start);
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}
