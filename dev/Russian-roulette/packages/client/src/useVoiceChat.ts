import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { RoomState, VoicePeerState, VoiceSignalPayload } from "@rrld/shared";

type VoiceStatus = "idle" | "requesting" | "connected" | "error" | "unsupported";
export type VoicePeerAudioStatus = "connecting" | "negotiating" | "ice-checking" | "speaker-linked" | "audio-playing" | "blocked" | "silent" | "failed";

export interface VoicePeerDiagnostics {
  audioStatus: VoicePeerAudioStatus;
  signalingState?: RTCSignalingState;
  iceConnectionState?: RTCIceConnectionState;
  connectionState?: RTCPeerConnectionState;
  localTrackCount: number;
  remoteTrackCount: number;
  offersSent: number;
  offersReceived: number;
  answersSent: number;
  answersReceived: number;
  localCandidates: number;
  remoteCandidates: number;
  createdAt: number;
  lastUpdatedAt: number;
  lastError?: string;
}

interface VoiceSignalMessage {
  fromPlayerId: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface VoicePeersMessage {
  peers: VoicePeerState[];
}

interface PeerRuntime {
  connection: RTCPeerConnection;
  audio?: HTMLAudioElement;
  remoteStream?: MediaStream;
  remoteSource?: MediaStreamAudioSourceNode;
  remoteAnalyser?: AnalyserNode;
  remoteMonitor?: number;
  makingOffer?: boolean;
  lastOfferAt?: number;
  ignoredOffer?: boolean;
  offersSent: number;
  offersReceived: number;
  answersSent: number;
  answersReceived: number;
  localCandidates: number;
  remoteCandidates: number;
  remoteTrackCount: number;
  createdAt: number;
  rebuilds: number;
  lastError?: string;
}

export interface VoiceClientState {
  status: VoiceStatus;
  muted: boolean;
  speaking: boolean;
  peers: VoicePeerState[];
  remoteAudioCount: number;
  peerAudioStates: Record<string, VoicePeerAudioStatus>;
  peerDiagnostics: Record<string, VoicePeerDiagnostics>;
  speakerTestRunning: boolean;
  micLoopbackRunning: boolean;
  error?: string;
}

export function useVoiceChat(socket: Socket | null, room: RoomState | null, myPlayerId?: string) {
  const [voice, setVoice] = useState<VoiceClientState>({
    status: "idle",
    muted: true,
    speaking: false,
    remoteAudioCount: 0,
    peerAudioStates: {},
    peerDiagnostics: {},
    speakerTestRunning: false,
    micLoopbackRunning: false,
    peers: []
  });
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef(new Map<string, PeerRuntime>());
  const joinedRef = useRef(false);
  const mutedRef = useRef(true);
  const roomCodeRef = useRef<string | undefined>(room?.code);
  const myPlayerIdRef = useRef<string | undefined>(myPlayerId);
  const analyserTimerRef = useRef<number | undefined>(undefined);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const playbackContextRef = useRef<AudioContext | undefined>(undefined);
  const negotiationTimerRef = useRef<number | undefined>(undefined);
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const sendOfferRef = useRef<((peerId: string) => Promise<void>) | undefined>(undefined);
  const rebuildPeerConnectionRef = useRef<((peerId: string) => void) | undefined>(undefined);
  const micLoopbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const iceServers = useMemo(() => parseIceServers(import.meta.env.VITE_RTC_ICE_SERVERS), []);

  const updatePeerDiagnostics = useCallback((peerId: string, patch: Partial<VoicePeerDiagnostics> = {}) => {
    const runtime = peerConnectionsRef.current.get(peerId);
    setVoice((current) => {
      const previous = current.peerDiagnostics[peerId] ?? createPeerDiagnostics("connecting");
      const next: VoicePeerDiagnostics = {
        ...previous,
        ...patch,
        audioStatus: patch.audioStatus ?? current.peerAudioStates[peerId] ?? previous.audioStatus,
        signalingState: runtime?.connection.signalingState ?? patch.signalingState ?? previous.signalingState,
        iceConnectionState: runtime?.connection.iceConnectionState ?? patch.iceConnectionState ?? previous.iceConnectionState,
        connectionState: runtime?.connection.connectionState ?? patch.connectionState ?? previous.connectionState,
        localTrackCount: patch.localTrackCount ?? localStreamRef.current?.getAudioTracks().length ?? previous.localTrackCount,
        remoteTrackCount: patch.remoteTrackCount ?? runtime?.remoteTrackCount ?? previous.remoteTrackCount,
        offersSent: patch.offersSent ?? runtime?.offersSent ?? previous.offersSent,
        offersReceived: patch.offersReceived ?? runtime?.offersReceived ?? previous.offersReceived,
        answersSent: patch.answersSent ?? runtime?.answersSent ?? previous.answersSent,
        answersReceived: patch.answersReceived ?? runtime?.answersReceived ?? previous.answersReceived,
        localCandidates: patch.localCandidates ?? runtime?.localCandidates ?? previous.localCandidates,
        remoteCandidates: patch.remoteCandidates ?? runtime?.remoteCandidates ?? previous.remoteCandidates,
        lastUpdatedAt: Date.now()
      };
      return {
        ...current,
        peerDiagnostics: {
          ...current.peerDiagnostics,
          [peerId]: next
        }
      };
    });
  }, []);

  const setPeerAudioState = useCallback((peerId: string, status: VoicePeerAudioStatus) => {
    setVoice((current) => ({
      ...current,
      peerAudioStates: {
        ...current.peerAudioStates,
        [peerId]: status
      },
      peerDiagnostics: {
        ...current.peerDiagnostics,
        [peerId]: {
          ...(current.peerDiagnostics[peerId] ?? createPeerDiagnostics(status)),
          audioStatus: status,
          lastUpdatedAt: Date.now()
        }
      }
    }));
  }, []);

  useEffect(() => {
    roomCodeRef.current = room?.code;
    myPlayerIdRef.current = myPlayerId;
  }, [room?.code, myPlayerId]);

  const emitMuteState = useCallback(
    (muted: boolean, speaking: boolean) => {
      const roomCode = roomCodeRef.current;
      if (!socket || !roomCode || !joinedRef.current) {
        return;
      }
      socket.emit("voice:muteState", { roomCode, muted, speaking });
    },
    [socket]
  );

  const cleanupPeer = useCallback((playerId: string) => {
    const runtime = peerConnectionsRef.current.get(playerId);
    if (!runtime) {
      return;
    }
    if (runtime.remoteMonitor) {
      window.clearInterval(runtime.remoteMonitor);
    }
    runtime.remoteSource?.disconnect();
    runtime.audio?.remove();
    runtime.connection.close();
    peerConnectionsRef.current.delete(playerId);
    pendingCandidatesRef.current.delete(playerId);
    remoteStreamsRef.current.delete(playerId);
    setVoice((current) => {
      const { [playerId]: _removed, ...peerAudioStates } = current.peerAudioStates;
      const { [playerId]: _removedDiagnostics, ...peerDiagnostics } = current.peerDiagnostics;
      return { ...current, peerAudioStates, peerDiagnostics, remoteAudioCount: remoteStreamsRef.current.size };
    });
  }, []);

  const leaveVoice = useCallback(() => {
    const roomCode = roomCodeRef.current;
    if (socket && roomCode && joinedRef.current) {
      socket.emit("voice:leave", { roomCode });
    }
    joinedRef.current = false;
    if (analyserTimerRef.current) {
      window.clearInterval(analyserTimerRef.current);
      analyserTimerRef.current = undefined;
    }
    if (negotiationTimerRef.current) {
      window.clearInterval(negotiationTimerRef.current);
      negotiationTimerRef.current = undefined;
    }
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = undefined;
    playbackContextRef.current?.close().catch(() => undefined);
    playbackContextRef.current = undefined;
    micLoopbackAudioRef.current?.remove();
    micLoopbackAudioRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    mutedRef.current = true;
    peerConnectionsRef.current.forEach((_, playerId) => cleanupPeer(playerId));
    remoteStreamsRef.current.clear();
    setVoice({
      status: "idle",
      muted: true,
      speaking: false,
      remoteAudioCount: 0,
      peerAudioStates: {},
      peerDiagnostics: {},
      speakerTestRunning: false,
      micLoopbackRunning: false,
      peers: []
    });
  }, [cleanupPeer, socket]);

  const ensurePlaybackContext = useCallback(async () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return undefined;
    }
    if (!playbackContextRef.current || playbackContextRef.current.state === "closed") {
      playbackContextRef.current = new AudioContextCtor();
    }
    if (playbackContextRef.current.state === "suspended") {
      await playbackContextRef.current.resume();
    }
    return playbackContextRef.current;
  }, []);

  const startRemoteAudioMonitor = useCallback(
    async (peerId: string, stream: MediaStream) => {
      const runtime = peerConnectionsRef.current.get(peerId);
      if (!runtime || stream.getAudioTracks().length === 0) {
        return;
      }
      try {
        const context = await ensurePlaybackContext();
        if (!context) {
          return;
        }
        if (runtime.remoteMonitor) {
          window.clearInterval(runtime.remoteMonitor);
        }
        runtime.remoteSource?.disconnect();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        runtime.remoteSource = source;
        runtime.remoteAnalyser = analyser;
        const samples = new Uint8Array(analyser.frequencyBinCount);
        let quietTicks = 0;
        runtime.remoteMonitor = window.setInterval(() => {
          analyser.getByteFrequencyData(samples);
          const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
          if (average > 10) {
            quietTicks = 0;
            setPeerAudioState(peerId, "audio-playing");
            return;
          }
          quietTicks += 1;
          if (quietTicks >= 8) {
            setPeerAudioState(peerId, "silent");
          }
        }, 220);
      } catch {
        setPeerAudioState(peerId, "speaker-linked");
      }
    },
    [ensurePlaybackContext, setPeerAudioState]
  );

  const attachRemoteAudio = useCallback(
    async (peerId: string, stream: MediaStream) => {
      const runtime = peerConnectionsRef.current.get(peerId);
      if (!runtime) {
        return;
      }
      if (stream.getAudioTracks().length === 0) {
        return;
      }

      remoteStreamsRef.current.set(peerId, stream);
      runtime.remoteStream = stream;
      runtime.remoteTrackCount = stream.getAudioTracks().length;
      setPeerAudioState(peerId, "speaker-linked");
      updatePeerDiagnostics(peerId, { remoteTrackCount: runtime.remoteTrackCount });
      setVoice((current) => ({ ...current, remoteAudioCount: remoteStreamsRef.current.size }));
      if (!runtime.audio) {
        const audio = new Audio();
        audio.autoplay = true;
        audio.volume = 1;
        audio.muted = false;
        audio.setAttribute("playsinline", "true");
        audio.srcObject = stream;
        audio.dataset.voicePeer = peerId;
        audio.style.display = "none";
        document.body.append(audio);
        runtime.audio = audio;
      } else if (runtime.audio.srcObject !== stream) {
        runtime.audio.srcObject = stream;
      }

      try {
        await ensurePlaybackContext();
      } catch {
        // The audio element is the primary output; AudioContext is only used to unlock playback on some browsers.
      }

      try {
        await runtime.audio.play();
      } catch {
        setPeerAudioState(peerId, "blocked");
        setVoice((current) => ({
          ...current,
          remoteAudioCount: remoteStreamsRef.current.size,
          error: "Remote audio was blocked by the browser. Click Join voice again or interact with the page."
        }));
        return;
      }
      void startRemoteAudioMonitor(peerId, stream);
    },
    [ensurePlaybackContext, setPeerAudioState, startRemoteAudioMonitor, updatePeerDiagnostics]
  );

  const addIceCandidateSafely = useCallback(async (peerId: string, connection: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
    if (!connection.remoteDescription) {
      const pending = pendingCandidatesRef.current.get(peerId) ?? [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(peerId, pending);
      return;
    }
    const runtime = peerConnectionsRef.current.get(peerId);
    if (runtime) {
      runtime.remoteCandidates += 1;
    }
    updatePeerDiagnostics(peerId);
    await connection.addIceCandidate(candidate);
  }, [updatePeerDiagnostics]);

  const flushPendingCandidates = useCallback(async (peerId: string, connection: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(peerId) ?? [];
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      await connection.addIceCandidate(candidate);
      const runtime = peerConnectionsRef.current.get(peerId);
      if (runtime) {
        runtime.remoteCandidates += 1;
      }
    }
    updatePeerDiagnostics(peerId);
  }, [updatePeerDiagnostics]);

  const attachLocalTracks = useCallback((connection: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    const audioTracks = stream?.getAudioTracks() ?? [];
    const senders = connection.getSenders();
    audioTracks.forEach((track) => {
      const alreadyAttached = senders.some((sender) => sender.track?.id === track.id);
      if (!alreadyAttached && stream) {
        connection.addTrack(track, stream);
      }
    });

    try {
      const hasAudioPath =
        connection.getSenders().some((sender) => sender.track?.kind === "audio") ||
        (connection.getReceivers?.() ?? []).some((receiver) => receiver.track?.kind === "audio") ||
        connection.getTransceivers?.().some((transceiver) => transceiver.receiver.track.kind === "audio" || transceiver.sender.track?.kind === "audio");
      if (!hasAudioPath && connection.addTransceiver) {
        connection.addTransceiver("audio", { direction: "sendrecv" });
      }
    } catch {
      // Some test doubles do not implement transceiver APIs. addTrack is enough there.
    }
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) {
        return existing.connection;
      }

      const connection = new RTCPeerConnection({ iceServers });
      attachLocalTracks(connection);
      setPeerAudioState(peerId, "connecting");
      updatePeerDiagnostics(peerId, { localTrackCount: localStreamRef.current?.getAudioTracks().length ?? 0 });

      connection.onnegotiationneeded = () => {
        const runtime = peerConnectionsRef.current.get(peerId);
        if (!runtime || runtime.makingOffer) {
          return;
        }
        setPeerAudioState(peerId, "negotiating");
        window.setTimeout(() => {
          void sendOfferRef.current?.(peerId).catch(() => {
            const latestRuntime = peerConnectionsRef.current.get(peerId);
            if (latestRuntime) {
              latestRuntime.lastError = "Negotiation offer failed.";
            }
            setPeerAudioState(peerId, "failed");
            updatePeerDiagnostics(peerId, { lastError: "Negotiation offer failed." });
          });
        }, 0);
      };

      connection.onicecandidate = (event) => {
        const roomCode = roomCodeRef.current;
        if (!socket || !roomCode || !event.candidate) {
          return;
        }
        const runtime = peerConnectionsRef.current.get(peerId);
        if (runtime) {
          runtime.localCandidates += 1;
        }
        updatePeerDiagnostics(peerId);
        socket.emit("voice:signal", {
          roomCode,
          toPlayerId: peerId,
          candidate: toCandidatePayload(event.candidate)
        } satisfies VoiceSignalPayload);
      };

      connection.ontrack = (event) => {
        const runtime = peerConnectionsRef.current.get(peerId);
        if (!runtime) {
          return;
        }
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        runtime.remoteTrackCount = Math.max(runtime.remoteTrackCount, stream.getAudioTracks().length || (event.track.kind === "audio" ? 1 : 0));
        updatePeerDiagnostics(peerId, { remoteTrackCount: runtime.remoteTrackCount });
        void attachRemoteAudio(peerId, stream);
      };

      connection.oniceconnectionstatechange = () => {
        updatePeerDiagnostics(peerId);
        if (connection.iceConnectionState === "checking") {
          setPeerAudioState(peerId, "ice-checking");
        }
        if (connection.iceConnectionState === "connected" || connection.iceConnectionState === "completed") {
          if (!remoteStreamsRef.current.has(peerId)) {
            setPeerAudioState(peerId, "speaker-linked");
          }
        }
        if (connection.iceConnectionState === "failed") {
          setPeerAudioState(peerId, "failed");
          connection.restartIce?.();
          window.setTimeout(() => {
            const latestRuntime = peerConnectionsRef.current.get(peerId);
            if (latestRuntime && !remoteStreamsRef.current.has(peerId) && latestRuntime.rebuilds < 1) {
              rebuildPeerConnectionRef.current?.(peerId);
            }
          }, 1200);
        }
        if (connection.iceConnectionState === "disconnected") {
          setPeerAudioState(peerId, "connecting");
          window.setTimeout(() => {
            const latestRuntime = peerConnectionsRef.current.get(peerId);
            if (latestRuntime && !remoteStreamsRef.current.has(peerId)) {
              void sendOfferRef.current?.(peerId).catch(() => undefined);
            }
          }, 900);
        }
      };

      connection.onconnectionstatechange = () => {
        updatePeerDiagnostics(peerId);
        if (connection.connectionState === "failed") {
          setPeerAudioState(peerId, "failed");
          connection.restartIce?.();
          window.setTimeout(() => {
            const latestRuntime = peerConnectionsRef.current.get(peerId);
            if (latestRuntime && !remoteStreamsRef.current.has(peerId) && latestRuntime.rebuilds < 1) {
              rebuildPeerConnectionRef.current?.(peerId);
            }
          }, 1200);
          return;
        }
        if (connection.connectionState === "closed") {
          cleanupPeer(peerId);
        }
      };

      peerConnectionsRef.current.set(peerId, {
        connection,
        offersSent: 0,
        offersReceived: 0,
        answersSent: 0,
        answersReceived: 0,
        localCandidates: 0,
        remoteCandidates: 0,
        remoteTrackCount: 0,
        createdAt: Date.now(),
        rebuilds: 0
      });
      updatePeerDiagnostics(peerId);
      return connection;
    },
    [attachLocalTracks, attachRemoteAudio, cleanupPeer, iceServers, setPeerAudioState, socket, updatePeerDiagnostics]
  );

  const sendOffer = useCallback(
    async (peerId: string) => {
      const roomCode = roomCodeRef.current;
      if (!socket || !roomCode || !joinedRef.current) {
        return;
      }
      const connection = createPeerConnection(peerId);
      attachLocalTracks(connection);
      if (connection.signalingState !== "stable") {
        return;
      }
      const runtime = peerConnectionsRef.current.get(peerId);
      const now = Date.now();
      if (runtime?.makingOffer || (runtime?.lastOfferAt && now - runtime.lastOfferAt < 750)) {
        return;
      }
      if (runtime) {
        runtime.makingOffer = true;
        runtime.lastOfferAt = now;
      }
      try {
        setPeerAudioState(peerId, "negotiating");
        const offer = await connection.createOffer({ offerToReceiveAudio: true });
        await connection.setLocalDescription(offer);
        if (runtime) {
          runtime.offersSent += 1;
        }
        updatePeerDiagnostics(peerId);
        socket.emit("voice:signal", {
          roomCode,
          toPlayerId: peerId,
          description: toDescriptionPayload(connection.localDescription)
        } satisfies VoiceSignalPayload);
      } catch (error) {
        const latestRuntime = peerConnectionsRef.current.get(peerId);
        if (latestRuntime) {
          latestRuntime.lastError = error instanceof Error ? error.message : "Offer failed.";
        }
        setPeerAudioState(peerId, "failed");
        updatePeerDiagnostics(peerId, { lastError: error instanceof Error ? error.message : "Offer failed." });
      } finally {
        const latestRuntime = peerConnectionsRef.current.get(peerId);
        if (latestRuntime) {
          latestRuntime.makingOffer = false;
        }
      }
    },
    [attachLocalTracks, createPeerConnection, setPeerAudioState, socket, updatePeerDiagnostics]
  );

  useEffect(() => {
    sendOfferRef.current = sendOffer;
  }, [sendOffer]);

  const rebuildPeerConnection = useCallback(
    (peerId: string) => {
      const previous = peerConnectionsRef.current.get(peerId);
      const rebuilds = (previous?.rebuilds ?? 0) + 1;
      cleanupPeer(peerId);
      const connection = createPeerConnection(peerId);
      const runtime = peerConnectionsRef.current.get(peerId);
      if (runtime) {
        runtime.rebuilds = rebuilds;
      }
      attachLocalTracks(connection);
      setPeerAudioState(peerId, "negotiating");
      void sendOffer(peerId).catch(() => undefined);
    },
    [attachLocalTracks, cleanupPeer, createPeerConnection, sendOffer, setPeerAudioState]
  );

  useEffect(() => {
    rebuildPeerConnectionRef.current = rebuildPeerConnection;
  }, [rebuildPeerConnection]);

  const syncPeers = useCallback(
    (peers: VoicePeerState[]) => {
      const selfId = myPlayerIdRef.current;
      const connectedPeerIds = new Set(peers.filter((peer) => peer.connected && peer.playerId !== selfId).map((peer) => peer.playerId));

      peerConnectionsRef.current.forEach((_, peerId) => {
        if (!connectedPeerIds.has(peerId)) {
          cleanupPeer(peerId);
        }
      });

      if (!joinedRef.current || !selfId) {
        return;
      }

      connectedPeerIds.forEach((peerId) => {
        if (!peerConnectionsRef.current.has(peerId)) {
          createPeerConnection(peerId);
        }
        const delay = 80 + Math.abs(hashPeerPair(selfId, peerId)) % 260;
        window.setTimeout(() => {
          if (joinedRef.current && peerConnectionsRef.current.has(peerId) && !remoteStreamsRef.current.has(peerId)) {
            void sendOffer(peerId).catch(() => undefined);
          }
        }, delay);
      });
    },
    [cleanupPeer, createPeerConnection, sendOffer]
  );

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handlePeers = (message: VoicePeersMessage) => {
      const peers = Array.isArray(message?.peers) ? message.peers : [];
      setVoice((current) => ({ ...current, peers }));
      syncPeers(peers);
    };

    const handlePeerState = (peer: VoicePeerState) => {
      setVoice((current) => {
        const withoutPeer = current.peers.filter((candidate) => candidate.playerId !== peer.playerId);
        return { ...current, peers: peer.connected ? [...withoutPeer, peer] : withoutPeer };
      });
      if (!peer.connected) {
        cleanupPeer(peer.playerId);
      }
    };

    const handleSignal = async (message: VoiceSignalMessage) => {
      if (!joinedRef.current || !message?.fromPlayerId) {
        return;
      }
      try {
        const connection = createPeerConnection(message.fromPlayerId);
        attachLocalTracks(connection);
        if (message.description) {
          const runtime = peerConnectionsRef.current.get(message.fromPlayerId);
          const isOffer = message.description.type === "offer";
          if (runtime) {
            if (isOffer) {
              runtime.offersReceived += 1;
            } else if (message.description.type === "answer") {
              runtime.answersReceived += 1;
            }
          }
          setPeerAudioState(message.fromPlayerId, isOffer ? "negotiating" : "ice-checking");
          const offerCollision = Boolean(isOffer && (runtime?.makingOffer || connection.signalingState !== "stable"));
          const selfId = myPlayerIdRef.current;
          const polite = Boolean(selfId && selfId > message.fromPlayerId);
          if (offerCollision && !polite) {
            if (runtime) {
              runtime.ignoredOffer = true;
            }
            updatePeerDiagnostics(message.fromPlayerId);
            return;
          }
          if (offerCollision && polite) {
            await connection.setLocalDescription({ type: "rollback" }).catch(() => undefined);
          }
          await connection.setRemoteDescription(message.description);
          await flushPendingCandidates(message.fromPlayerId, connection);
          if (message.description.type === "offer") {
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            const latestRuntime = peerConnectionsRef.current.get(message.fromPlayerId);
            if (latestRuntime) {
              latestRuntime.answersSent += 1;
            }
            updatePeerDiagnostics(message.fromPlayerId);
            const roomCode = roomCodeRef.current;
            if (roomCode) {
              socket.emit("voice:signal", {
                roomCode,
                toPlayerId: message.fromPlayerId,
                description: toDescriptionPayload(connection.localDescription)
              } satisfies VoiceSignalPayload);
            }
          }
        }
        if (message.candidate?.candidate) {
          await addIceCandidateSafely(message.fromPlayerId, connection, message.candidate);
        }
        updatePeerDiagnostics(message.fromPlayerId);
      } catch (error) {
        const runtime = peerConnectionsRef.current.get(message.fromPlayerId);
        const lastError = error instanceof Error ? error.message : "Voice signal failed.";
        if (runtime) {
          runtime.lastError = lastError;
        }
        setPeerAudioState(message.fromPlayerId, "failed");
        updatePeerDiagnostics(message.fromPlayerId, { lastError });
        setVoice((current) => ({
          ...current,
          error: "Voice connection had trouble. Try Reset voice."
        }));
      }
    };

    socket.on("voice:peers", handlePeers);
    socket.on("voice:peerState", handlePeerState);
    socket.on("voice:signal", handleSignal);
    socket.on("disconnect", leaveVoice);

    return () => {
      socket.off("voice:peers", handlePeers);
      socket.off("voice:peerState", handlePeerState);
      socket.off("voice:signal", handleSignal);
      socket.off("disconnect", leaveVoice);
    };
  }, [addIceCandidateSafely, attachLocalTracks, cleanupPeer, createPeerConnection, flushPendingCandidates, leaveVoice, setPeerAudioState, socket, syncPeers, updatePeerDiagnostics]);

  useEffect(() => {
    if (!room) {
      leaveVoice();
    }
  }, [leaveVoice, room]);

  const startSpeakingMonitor = useCallback((stream: MediaStream, onSpeaking: (speaking: boolean) => void) => {
    if (analyserTimerRef.current) {
      window.clearInterval(analyserTimerRef.current);
    }
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        return;
      }
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let lastSpeaking = false;
      audioContextRef.current = context;
      analyserTimerRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(samples);
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const speaking = !mutedRef.current && average > 14;
        if (speaking !== lastSpeaking) {
          lastSpeaking = speaking;
          onSpeaking(speaking);
        }
      }, 180);
    } catch {
      // Voice still works even when speech detection is unavailable.
    }
  }, []);

  const joinVoice = useCallback(async () => {
    const roomCode = roomCodeRef.current;
    if (!socket || !roomCode || !myPlayerIdRef.current) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setVoice((current) => ({ ...current, status: "unsupported", error: "Voice chat is not supported in this browser." }));
      return;
    }
    const playbackUnlock = ensurePlaybackContext();
    setVoice((current) => ({ ...current, status: "requesting", error: undefined }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      await playbackUnlock.catch(() => undefined);
      localStreamRef.current = stream;
      joinedRef.current = true;
      mutedRef.current = false;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      setVoice((current) => ({ ...current, status: "connected", muted: false, error: undefined }));
      socket.emit("voice:join", { roomCode });
      negotiationTimerRef.current = window.setInterval(() => {
        if (!joinedRef.current) {
          return;
        }
        peerConnectionsRef.current.forEach((runtime, peerId) => {
          if (!remoteStreamsRef.current.has(peerId)) {
            if (["failed", "disconnected"].includes(runtime.connection.iceConnectionState)) {
              runtime.connection.restartIce?.();
            }
            const nextState = runtime.connection.iceConnectionState === "checking" ? "ice-checking" : runtime.connection.signalingState === "stable" ? "negotiating" : "connecting";
            setPeerAudioState(peerId, nextState);
            void sendOffer(peerId).catch(() => undefined);
          }
        });
      }, 2500);
      startSpeakingMonitor(stream, (speaking) => {
        setVoice((current) => ({ ...current, speaking }));
        emitMuteState(mutedRef.current, speaking);
      });
    } catch {
      joinedRef.current = false;
      mutedRef.current = true;
      setVoice((current) => ({ ...current, status: "error", error: "Microphone permission was blocked or unavailable." }));
    }
  }, [emitMuteState, ensurePlaybackContext, sendOffer, socket]);

  const resetVoice = useCallback(() => {
    const roomCode = roomCodeRef.current;
    if (!socket || !roomCode || !joinedRef.current) {
      return;
    }
    peerConnectionsRef.current.forEach((_, playerId) => cleanupPeer(playerId));
    pendingCandidatesRef.current.clear();
    remoteStreamsRef.current.clear();
    setVoice((current) => ({ ...current, remoteAudioCount: 0, peerAudioStates: {}, peerDiagnostics: {}, error: undefined }));
    socket.emit("voice:leave", { roomCode });
    window.setTimeout(() => {
      if (!joinedRef.current || !roomCodeRef.current) {
        return;
      }
      socket.emit("voice:join", { roomCode: roomCodeRef.current });
    }, 160);
  }, [cleanupPeer, socket]);

  const toggleMute = useCallback(() => {
    if (!joinedRef.current) {
      return;
    }
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setVoice((current) => ({ ...current, muted: nextMuted, speaking: nextMuted ? false : current.speaking }));
    emitMuteState(nextMuted, nextMuted ? false : voice.speaking);
  }, [emitMuteState, voice.speaking]);

  const retryAudioPlayback = useCallback(async () => {
    try {
      await ensurePlaybackContext();
      for (const [peerId, runtime] of peerConnectionsRef.current) {
        if (!runtime.audio || !runtime.remoteStream) {
          continue;
        }
        try {
          await runtime.audio.play();
          setPeerAudioState(peerId, "speaker-linked");
          void startRemoteAudioMonitor(peerId, runtime.remoteStream);
        } catch {
          setPeerAudioState(peerId, "blocked");
        }
      }
    } catch {
      setVoice((current) => ({ ...current, error: "Audio output is still blocked by the browser." }));
    }
  }, [ensurePlaybackContext, setPeerAudioState, startRemoteAudioMonitor]);

  const testSpeaker = useCallback(async () => {
    try {
      const context = await ensurePlaybackContext();
      if (!context) {
        return;
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      setVoice((current) => ({ ...current, speakerTestRunning: true, error: undefined }));
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
      window.setTimeout(() => {
        oscillator.disconnect();
        gain.disconnect();
        setVoice((current) => ({ ...current, speakerTestRunning: false }));
      }, 280);
    } catch {
      setVoice((current) => ({ ...current, speakerTestRunning: false, error: "Speaker test was blocked by the browser." }));
    }
  }, [ensurePlaybackContext]);

  const testMicLoopback = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) {
      setVoice((current) => ({ ...current, error: "Join voice before testing the microphone loopback." }));
      return;
    }
    try {
      micLoopbackAudioRef.current?.remove();
      const audio = new Audio();
      audio.autoplay = true;
      audio.volume = 0.35;
      audio.muted = false;
      audio.srcObject = stream;
      audio.setAttribute("playsinline", "true");
      audio.dataset.voiceLoopback = "true";
      audio.style.display = "none";
      document.body.append(audio);
      micLoopbackAudioRef.current = audio;
      setVoice((current) => ({ ...current, micLoopbackRunning: true, error: undefined }));
      await ensurePlaybackContext().catch(() => undefined);
      await audio.play();
      window.setTimeout(() => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
        if (micLoopbackAudioRef.current === audio) {
          micLoopbackAudioRef.current = null;
        }
        setVoice((current) => ({ ...current, micLoopbackRunning: false }));
      }, 1800);
    } catch {
      micLoopbackAudioRef.current?.remove();
      micLoopbackAudioRef.current = null;
      setVoice((current) => ({ ...current, micLoopbackRunning: false, error: "Mic loopback was blocked by the browser." }));
    }
  }, [ensurePlaybackContext]);

  return {
    voice,
    joinVoice,
    leaveVoice,
    toggleMute,
    resetVoice,
    retryAudioPlayback,
    testSpeaker,
    testMicLoopback
  };
}

