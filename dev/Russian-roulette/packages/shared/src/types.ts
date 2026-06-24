export const CARD_RANKS = ["KING", "QUEEN", "ACE"] as const;
export const JOKER_RANK = "JOKER";
export const ALL_CARD_RANKS = [...CARD_RANKS, JOKER_RANK] as const;
export const ROULETTE_CHAMBERS = 6;
export const ROULETTE_DRY_CHAMBERS = 5;

export type TableRank = (typeof CARD_RANKS)[number];
export type CardRank = (typeof ALL_CARD_RANKS)[number];
export type RouletteKind = "BLANK" | "LETHAL";
export type GamePhase = "playing" | "gameOver";
export type EventKind =
  | "round"
  | "play"
  | "challenge"
  | "roulette"
  | "elimination"
  | "winner"
  | "system";

export interface Card {
  id: string;
  rank: CardRank;
}

export interface RevolverCard {
  id: string;
  kind: RouletteKind;
}

export interface PlayerInput {
  id: string;
  name: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  revolver: RevolverCard[];
  eliminated: boolean;
}

export interface PlayedSet {
  id: string;
  playerId: string;
  cards: Card[];
  turnNumber: number;
}

export interface ChallengeResult {
  callerId: string;
  accusedId: string;
  revealedCards: Card[];
  liarCardIds: string[];
  roulettePlayerId: string;
  rouletteResult: RouletteKind;
  eliminatedPlayerId?: string;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  roundNumber: number;
  turnNumber: number;
  tableRank: TableRank;
  currentTurnPlayerId?: string;
  previousPlay?: PlayedSet;
  pile: PlayedSet[];
  lastChallenge?: ChallengeResult;
  winnerId?: string;
  turnStartedAt: number;
  turnEndsAt: number;
  actionsLockedUntil?: number;
  eventSequence: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  eliminated: boolean;
  connected: boolean;
  isHost: boolean;
  handCount: number;
  revolverRemaining: number;
  blanksSpent: number;
  rouletteShotsTaken: number;
}

export interface PublicGameState {
  phase: GamePhase;
  roundNumber: number;
  tableRank: TableRank;
  currentTurnPlayerId?: string;
  previousPlay?: {
    playerId: string;
    cardCount: number;
    turnNumber: number;
  };
  pileCount: number;
  forcedCall: boolean;
  activeCardHolderCount: number;
  turnStartedAt: number;
  turnEndsAt: number;
  actionsLockedUntil?: number;
  lastChallenge?: ChallengeResult;
  winnerId?: string;
}

export interface PrivatePlayerState {
  playerId: string;
  hand: Card[];
}

export interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  handCount?: number;
  revolverRemaining?: number;
  eliminated?: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: "lobby" | GamePhase;
  players: LobbyPlayer[] | PublicPlayer[];
  game?: PublicGameState;
  you?: {
    playerId: string;
    reconnectToken: string;
  };
}

export interface GameEvent {
  id: string;
  kind: EventKind;
  message: string;
  createdAt: number;
  animation?: GameEventAnimation;
}

export type GameEventAnimation =
  | {
      kind: "round";
      roundNumber: number;
      tableRank: TableRank;
      playerIds: string[];
    }
  | {
      kind: "play";
      playerId: string;
      cardCount: number;
      turnNumber: number;
    }
  | {
      kind: "challenge";
      callerId: string;
      accusedId: string;
      revealedCards: Card[];
      liarCardIds: string[];
    }
  | {
      kind: "roulette";
      playerId: string;
      result: RouletteKind;
      shotNumber: number;
      remainingAfter: number;
    }
  | {
      kind: "elimination";
      playerId: string;
    }
  | {
      kind: "winner";
      playerId: string;
    };

export interface CreateRoomPayload {
  name: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  name: string;
}

export interface ReconnectPayload {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface PlayCardsPayload {
  roomCode: string;
  cardIds: string[];
}

export interface RoomActionPayload {
  roomCode: string;
}

export interface VoicePeerState {
  playerId: string;
  muted: boolean;
  speaking: boolean;
  connected: boolean;
  updatedAt: number;
}

export interface VoiceSessionState {
  peers: VoicePeerState[];
}

export interface VoiceSessionDescriptionPayload {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

export interface VoiceIceCandidatePayload {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface VoiceSignalPayload {
  roomCode: string;
  toPlayerId: string;
  description?: VoiceSessionDescriptionPayload;
  candidate?: VoiceIceCandidatePayload;
}

export interface VoiceMuteStatePayload {
  roomCode: string;
  muted: boolean;
  speaking?: boolean;
}

export interface ClientAction {
  type:
    | "room:create"
    | "room:join"
    | "room:reconnect"
    | "room:start"
    | "room:leave"
    | "game:playCards"
    | "game:callLiar"
    | "game:restart"
    | "voice:join"
    | "voice:leave"
    | "voice:signal"
    | "voice:muteState";
  payload?:
    | CreateRoomPayload
    | JoinRoomPayload
    | ReconnectPayload
    | PlayCardsPayload
    | RoomActionPayload
    | VoiceSignalPayload
    | VoiceMuteStatePayload;
}

export interface ServerMessage {
  type: "room:state" | "game:privateState" | "game:eventLog" | "game:error" | "room:closed" | "voice:peers" | "voice:signal" | "voice:peerState";
  payload: unknown;
}
