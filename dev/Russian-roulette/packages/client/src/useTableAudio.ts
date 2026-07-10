import { useCallback } from "react";
import type { GameEvent, RouletteKind } from "@rrld/shared";

export type TableAudioEvent = "card" | "round" | "winner" | "challenge" | "dry" | "hit";
export type CharacterVoiceProfile = "tactical" | "noble" | "scientist" | "neutral";
export type CharacterVoiceTone = "thinking" | "play" | "challenge" | "roulette" | "winner";

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

  const playCharacterVoice = useCallback(
    async (playerId: string, speaker: string, tone: CharacterVoiceTone) => {
      if (enabled) {
        await playCharacterVoiceCue(getCharacterVoiceProfile(playerId, speaker), tone);
      }
    },
    [enabled]
  );

  return { warm, playEvent, playChallenge, playRoulette, playCharacterVoice };
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

export function getCharacterVoiceProfile(playerId: string, speaker = ""): CharacterVoiceProfile {
  const normalized = `${playerId} ${speaker}`.toLowerCase();
  if (normalized.includes("bot-1") || normalized.includes("master chief")) {
    return "tactical";
  }
  if (normalized.includes("bot-2") || normalized.includes("anduin")) {
    return "noble";
  }
  if (normalized.includes("bot-3") || normalized.includes("gordon")) {
    return "scientist";
  }
  return "neutral";
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
    playTone(context, 168, 0, 0.18, 0.046, "sawtooth");
    playTone(context, 92, 0.13, 0.24, 0.038, "triangle");
    playTone(context, 520, 0.02, 0.08, 0.018, "square");
  } else if (event === "hit") {
    playNoise(context, 0, 0.28, 0.048, 1120);
    playNoise(context, 0.12, 0.22, 0.032, 620);
    playTone(context, 196, 0.04, 0.22, 0.032, "triangle");
  } else if (event === "dry") {
    playTone(context, 820, 0, 0.035, 0.032, "square");
    playTone(context, 390, 0.075, 0.07, 0.018, "triangle");
  } else if (event === "card") {
    playNoise(context, 0, 0.09, 0.016, 1450);
    playTone(context, 142, 0.055, 0.06, 0.03, "triangle");
    playTone(context, 94, 0.102, 0.075, 0.018, "sine");
  } else if (event === "round") {
    playTone(context, 480, 0, 0.055, 0.02, "triangle");
    playTone(context, 720, 0.065, 0.075, 0.022, "triangle");
    playTone(context, 960, 0.14, 0.045, 0.014, "sine");
  } else if (event === "winner") {
    playTone(context, 330, 0, 0.12, 0.035, "triangle");
    playTone(context, 440, 0.12, 0.14, 0.035, "triangle");
    playTone(context, 660, 0.26, 0.2, 0.04, "triangle");
  }
}

async function playCharacterVoiceCue(profile: CharacterVoiceProfile, tone: CharacterVoiceTone) {
  const context = await readyTableAudio();
  if (!context) {
    return;
  }

  const emphasis = tone === "challenge" ? 1.25 : tone === "winner" ? 1.15 : tone === "roulette" ? 0.85 : 1;
  if (profile === "tactical") {
    playTacticalVoiceCue(context, tone, emphasis);
  } else if (profile === "noble") {
    playNobleVoiceCue(context, tone, emphasis);
  } else if (profile === "scientist") {
    playScientistVoiceCue(context, tone, emphasis);
  } else {
    playTone(context, 300, 0, 0.08, 0.012 * emphasis, "triangle");
  }
}

function playTacticalVoiceCue(context: AudioContext, tone: CharacterVoiceTone, emphasis: number) {
  playNoise(context, 0, 0.045, 0.018 * emphasis, 920);
  playTone(context, tone === "challenge" ? 96 : 118, 0.018, 0.12, 0.03 * emphasis, "sawtooth");
  playTone(context, tone === "winner" ? 192 : 154, 0.105, 0.095, 0.026 * emphasis, "square");
  playTone(context, 720, 0.205, 0.04, 0.01 * emphasis, "sine");
  if (tone === "challenge") {
    playTone(context, 520, 0.255, 0.035, 0.012 * emphasis, "square");
  }
}

function playNobleVoiceCue(context: AudioContext, tone: CharacterVoiceTone, emphasis: number) {
  const root = tone === "winner" ? 262 : tone === "challenge" ? 196 : 220;
  playTone(context, root, 0, 0.22, 0.02 * emphasis, "triangle");
  playTone(context, root * 1.5, 0.045, 0.21, 0.017 * emphasis, "triangle");
  playTone(context, root * 2, 0.11, 0.18, 0.013 * emphasis, "sine");
  playTone(context, root * 3, 0.18, 0.12, 0.008 * emphasis, "sine");
  if (tone === "roulette") {
    playTone(context, 174, 0.025, 0.18, 0.01 * emphasis, "triangle");
  }
}

function playScientistVoiceCue(context: AudioContext, tone: CharacterVoiceTone, emphasis: number) {
  const first = tone === "challenge" ? 740 : 640;
  playTone(context, first, 0, 0.04, 0.014 * emphasis, "square");
  playTone(context, 480, 0.065, 0.045, 0.012 * emphasis, "sine");
  playNoise(context, 0.105, 0.045, 0.009 * emphasis, 2200);
  playTone(context, tone === "winner" ? 880 : 530, 0.16, 0.04, 0.01 * emphasis, "triangle");
  if (tone === "thinking") {
    playTone(context, 330, 0.24, 0.035, 0.006 * emphasis, "square");
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