function parseIceServers(value?: string): RTCIceServer[] {
  if (!value) {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
  try {
    const parsed = JSON.parse(value) as RTCIceServer[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Treat non-JSON as a comma-separated list of STUN/TURN URLs.
  }
  return value
    .split(",")
    .map((urls) => urls.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }));
}

function toDescriptionPayload(description: RTCSessionDescription | RTCSessionDescriptionInit | null | undefined): VoiceSignalPayload["description"] {
  if (!description) {
    return undefined;
  }
  return {
    type: description.type,
    sdp: description.sdp
  };
}

function toCandidatePayload(candidate: RTCIceCandidate): VoiceSignalPayload["candidate"] {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment
  };
}

function createPeerDiagnostics(audioStatus: VoicePeerAudioStatus): VoicePeerDiagnostics {
  const now = Date.now();
  return {
    audioStatus,
    localTrackCount: 0,
    remoteTrackCount: 0,
    offersSent: 0,
    offersReceived: 0,
    answersSent: 0,
    answersReceived: 0,
    localCandidates: 0,
    remoteCandidates: 0,
    createdAt: now,
    lastUpdatedAt: now
  };
}

function hashPeerPair(selfId: string, peerId: string): number {
  const input = `${selfId}:${peerId}`;
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return hash;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
