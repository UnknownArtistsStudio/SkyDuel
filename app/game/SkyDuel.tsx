"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPlayer,
  botInput,
  cleanName,
  createGame,
  MISSILE_DROP_TIME,
  removePlayer,
  resetRound,
  stepGame,
  type GameState,
  type Landscape,
  type MatchMode,
  type PlaneHits,
  type PilotInput,
  type Plane,
  type ScoreLimit,
  type Team,
  type TeamPreference,
} from "../../lib/game-core";
import { cleanChatText } from "../../lib/chat";
import {
  VOICE_CLIP_SECONDS,
  VOICE_COOLDOWN,
  cleanVoiceClip,
  preferredVoiceMimeType,
  type VoiceClipPayload,
} from "../../lib/radio";
import { PeerRoom } from "./peer-room";
import { pilotReadout, renderGame, resetRendererEffects, type ChatBubble } from "./render-game";

type Screen = "title" | "menu" | "join" | "connecting" | "playing";
type Mode = "practice" | "host" | "guest" | null;
type NetworkMessage =
  | { type: "hello"; name: string; teamPreference: TeamPreference }
  | { type: "input"; input: PilotInput }
  | { type: "welcome"; playerId: string; state: GameState }
  | { type: "snapshot"; state: GameState }
  | { type: "chat-request"; text: string }
  | { type: "chat"; playerId: string; text: string }
  | { type: "voice-request"; clip: VoiceClipPayload }
  | { type: "voice"; playerId: string; clip: VoiceClipPayload };
type EngineSound = { oscillator: OscillatorNode; gain: GainNode };
type MusicMode = "silent" | "menu" | "game" | "action";
type MusicSound = {
  master: GainNode | null;
  mode: MusicMode;
  nextBeatAt: number;
  step: number;
};
type QueuedVoiceClip = VoiceClipPayload & { playerId: string; pilotName: string };
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionErrorEventLike = Event & { readonly error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  }
}

const neutralInput: PilotInput = { turn: 0, fire: false, bomb: false, roll: false, aimUp: false };
const CHAT_DURATION = 4600;
const CHAT_COOLDOWN = 900;
const TITLE_MUSIC_LEAD_IN = 1200;

export function SkyDuel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState>(makeAttractGame());
  const roomRef = useRef<PeerRoom | null>(null);
  const localIdRef = useRef("");
  const inputRef = useRef<PilotInput>({ ...neutralInput });
  const remoteInputsRef = useRef<Record<string, PilotInput>>({});
  const lastSoundEventRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const engineSoundRef = useRef<EngineSound | null>(null);
  const musicSoundRef = useRef<MusicSound>({ master: null, mode: "silent", nextBeatAt: 0, step: 0 });
  const computerVoiceBusyRef = useRef(0);
  const chatBubblesRef = useRef<ChatBubble[]>([]);
  const chatRateRef = useRef(new Map<string, number>());
  const voiceRateRef = useRef(new Map<string, number>());
  const voiceQueueRef = useRef<QueuedVoiceClip[]>([]);
  const voicePlayingRef = useRef(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceUrlRef = useRef("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStartedAtRef = useRef(0);
  const voiceCapturePendingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionStoppingRef = useRef(false);
  const recognitionTimerRef = useRef<number | null>(null);
  const radioMessageTimerRef = useRef<number | null>(null);
  const titleStartTimerRef = useRef<number | null>(null);
  const startPendingRef = useRef(false);
  const recognitionTranscriptRef = useRef("");
  const isTalkingRef = useRef(false);

  const [screen, setScreen] = useState<Screen>("title");
  const [mode, setMode] = useState<Mode>(null);
  const [matchMode, setMatchMode] = useState<MatchMode>("free-for-all");
  const [scoreLimit, setScoreLimit] = useState<ScoreLimit>(10);
  const [bombsEnabled, setBombsEnabled] = useState(false);
  const [parachuteMode, setParachuteMode] = useState(true);
  const [planeHits, setPlaneHits] = useState<PlaneHits>(1);
  const [landscape, setLandscape] = useState<Landscape>("tower");
  const [teamPreference, setTeamPreference] = useState<TeamPreference>("auto");
  const [callsign, setCallsign] = useState("ACE");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [message, setMessage] = useState("Engine on. First to 10 wins.");
  const [error, setError] = useState("");
  const [hud, setHud] = useState<{
    readout: ReturnType<typeof pilotReadout>;
    pilots: Array<{ id: string; name: string; color: string; score: number; team: Team | null; joinedAt: number }>;
    scoreLimit: ScoreLimit;
    bombsEnabled: boolean;
    winner: GameState["winner"];
    matchTime: number;
  }>({
    readout: {
      speed: 0,
      altitude: 0,
      stalled: false,
      protected: false,
      rolling: false,
      rollCooldown: 0,
      alive: false,
      respawnIn: 0,
      bombs: 0,
      missiles: 0,
      shotsRemaining: 0,
      reloadIn: 0,
      onFoot: false,
      parachuting: false,
      damage: 0,
    },
    pilots: [],
    scoreLimit: 10,
    bombsEnabled: false,
    winner: null,
    matchTime: 0,
  });
  const [copied, setCopied] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [radioMessage, setRadioMessage] = useState("");
  const [lastChatLine, setLastChatLine] = useState("");

  const { readout, pilots, scoreLimit: activeScoreLimit, bombsEnabled: activeBombsEnabled, winner, matchTime } = hud;
  const winningPilots = winner
    ? winner.kind === "pilot"
      ? pilots.filter((pilot) => pilot.id === winner.playerId)
      : pilots.filter((pilot) => pilot.team === winner.team)
    : [];

  const flashRadio = useCallback((text: string, duration = 1800) => {
    if (radioMessageTimerRef.current !== null) {
      window.clearTimeout(radioMessageTimerRef.current);
      radioMessageTimerRef.current = null;
    }
    setRadioMessage(text);
    if (duration > 0) {
      radioMessageTimerRef.current = window.setTimeout(() => {
        setRadioMessage("");
        radioMessageTimerRef.current = null;
      }, duration);
    }
  }, []);

  const showChat = useCallback((playerId: string, value: unknown) => {
    const text = cleanChatText(value);
    const plane = gameRef.current.players.find((candidate) => candidate.id === playerId);
    if (!text || !plane) return "";
    const now = performance.now();
    chatBubblesRef.current = [
      ...chatBubblesRef.current.filter(
        (bubble) => bubble.playerId !== playerId && bubble.expiresAt > now,
      ),
      { playerId, text, expiresAt: now + CHAT_DURATION },
    ];
    setLastChatLine(`${plane.name}: ${text}`);
    return text;
  }, []);

  const acceptChat = useCallback((playerId: string, value: unknown) => {
    const now = performance.now();
    const lastSentAt = chatRateRef.current.get(playerId) ?? -CHAT_COOLDOWN;
    if (now - lastSentAt < CHAT_COOLDOWN) return "";
    const text = showChat(playerId, value);
    if (text) chatRateRef.current.set(playerId, now);
    return text;
  }, [showChat]);

  const acceptVoice = useCallback((playerId: string, value: unknown) => {
    const now = performance.now();
    const lastSentAt = voiceRateRef.current.get(playerId) ?? -VOICE_COOLDOWN;
    if (now - lastSentAt < VOICE_COOLDOWN) return null;
    const clip = cleanVoiceClip(value);
    const plane = gameRef.current.players.find((candidate) => candidate.id === playerId);
    const groundPilot = gameRef.current.groundPilots.some((pilot) => pilot.ownerId === playerId);
    if (!clip || (!plane?.alive && !groundPilot) || gameRef.current.winner) return null;
    voiceRateRef.current.set(playerId, now);
    enqueueRadioClip(
      clip,
      playerId,
      plane?.name ?? "PILOT",
      audioRef,
      voiceQueueRef,
      voicePlayingRef,
      voiceAudioRef,
      voiceUrlRef,
      flashRadio,
      isTalkingRef.current,
    );
    return clip;
  }, [flashRadio]);

  const clearChat = useCallback(() => {
    if (radioMessageTimerRef.current !== null) {
      window.clearTimeout(radioMessageTimerRef.current);
      radioMessageTimerRef.current = null;
    }
    chatBubblesRef.current = [];
    chatRateRef.current.clear();
    voiceRateRef.current.clear();
    clearVoicePlayback(voiceQueueRef, voicePlayingRef, voiceAudioRef, voiceUrlRef);
    setLastChatLine("");
    setRadioMessage("");
  }, []);

  const setupRoom = useCallback((
    room: PeerRoom,
    role: "host" | "guest",
    localName: string,
    requestedTeam: TeamPreference,
  ) => {
    room.onStatus = (status) => setMessage(status);
    room.onPeerOpen = (peerId, name) => {
      if (role === "guest" && peerId === room.info.hostPeerId) {
        room.sendToHost({
          type: "hello",
          name: localName,
          teamPreference: requestedTeam,
        } satisfies NetworkMessage);
      }
      if (role === "host") setMessage(`${cleanName(name ?? "PILOT")} IS JOINING...`);
    };
    room.onPeerClose = (peerId) => {
      if (role === "host") {
        removePlayer(gameRef.current, peerId);
        delete remoteInputsRef.current[peerId];
        chatBubblesRef.current = chatBubblesRef.current.filter((bubble) => bubble.playerId !== peerId);
        chatRateRef.current.delete(peerId);
        voiceRateRef.current.delete(peerId);
        setMessage("A pilot left the formation.");
      } else if (peerId === room.info.hostPeerId) {
        setError("The room closed when its lead pilot left.");
        setScreen("menu");
        setMode(null);
        gameRef.current = makeAttractGame();
        resetRendererEffects();
      }
    };
    room.onMessage = (peerId, rawMessage) => {
      const incoming = rawMessage as NetworkMessage;
      if (!incoming || typeof incoming !== "object" || !("type" in incoming)) return;
      if (role === "host" && incoming.type === "hello") {
        if (!gameRef.current.players.some((player) => player.id === peerId)) {
          addPlayer(gameRef.current, peerId, incoming.name, incoming.teamPreference);
        }
        room.sendTo(peerId, {
          type: "welcome",
          playerId: peerId,
          state: gameRef.current,
        } satisfies NetworkMessage);
        setMessage(`${cleanName(incoming.name)} joined the formation.`);
      }
      if (role === "host" && incoming.type === "input") {
        remoteInputsRef.current[peerId] = sanitizeInput(incoming.input);
      }
      if (role === "host" && incoming.type === "chat-request") {
        const text = acceptChat(peerId, incoming.text);
        if (text) {
          room.broadcast({ type: "chat", playerId: peerId, text } satisfies NetworkMessage);
        }
      }
      if (role === "host" && incoming.type === "voice-request") {
        const clip = acceptVoice(peerId, incoming.clip);
        if (clip) {
          room.broadcast({ type: "voice", playerId: peerId, clip } satisfies NetworkMessage);
        }
      }
      if (role === "guest" && incoming.type === "welcome") {
        localIdRef.current = incoming.playerId;
        gameRef.current = incoming.state;
        resetRendererEffects();
        lastSoundEventRef.current = 0;
        setMatchMode(incoming.state.matchMode);
        setScoreLimit(incoming.state.scoreLimit);
        setBombsEnabled(incoming.state.bombsEnabled);
        setParachuteMode(incoming.state.parachuteMode ?? true);
        setPlaneHits(incoming.state.planeHits ?? 1);
        setLandscape(incoming.state.landscape ?? "tower");
        setMode("guest");
        setScreen("playing");
        setMessage("Connected. Watch your airspeed.");
      }
      if (role === "guest" && incoming.type === "snapshot") {
        gameRef.current = incoming.state;
      }
      if (
        role === "guest" &&
        peerId === room.info.hostPeerId &&
        incoming.type === "chat"
      ) {
        showChat(incoming.playerId, incoming.text);
      }
      if (
        role === "guest" &&
        peerId === room.info.hostPeerId &&
        incoming.type === "voice"
      ) {
        acceptVoice(incoming.playerId, incoming.clip);
      }
    };
  }, [acceptChat, acceptVoice, showChat]);

  const pressStart = useCallback(() => {
    if (startPendingRef.current) return;
    startPendingRef.current = true;
    wakeAudio(audioRef, engineSoundRef);
    titleStartTimerRef.current = window.setTimeout(() => {
      titleStartTimerRef.current = null;
      startPendingRef.current = false;
      setScreen("menu");
    }, TITLE_MUSIC_LEAD_IN);
  }, []);

  const beginPractice = useCallback(() => {
    void roomRef.current?.close();
    roomRef.current = null;
    const state = createGame("free-for-all", scoreLimit, bombsEnabled, parachuteMode, planeHits, landscape);
    const playerId = `pilot-${crypto.randomUUID()}`;
    addPlayer(state, playerId, cleanName(callsign), "auto");
    addPlayer(state, "practice-rival", "RIVAL");
    gameRef.current = state;
    resetRendererEffects();
    clearChat();
    lastSoundEventRef.current = 0;
    localIdRef.current = playerId;
    remoteInputsRef.current = {};
    inputRef.current = { ...neutralInput };
    setMode("practice");
    setRoomCode("");
    setMessage(`${limitLabel(scoreLimit)} practice duel.`);
    setError("");
    setScreen("playing");
    wakeAudio(audioRef, engineSoundRef);
  }, [bombsEnabled, callsign, clearChat, landscape, parachuteMode, planeHits, scoreLimit]);

  const createRoom = useCallback(async () => {
    setError("");
    setMessage("CALLING THE TOWER...");
    setScreen("connecting");
    wakeAudio(audioRef, engineSoundRef);
    try {
      const room = await PeerRoom.create(cleanName(callsign));
      const state = createGame(matchMode, scoreLimit, bombsEnabled, parachuteMode, planeHits, landscape);
      addPlayer(state, room.info.peerId, room.info.name, teamPreference);
      gameRef.current = state;
      resetRendererEffects();
      clearChat();
      lastSoundEventRef.current = 0;
      localIdRef.current = room.info.peerId;
      roomRef.current = room;
      remoteInputsRef.current = {};
      setupRoom(room, "host", cleanName(callsign), teamPreference);
      setMode("host");
      setRoomCode(room.info.code);
      setMessage("Room open. Share the four-letter code.");
      setScreen("playing");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The tower did not answer.");
      setScreen("menu");
    }
  }, [bombsEnabled, callsign, clearChat, landscape, matchMode, parachuteMode, planeHits, scoreLimit, setupRoom, teamPreference]);

  const joinRoom = useCallback(async () => {
    const code = joinCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (code.length !== 4) {
      setError("Enter the four-letter room code.");
      return;
    }
    setError("");
    setMessage("LOOKING FOR THAT FORMATION...");
    setScreen("connecting");
    clearChat();
    wakeAudio(audioRef, engineSoundRef);
    try {
      const room = await PeerRoom.join(code, cleanName(callsign));
      roomRef.current = room;
      localIdRef.current = room.info.peerId;
      setupRoom(room, "guest", cleanName(callsign), teamPreference);
      setRoomCode(room.info.code);
      setMode("guest");
      setMessage("CONNECTING TO THE LEAD PILOT...");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That room could not be joined.");
      setScreen("join");
    }
  }, [callsign, clearChat, joinCode, setupRoom, teamPreference]);

  const leaveGame = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    recognitionStoppingRef.current = false;
    discardVoiceCapture(
      mediaRecorderRef,
      mediaStreamRef,
      mediaChunksRef,
      voiceCapturePendingRef,
    );
    clearVoicePlayback(voiceQueueRef, voicePlayingRef, voiceAudioRef, voiceUrlRef);
    window.speechSynthesis?.cancel();
    computerVoiceBusyRef.current = 0;
    if (recognitionTimerRef.current !== null) window.clearTimeout(recognitionTimerRef.current);
    recognitionTimerRef.current = null;
    isTalkingRef.current = false;
    setIsTalking(false);
    void roomRef.current?.close();
    roomRef.current = null;
    gameRef.current = makeAttractGame();
    resetRendererEffects();
    lastSoundEventRef.current = 0;
    localIdRef.current = "";
    inputRef.current = { ...neutralInput };
    remoteInputsRef.current = {};
    clearChat();
    setMode(null);
    setRoomCode("");
    setMessage("Engine on. First to 10 wins.");
    setScreen("menu");
  }, [clearChat]);

  const restartRound = useCallback(() => {
    const state = gameRef.current;
    resetRound(state);
    clearChat();
    setMessage("New round. Clear skies.");
    if (mode === "host") {
      roomRef.current?.broadcast({ type: "snapshot", state } satisfies NetworkMessage);
    }
  }, [clearChat, mode]);

  const sendChat = useCallback((value: unknown) => {
    const text = cleanChatText(value);
    const playerId = localIdRef.current;
    const plane = gameRef.current.players.find((candidate) => candidate.id === playerId);
    const groundPilot = gameRef.current.groundPilots.some((pilot) => pilot.ownerId === playerId);
    if (!text || !playerId) return;
    if ((!plane?.alive && !groundPilot) || gameRef.current.winner) {
      flashRadio("RADIO OFF WHILE DOWN");
      return;
    }

    if (mode === "guest") {
      roomRef.current?.sendToHost({ type: "chat-request", text } satisfies NetworkMessage);
      return;
    }

    const accepted = acceptChat(playerId, text);
    if (accepted && mode === "host") {
      roomRef.current?.broadcast({ type: "chat", playerId, text: accepted } satisfies NetworkMessage);
    }
  }, [acceptChat, flashRadio, mode]);

  const sendVoiceClip = useCallback(async (blob: Blob, mimeType: string) => {
    const playerId = localIdRef.current;
    const plane = gameRef.current.players.find((candidate) => candidate.id === playerId);
    const groundPilot = gameRef.current.groundPilots.some((pilot) => pilot.ownerId === playerId);
    if (!playerId || (!plane?.alive && !groundPilot) || gameRef.current.winner || blob.size === 0) return;
    const clip = cleanVoiceClip({ mimeType, data: await blobToBase64(blob) });
    if (!clip) {
      flashRadio("RADIO CLIP LOST");
      return;
    }
    if (mode === "guest") {
      roomRef.current?.sendToHost({ type: "voice-request", clip } satisfies NetworkMessage);
    } else {
      const accepted = acceptVoice(playerId, clip);
      if (accepted && mode === "host") {
        roomRef.current?.broadcast({ type: "voice", playerId, clip: accepted } satisfies NetworkMessage);
      }
    }
    flashRadio("RADIO SENT");
  }, [acceptVoice, flashRadio, mode]);

  const stopVoiceCapture = useCallback(() => {
    voiceCapturePendingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }
    if (!recorder) {
      stopMediaStream(mediaStreamRef);
    }
  }, []);

  const stopTalking = useCallback(() => {
    if (recognitionTimerRef.current !== null) {
      window.clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }
    isTalkingRef.current = false;
    setIsTalking(false);
    stopVoiceCapture();
    window.setTimeout(() => {
      drainRadioQueue(
        audioRef,
        voiceQueueRef,
        voicePlayingRef,
        voiceAudioRef,
        voiceUrlRef,
        flashRadio,
      );
    }, 100);
    const recognition = recognitionRef.current;
    if (recognition && !recognitionStoppingRef.current) {
      recognitionStoppingRef.current = true;
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
    }
  }, [flashRadio, stopVoiceCapture]);

  const startVoiceCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return;
    voiceCapturePendingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      voiceCapturePendingRef.current = false;
      if (!isTalkingRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const mimeType = preferredVoiceMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 24_000,
      });
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      mediaChunksRef.current = [];
      mediaStartedAtRef.current = performance.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = performance.now() - mediaStartedAtRef.current;
        const chunks = mediaChunksRef.current;
        mediaChunksRef.current = [];
        mediaRecorderRef.current = null;
        stopMediaStream(mediaStreamRef);
        if (duration >= 180 && chunks.length > 0) {
          const clipType = mimeType || chunks[0].type || "audio/webm";
          void sendVoiceClip(new Blob(chunks, { type: clipType }), clipType);
        }
      };
      recorder.start();
    } catch {
      voiceCapturePendingRef.current = false;
      mediaRecorderRef.current = null;
      mediaChunksRef.current = [];
      stopMediaStream(mediaStreamRef);
      if (isTalkingRef.current) {
        flashRadio("MIC BLOCKED / ALLOW MIC", 2600);
      }
    }
  }, [flashRadio, sendVoiceClip]);

  const startTalking = useCallback(() => {
    if (screen !== "playing" || recognitionRef.current || mediaRecorderRef.current || voiceCapturePendingRef.current) return;
    if (voicePlayingRef.current) {
      flashRadio("RADIO BUSY");
      return;
    }
    const plane = gameRef.current.players.find((candidate) => candidate.id === localIdRef.current);
    const groundPilot = gameRef.current.groundPilots.some((pilot) => pilot.ownerId === localIdRef.current);
    if ((!plane?.alive && !groundPilot) || gameRef.current.winner) {
      flashRadio("RADIO OFF WHILE DOWN");
      return;
    }

    wakeAudio(audioRef, engineSoundRef);
    isTalkingRef.current = true;
    setIsTalking(true);
    flashRadio("TRANSMITTING...", 0);
    void startVoiceCapture();

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      flashRadio("RECORDING VOICE / 3 SEC MAX", 0);
      recognitionTimerRef.current = window.setTimeout(stopTalking, VOICE_CLIP_SECONDS * 1000);
      return;
    }

    recognitionTranscriptRef.current = "";
    recognitionStoppingRef.current = false;
    let recognitionError = "";
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += `${event.results[index][0]?.transcript ?? ""} `;
      }
      recognitionTranscriptRef.current = cleanChatText(transcript);
    };
    recognition.onerror = (event) => {
      recognitionError = event.error;
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      recognitionStoppingRef.current = false;
      if (recognitionTimerRef.current !== null) {
        window.clearTimeout(recognitionTimerRef.current);
        recognitionTimerRef.current = null;
      }
      isTalkingRef.current = false;
      setIsTalking(false);
      stopVoiceCapture();
      const transcript = recognitionTranscriptRef.current;
      recognitionTranscriptRef.current = "";
      if (transcript) {
        sendChat(transcript);
        flashRadio("MESSAGE SENT");
      } else if (recognitionError === "not-allowed" || recognitionError === "service-not-allowed") {
        flashRadio("MIC BLOCKED / ALLOW MIC", 2600);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      recognitionTimerRef.current = window.setTimeout(stopTalking, VOICE_CLIP_SECONDS * 1000);
    } catch {
      recognitionRef.current = null;
      recognitionStoppingRef.current = false;
      flashRadio("VOICE ONLY / 3 SEC MAX", 0);
      recognitionTimerRef.current = window.setTimeout(stopTalking, VOICE_CLIP_SECONDS * 1000);
    }
  }, [flashRadio, screen, sendChat, startVoiceCapture, stopTalking, stopVoiceCapture]);

  const setArcadeTurn = useCallback((turn: -1 | 0 | 1) => {
    if (turn !== 0) void audioRef.current?.resume();
    inputRef.current = { ...inputRef.current, turn };
  }, []);

  const setArcadeAimUp = useCallback((aimUp: boolean) => {
    inputRef.current = { ...inputRef.current, aimUp };
  }, []);

  const setArcadeFire = useCallback((fire: boolean) => {
    if (fire) void audioRef.current?.resume();
    inputRef.current = { ...inputRef.current, fire };
  }, []);

  const dropArcadeBomb = useCallback(() => {
    void audioRef.current?.resume();
    inputRef.current = { ...inputRef.current, bomb: true };
  }, []);

  const rollArcadePlane = useCallback(() => {
    void audioRef.current?.resume();
    inputRef.current = { ...inputRef.current, roll: true };
  }, []);

  useEffect(() => {
    const keys = new Set<string>();
    let rollArmed = true;
    const refreshInput = () => {
      const onFoot = gameRef.current.groundPilots.some((pilot) => pilot.ownerId === localIdRef.current);
      const left = onFoot
        ? ["a", "arrowleft"].some((key) => keys.has(key))
        : ["a", "arrowleft", "w", "arrowup"].some((key) => keys.has(key));
      const right = onFoot
        ? ["d", "arrowright"].some((key) => keys.has(key))
        : ["d", "arrowright", "s", "arrowdown"].some((key) => keys.has(key));
      const aimUp = onFoot && ["w", "arrowup"].some((key) => keys.has(key));
      const rollingChord = !onFoot && left && right;
      const triggerRoll = rollingChord && rollArmed;
      if (triggerRoll) rollArmed = false;
      if (!rollingChord) rollArmed = true;
      inputRef.current = {
        turn: left === right ? 0 : left ? -1 : 1,
        fire: keys.has(" "),
        bomb: inputRef.current.bomb,
        roll: inputRef.current.roll || triggerRoll,
        aimUp,
      };
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === "enter" && screen === "title") {
        event.preventDefault();
        pressStart();
        return;
      }
      if (key === "t" && screen === "playing") {
        event.preventDefault();
        if (!event.repeat) startTalking();
        return;
      }
      if (key === "b" && screen === "playing") {
        event.preventDefault();
        if (!event.repeat) dropArcadeBomb();
        return;
      }
      if (["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) {
        if (screen === "playing") event.preventDefault();
        if (screen === "playing") void audioRef.current?.resume();
        keys.add(key);
        refreshInput();
      }
      if (key === "escape" && screen === "playing") leaveGame();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === "t") {
        stopTalking();
        return;
      }
      keys.delete(key);
      refreshInput();
    };
    const onBlur = () => {
      keys.clear();
      refreshInput();
      inputRef.current = { ...inputRef.current, roll: false };
      stopTalking();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [dropArcadeBomb, leaveGame, pressStart, screen, startTalking, stopTalking]);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    let lastBroadcast = 0;
    let lastHud = 0;
    const frame = (time: number) => {
      const dt = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      const state = gameRef.current;
      chatBubblesRef.current = chatBubblesRef.current.filter((bubble) => bubble.expiresAt > time);

      if (screen !== "playing") {
        const inputs: Record<string, PilotInput> = {};
        for (const plane of state.players) inputs[plane.id] = botInput(state, plane.id);
        stepGame(state, inputs, dt);
      } else if (mode === "practice") {
        stepGame(state, {
          [localIdRef.current]: inputRef.current,
          "practice-rival": botInput(state, "practice-rival"),
        }, dt);
        inputRef.current = { ...inputRef.current, bomb: false, roll: false };
      } else if (mode === "host") {
        stepGame(state, {
          ...remoteInputsRef.current,
          [localIdRef.current]: inputRef.current,
        }, dt);
        inputRef.current = { ...inputRef.current, bomb: false, roll: false };
        if (time - lastBroadcast > 66) {
          roomRef.current?.broadcast({ type: "snapshot", state } satisfies NetworkMessage);
          lastBroadcast = time;
        }
      } else if (mode === "guest" && time - lastBroadcast > 45) {
        roomRef.current?.sendToHost({ type: "input", input: inputRef.current } satisfies NetworkMessage);
        inputRef.current = { ...inputRef.current, bomb: false, roll: false };
        lastBroadcast = time;
      }

      const localPlane = state.players.find((plane) => plane.id === localIdRef.current);
      const localGroundPilot = state.groundPilots.find((pilot) => pilot.ownerId === localIdRef.current);
      if (screen === "playing" && ((!localPlane?.alive && !localGroundPilot) || state.winner)) {
        inputRef.current = { ...neutralInput };
        if (isTalkingRef.current) stopTalking();
      }
      updateEngineSound(
        audioRef.current,
        engineSoundRef.current,
        localPlane,
        screen === "playing" && !state.winner,
        isTalkingRef.current || voicePlayingRef.current || computerVoiceBusyRef.current > 0,
      );
      updateMusic(
        audioRef.current,
        musicSoundRef.current,
        screen,
        isTalkingRef.current || voicePlayingRef.current || computerVoiceBusyRef.current > 0,
        state.groundPilots.length > 0 && !state.winner,
      );
      playNewSounds(
        state,
        lastSoundEventRef,
        audioRef,
        localIdRef.current,
        computerVoiceBusyRef,
        flashRadio,
      );
      if (canvasRef.current) {
        renderGame(canvasRef.current, state, localIdRef.current, time, chatBubblesRef.current);
      }
      if (time - lastHud > 100) {
        setHud({
          readout: pilotReadout(state, localIdRef.current),
          pilots: state.players
            .map(({ id, name, color, score, team, joinedAt }) => ({ id, name, color, score, team, joinedAt: joinedAt ?? 0 }))
            .sort((a, b) => b.score - a.score),
          scoreLimit: state.scoreLimit,
          bombsEnabled: state.bombsEnabled,
          winner: state.winner,
          matchTime: state.time,
        });
        lastHud = time;
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [flashRadio, mode, screen, stopTalking]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionStoppingRef.current = false;
    discardVoiceCapture(
      mediaRecorderRef,
      mediaStreamRef,
      mediaChunksRef,
      voiceCapturePendingRef,
    );
    clearVoicePlayback(voiceQueueRef, voicePlayingRef, voiceAudioRef, voiceUrlRef);
    window.speechSynthesis?.cancel();
    computerVoiceBusyRef.current = 0;
    if (recognitionTimerRef.current !== null) window.clearTimeout(recognitionTimerRef.current);
    if (radioMessageTimerRef.current !== null) window.clearTimeout(radioMessageTimerRef.current);
    if (titleStartTimerRef.current !== null) window.clearTimeout(titleStartTimerRef.current);
    void roomRef.current?.close();
    engineSoundRef.current?.oscillator.stop();
    void audioRef.current?.close();
  }, []);

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className={`game-root screen-${screen}`}>
      <section className="game-screen" aria-label="Sky Duel game">
        <canvas ref={canvasRef} className="game-canvas" aria-label="Biplane dogfight arena" />

        {screen === "title" && (
          <div className="title-screen">
            <button type="button" onClick={pressStart}>PRESS START</button>
          </div>
        )}

        {screen === "playing" && (
          <>
            <div className="game-mode-label">
              {modeLabel(mode)} / {mode === "practice" ? "FREE FOR ALL" : matchMode === "teams" ? "TEAMS" : "FREE FOR ALL"} / {limitLabel(activeScoreLimit)} / {landscape.toUpperCase()} / {planeHits} HIT / {activeBombsEnabled ? "BOMBS ON" : "GUNS ONLY"}
            </div>
            <div className="scoreboard" aria-label="Pilot scores">
              {matchMode === "teams" && mode !== "practice" && (
                <div className="team-score">
                  <span>RED {pilots.filter((pilot) => pilot.team === 0).reduce((total, pilot) => total + pilot.score, 0)}</span>
                  <span>GREEN {pilots.filter((pilot) => pilot.team === 1).reduce((total, pilot) => total + pilot.score, 0)}</span>
                </div>
              )}
              {pilots.map((pilot) => (
                <div className="score-row" key={pilot.id} style={{ "--pilot": pilot.color } as React.CSSProperties}>
                  <span className="pilot-dot" />
                  <span className="pilot-name">{pilot.name}</span>
                  <span className="pilot-team">{pilot.team === null ? "" : pilot.team === 0 ? "R" : "G"}</span>
                  <strong>{pilot.score}</strong>
                </div>
              ))}
            </div>

            {roomCode && (
              <button className="room-ticket" type="button" onClick={copyCode} aria-label="Copy room code">
                <span>{copied ? "COPIED" : "ROOM"}</span>
                <strong>{roomCode}</strong>
              </button>
            )}

            {!winner && pilots.some((pilot) => matchTime - pilot.joinedAt < 2.4) && pilots.length > 0 && (
              <div className="pilot-lineup" aria-label="Pilots entering the match">
                {pilots.map((pilot) => (
                  <div
                    className="lineup-pilot"
                    key={pilot.id}
                    style={{ "--pilot": pilot.color } as React.CSSProperties}
                  >
                    <span>PILOT</span>
                    <strong>{pilot.name}</strong>
                  </div>
                ))}
              </div>
            )}

            <div className={`flight-readout ${readout.stalled ? "is-stalled" : ""}`}>
              <span>SPEED <strong>{readout.speed}</strong></span>
              <span>
                {readout.onFoot
                  ? readout.parachuting
                    ? "PARACHUTE / FIRE"
                    : "PILOT MG / 5 WAY AIM"
                  : readout.protected
                  ? "SAFE / GUNS OFF"
                  : readout.stalled
                    ? "STALL / NOSE DOWN"
                    : readout.rolling
                      ? "BARREL ROLL"
                      : readout.rollCooldown > 0
                        ? `ROLL RESET ${readout.rollCooldown.toFixed(1)}`
                        : readout.missiles > 0
                          ? readout.missiles > 1
                            ? `MISSILES ${readout.missiles} / B FIRE`
                            : "MISSILE READY / B FIRE"
                          : readout.bombs > 0
                            ? "BOMB READY / B DROP"
                            : readout.reloadIn > 0
                              ? `GUN RELOAD ${readout.reloadIn.toFixed(1)}`
                              : `GUN ${readout.shotsRemaining}/3 / A+D ROLL`}
              </span>
              <span>ALT <strong>{readout.altitude}</strong></span>
            </div>

            {radioMessage && (
              <div className={`radio-status ${isTalking ? "is-transmitting" : ""}`} role="status">
                {radioMessage}
              </div>
            )}

            {!winner && !readout.alive && (
              <div className="respawn-card">
                <span>SHOT DOWN</span>
                <strong>BACK IN {Math.ceil(readout.respawnIn)}</strong>
              </div>
            )}

            {winner && (
              <div className="winner-card" role="status">
                <span>WINNER</span>
                <div className="winner-pilots">
                  {winningPilots.map((pilot) => (
                    <span key={pilot.id} style={{ "--pilot": pilot.color } as React.CSSProperties}>
                      {pilot.name}
                    </span>
                  ))}
                </div>
                <strong>{winnerLabel(winner, pilots)}</strong>
                {mode === "guest" ? (
                  <small>WAITING FOR LEAD PILOT</small>
                ) : (
                  <button type="button" onClick={restartRound}>PLAY AGAIN</button>
                )}
              </div>
            )}

            <button className="leave-button" type="button" onClick={leaveGame}>QUIT</button>

            <ArcadeControls
              disabled={!readout.alive || Boolean(winner)}
              isTalking={isTalking}
              pilotOnFoot={readout.onFoot}
              specialWeapon={readout.onFoot ? null : readout.missiles > 0 ? "MISSILE" : readout.bombs > 0 ? "BOMB" : null}
              onTurn={setArcadeTurn}
              onAimUp={setArcadeAimUp}
              onRoll={rollArcadePlane}
              onFire={setArcadeFire}
              onBomb={dropArcadeBomb}
              onTalkStart={startTalking}
              onTalkEnd={stopTalking}
            />

            <span className="chat-announcer" aria-live="polite">{lastChatLine}</span>
          </>
        )}

        {screen !== "title" && screen !== "playing" && (
          <div className="hangar-overlay">
            {screen === "menu" && (
              <div className="menu-card">
                <p className="menu-eyebrow">SKY DUEL / 2-6 PILOTS</p>
                <h1>GAME?</h1>
                <label className="callsign-field">
                  <span>CALL SIGN</span>
                  <input
                    value={callsign}
                    maxLength={12}
                    onChange={(event) => setCallsign(event.target.value)}
                    onBlur={() => setCallsign(cleanName(callsign))}
                    autoComplete="off"
                  />
                </label>
                <div className="callsign-preview" aria-label={`Pilot name ${cleanName(callsign)}`}>
                  <span>YOUR PILOT</span>
                  <strong>{cleanName(callsign)}</strong>
                </div>
                <div className="choice-group" role="group" aria-label="Room rules">
                  <span>ROOM RULES</span>
                  <button
                    type="button"
                    aria-pressed={matchMode === "free-for-all"}
                    onClick={() => setMatchMode("free-for-all")}
                  >
                    FREE FOR ALL
                  </button>
                  <button
                    type="button"
                    aria-pressed={matchMode === "teams"}
                    onClick={() => setMatchMode("teams")}
                  >
                    TEAMS
                  </button>
                </div>
                <ScorePicker value={scoreLimit} onChange={setScoreLimit} />
                <div className="choice-group" role="group" aria-label="Plane damage">
                  <span>PLANE DAMAGE</span>
                  <button type="button" aria-pressed={planeHits === 1} onClick={() => setPlaneHits(1)}>
                    1 HIT
                  </button>
                  <button type="button" aria-pressed={planeHits === 3} onClick={() => setPlaneHits(3)}>
                    3 HITS
                  </button>
                </div>
                <div className="choice-group" role="group" aria-label="Landscape">
                  <span>LANDSCAPE</span>
                  <button type="button" aria-pressed={landscape === "tower"} onClick={() => setLandscape("tower")}>
                    TOWER
                  </button>
                  <button type="button" aria-pressed={landscape === "sea"} onClick={() => setLandscape("sea")}>
                    SEA
                  </button>
                  <button type="button" aria-pressed={landscape === "mountains"} onClick={() => setLandscape("mountains")}>
                    MOUNTAINS
                  </button>
                </div>
                <div className="choice-group" role="group" aria-label="Bomb power-ups">
                  <span>BOMB PICKUPS</span>
                  <button type="button" aria-pressed={!bombsEnabled} onClick={() => setBombsEnabled(false)}>
                    OFF
                  </button>
                  <button type="button" aria-pressed={bombsEnabled} onClick={() => setBombsEnabled(true)}>
                    ON
                  </button>
                </div>
                <div className="choice-group" role="group" aria-label="Parachute mode">
                  <span>PARACHUTE MODE</span>
                  <button type="button" aria-pressed={!parachuteMode} onClick={() => setParachuteMode(false)}>
                    OFF
                  </button>
                  <button type="button" aria-pressed={parachuteMode} onClick={() => setParachuteMode(true)}>
                    ON
                  </button>
                </div>
                {matchMode === "teams" && (
                  <TeamPicker value={teamPreference} onChange={setTeamPreference} />
                )}
                <p className="menu-intro" aria-label="Radio chat instructions">
                  RADIO CHAT / ALLOW MIC FIRST TIME<br />
                  HOLD T + SPEAK / RELEASE TO SEND / 3 SEC MAX<br />
                  PHONE: HOLD TALK<br />
                  FRIENDS HEAR RADIO VOICE / WORDS APPEAR WHEN SUPPORTED / NOT STORED
                </p>
                <p className="menu-intro" aria-label="Missile reward rule">
                  MISSILES / EVERY 3 KILLS EARNS 1 / UNUSED MISSILES STACK
                </p>
                <p className="menu-intro" aria-label="Parachute mode rule">
                  PARACHUTE MODE / EVERY WEAPON TAKEDOWN EJECTS THE PILOT<br />
                  ON FOOT / FIRE = UP / LEFT OR RIGHT + FIRE = SIDE / ADD W OR UP = DIAGONAL<br />
                  PHONE / PUSH STICK UP + LEFT OR RIGHT FOR DIAGONAL AIM / 6 PILOT HITS = 1 PLANE HIT
                </p>
                <p className="menu-intro" aria-label="Three hit damage rule">
                  3 HIT MODE / DAMAGED / SMOKE / EXPLODE
                </p>
                <div className="menu-actions">
                  <button type="button" onClick={beginPractice}>1 PRACTICE</button>
                  <button type="button" onClick={createRoom}>2 CREATE ROOM</button>
                  <button type="button" onClick={() => { setError(""); setScreen("join"); }}>3 JOIN ROOM</button>
                </div>
                {error && <p className="form-error" role="alert">{error}</p>}
              </div>
            )}

            {screen === "join" && (
              <div className="menu-card join-card">
                <p className="menu-eyebrow">JOIN ROOM</p>
                <h1>ENTER CODE</h1>
                <label className="callsign-field room-code-field">
                  <span>FOUR LETTERS</span>
                  <input
                    value={joinCode}
                    maxLength={4}
                    placeholder="WING"
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    onKeyDown={(event) => { if (event.key === "Enter") void joinRoom(); }}
                  />
                </label>
                <TeamPicker value={teamPreference} onChange={setTeamPreference} />
                <p className="menu-intro">Team choice is used when the room is playing teams.</p>
                <div className="menu-actions two-up">
                  <button type="button" onClick={joinRoom}>1 JOIN</button>
                  <button type="button" onClick={() => setScreen("menu")}>2 BACK</button>
                </div>
                {error && <p className="form-error" role="alert">{error}</p>}
              </div>
            )}

            {screen === "connecting" && (
              <div className="menu-card connecting-card" role="status">
                <p className="menu-eyebrow">RADIO CHECK</p>
                <h1>{message}</h1>
                <button type="button" onClick={leaveGame}>CANCEL</button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ArcadeControls({
  disabled,
  isTalking,
  pilotOnFoot,
  specialWeapon,
  onTurn,
  onAimUp,
  onRoll,
  onFire,
  onBomb,
  onTalkStart,
  onTalkEnd,
}: {
  disabled: boolean;
  isTalking: boolean;
  pilotOnFoot: boolean;
  specialWeapon: "MISSILE" | "BOMB" | null;
  onTurn: (turn: -1 | 0 | 1) => void;
  onAimUp: (aimUp: boolean) => void;
  onRoll: () => void;
  onFire: (fire: boolean) => void;
  onBomb: () => void;
  onTalkStart: () => void;
  onTalkEnd: () => void;
}) {
  const stickPointerRef = useRef<number | null>(null);
  const stickMovedRef = useRef(false);
  const [stickX, setStickX] = useState(0);
  const [stickY, setStickY] = useState(0);
  const [firing, setFiring] = useState(false);

  const releaseStick = useCallback(() => {
    if (stickPointerRef.current === null) return;
    const shouldRoll = !stickMovedRef.current && !disabled && !pilotOnFoot;
    stickPointerRef.current = null;
    stickMovedRef.current = false;
    setStickX(0);
    setStickY(0);
    onTurn(0);
    onAimUp(false);
    if (shouldRoll) onRoll();
  }, [disabled, onAimUp, onRoll, onTurn, pilotOnFoot]);

  const moveStick = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (stickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const travel = Math.min(28, bounds.width * 0.28);
    const verticalTravel = Math.min(13, bounds.height * 0.24);
    const offset = Math.max(-travel, Math.min(travel, event.clientX - bounds.left - bounds.width / 2));
    const verticalOffset = pilotOnFoot
      ? Math.max(-verticalTravel, Math.min(verticalTravel, event.clientY - bounds.top - bounds.height / 2))
      : 0;
    if (Math.abs(offset) > 7 || Math.abs(verticalOffset) > 7) stickMovedRef.current = true;
    setStickX(offset);
    setStickY(verticalOffset);
    onTurn(offset < -7 ? -1 : offset > 7 ? 1 : 0);
    onAimUp(verticalOffset < -7);
  }, [onAimUp, onTurn, pilotOnFoot]);

  return (
    <div className="arcade-controls" aria-label="Arcade flight controls">
      <button
        className={`arcade-stick ${pilotOnFoot ? "is-on-foot" : ""}`}
        type="button"
        disabled={disabled}
        aria-label={pilotOnFoot ? "Move and aim joystick" : "Turn joystick"}
        style={{
          "--stick-x": `${disabled ? 0 : stickX}px`,
          "--stick-y": `${disabled ? 0 : stickY}px`,
        } as React.CSSProperties}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          stickPointerRef.current = event.pointerId;
          stickMovedRef.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
          moveStick(event);
        }}
        onPointerMove={moveStick}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
        onLostPointerCapture={releaseStick}
      >
        <span className="stick-rail" />
        <span className="stick-knob" />
        <span className="stick-label">{pilotOnFoot ? "MOVE / AIM" : "TURN / ROLL"}</span>
      </button>

      <div className="arcade-actions">
        <button
          className="arcade-button talk-button"
          type="button"
          disabled={disabled}
          aria-label="Hold to talk"
          aria-pressed={isTalking}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (disabled) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onTalkStart();
          }}
          onPointerUp={onTalkEnd}
          onPointerCancel={onTalkEnd}
          onLostPointerCapture={onTalkEnd}
        >
          TALK
        </button>
        {specialWeapon && (
          <button
            className="arcade-button bomb-button"
            type="button"
            disabled={disabled}
            aria-label={specialWeapon === "MISSILE" ? "Launch missile" : "Drop bomb"}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              if (disabled) return;
              event.preventDefault();
              onBomb();
            }}
          >
            {specialWeapon}
          </button>
        )}
        <button
          className="arcade-button fire-button"
          type="button"
          disabled={disabled}
          aria-label="Fire"
          aria-pressed={firing && !disabled}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (disabled) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setFiring(true);
            onFire(true);
          }}
          onPointerUp={() => {
            setFiring(false);
            onFire(false);
          }}
          onPointerCancel={() => {
            setFiring(false);
            onFire(false);
          }}
          onLostPointerCapture={() => {
            setFiring(false);
            onFire(false);
          }}
        >
          FIRE
        </button>
      </div>
    </div>
  );
}

function TeamPicker({
  value,
  onChange,
}: {
  value: TeamPreference;
  onChange: (team: TeamPreference) => void;
}) {
  return (
    <div className="choice-group team-picker" role="group" aria-label="Team choice">
      <span>YOUR TEAM</span>
      <button type="button" aria-pressed={value === "auto"} onClick={() => onChange("auto")}>AUTO</button>
      <button type="button" aria-pressed={value === 0} onClick={() => onChange(0)}>RED</button>
      <button type="button" aria-pressed={value === 1} onClick={() => onChange(1)}>GREEN</button>
    </div>
  );
}

function ScorePicker({
  value,
  onChange,
}: {
  value: ScoreLimit;
  onChange: (scoreLimit: ScoreLimit) => void;
}) {
  const choices: Array<{ value: ScoreLimit; label: string }> = [
    { value: 5, label: "5" },
    { value: 10, label: "10" },
    { value: 20, label: "20" },
    { value: null, label: "NO LIMIT" },
  ];
  return (
    <div className="choice-group score-picker" role="group" aria-label="Winning score">
      <span>WIN AT</span>
      {choices.map((choice) => (
        <button
          key={choice.label}
          type="button"
          aria-pressed={value === choice.value}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

function makeAttractGame() {
  const state = createGame("free-for-all", null);
  addPlayer(state, "attract-one", "YELLOW");
  addPlayer(state, "attract-two", "RED");
  return state;
}

function limitLabel(scoreLimit: ScoreLimit) {
  return scoreLimit === null ? "NO LIMIT" : `FIRST TO ${scoreLimit}`;
}

function winnerLabel(
  winner: NonNullable<GameState["winner"]>,
  pilots: Array<{ id: string; name: string; team: Team | null }>,
) {
  if (winner.kind === "team") return winner.team === 0 ? "RED TEAM" : "GREEN TEAM";
  return pilots.find((pilot) => pilot.id === winner.playerId)?.name ?? "PILOT";
}

function sanitizeInput(input: PilotInput): PilotInput {
  return {
    turn: input?.turn === -1 || input?.turn === 1 ? input.turn : 0,
    fire: Boolean(input?.fire),
    bomb: Boolean(input?.bomb),
    roll: Boolean(input?.roll),
    aimUp: Boolean(input?.aimUp),
  };
}

function modeLabel(mode: Mode) {
  if (mode === "practice") return "PRACTICE DUEL";
  if (mode === "host") return "LEAD PILOT";
  if (mode === "guest") return "FORMATION PILOT";
  return "AIRFIELD 01";
}

function wakeAudio(
  audioRef: React.MutableRefObject<AudioContext | null>,
  engineSoundRef: React.MutableRefObject<EngineSound | null>,
) {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  audioRef.current ??= new AudioContext();
  if (!engineSoundRef.current) {
    const oscillator = audioRef.current.createOscillator();
    const gain = audioRef.current.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 58;
    gain.gain.value = 0.0001;
    oscillator.connect(gain).connect(audioRef.current.destination);
    oscillator.start();
    engineSoundRef.current = { oscillator, gain };
  }
  void audioRef.current.resume();
}

function updateEngineSound(
  context: AudioContext | null,
  engine: EngineSound | null,
  plane: Plane | undefined,
  playing: boolean,
  talking: boolean,
) {
  if (!context || !engine) return;
  const active = Boolean(playing && plane?.alive);
  const speed = plane ? Math.min(240, Math.hypot(plane.vx, plane.vy)) : 0;
  engine.oscillator.frequency.setTargetAtTime(44 + speed * 0.09, context.currentTime, 0.08);
  const activeVolume = talking ? 0.0007 : 0.0045;
  engine.gain.gain.setTargetAtTime(active ? activeVolume : 0.0001, context.currentTime, 0.06);
}

function updateMusic(
  context: AudioContext | null,
  music: MusicSound,
  screen: Screen,
  ducked: boolean,
  action: boolean,
) {
  if (!context) return;
  if (!music.master) {
    music.master = context.createGain();
    music.master.gain.value = 0.0001;
    music.master.connect(context.destination);
  }

  const nextMode: MusicMode = screen === "playing" ? action ? "action" : "game" : "menu";
  if (music.mode !== nextMode) {
    music.mode = nextMode;
    music.step = 0;
    music.nextBeatAt = context.currentTime + 0.04;
  }
  const fullVolume = nextMode === "menu" ? 0.32 : nextMode === "action" ? 0.17 : 0.13;
  music.master.gain.setTargetAtTime(ducked ? 0.018 : fullVolume, context.currentTime, 0.16);

  const beatLength = nextMode === "menu" ? 0.72 : nextMode === "action" ? 0.24 : 0.9;
  while (music.nextBeatAt < context.currentTime + 0.3) {
    if (nextMode === "menu") scheduleMenuBeat(context, music.master, music.step, music.nextBeatAt, beatLength);
    else if (nextMode === "action") scheduleActionBeat(context, music.master, music.step, music.nextBeatAt, beatLength);
    else scheduleGameBeat(context, music.master, music.step, music.nextBeatAt, beatLength);
    music.step = (music.step + 1) % 16;
    music.nextBeatAt += beatLength;
  }
}

function scheduleActionBeat(
  context: AudioContext,
  destination: AudioNode,
  step: number,
  start: number,
  beat: number,
) {
  const notes = [110, 146.83, 164.81, 196, 164.81, 146.83, 123.47, 164.81];
  scheduleMusicTone(context, destination, notes[step % notes.length], start, beat * 0.72, 0.017);
  if (step % 4 === 0) scheduleMusicTone(context, destination, 55, start, beat * 1.5, 0.026);
  if (step % 2 === 1) scheduleMusicTone(context, destination, 880, start, 0.025, 0.006);
}

function scheduleMenuBeat(
  context: AudioContext,
  destination: AudioNode,
  step: number,
  start: number,
  beat: number,
) {
  const chords = [
    [73.42, 87.31, 110, 146.83],
    [58.27, 73.42, 87.31, 116.54],
    [65.41, 82.41, 98, 130.81],
    [55, 65.41, 82.41, 110],
  ];
  if (step % 4 === 0) {
    schedulePad(context, destination, chords[Math.floor(step / 4)], start, beat * 4.15, 0.036, 720, 0.55);
  }
}

function scheduleGameBeat(
  context: AudioContext,
  destination: AudioNode,
  step: number,
  start: number,
  beat: number,
) {
  const chords = [
    [55, 65.41, 82.41, 110],
    [49, 58.27, 73.42, 98],
    [58.27, 69.3, 87.31, 116.54],
    [46.25, 55, 69.3, 92.5],
  ];
  if (step % 4 === 0) {
    schedulePad(context, destination, chords[Math.floor(step / 4)], start, beat * 4.2, 0.018, 520, 0.95);
  }
}

function schedulePad(
  context: AudioContext,
  destination: AudioNode,
  frequencies: readonly number[],
  start: number,
  duration: number,
  volume: number,
  brightness: number,
  attack: number,
) {
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(brightness * 0.72, start);
  filter.frequency.linearRampToValueAtTime(brightness, start + attack);
  filter.Q.value = 0.7;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.linearRampToValueAtTime(volume, start + attack);
  envelope.gain.setValueAtTime(volume, start + duration - 0.75);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  filter.connect(envelope).connect(destination);

  const detunes = [-7, 5, -3, 8];
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const voice = context.createGain();
    oscillator.type = index % 2 === 0 ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime(detunes[index % detunes.length], start);
    voice.gain.value = index === 0 ? 0.34 : 0.22;
    oscillator.connect(voice).connect(filter);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  });
}

function scheduleMusicTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.012);
  gain.gain.setValueAtTime(volume, Math.max(start + 0.013, start + duration - 0.035));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playNewSounds(
  state: GameState,
  lastEventRef: React.MutableRefObject<number>,
  audioRef: React.MutableRefObject<AudioContext | null>,
  localPlayerId: string,
  computerVoiceBusyRef: React.MutableRefObject<number>,
  flashRadio: (text: string, duration?: number) => void,
) {
  const context = audioRef.current;
  if (!context) return;
  const announce = (message: string) => {
    computerVoice(context, message, computerVoiceBusyRef);
    flashRadio(message, 1700);
  };
  for (const event of state.events) {
    if (event.id <= lastEventRef.current) continue;
    lastEventRef.current = event.id;
    if (event.type === "shot") pixelGunshot(context);
    if (event.type === "reload") pixelReload(context);
    if (event.type === "roll") pixelRoll(context);
    if (event.type === "crash") pixelExplosion(context);
    if (event.type === "sea-crash") pixelSplash(context);
    if (event.type === "sea-sink") pixelSplash(context);
    if (event.type === "score" && !state.winner) {
      const pilot = state.players.find((candidate) => candidate.id === event.playerId);
      heroicFanfare(context, pilot?.spawnIndex ?? 0);
    }
    if (event.type === "stall") tone(context, 120, 0.12, "triangle", 0.025);
    if (event.type === "bomb-pickup") {
      suspenseFanfare(context);
    }
    if (event.type === "bomb-drop") {
      tone(context, 150, 0.13, "square", 0.035);
      if (event.playerId === localPlayerId) announce("BOMB HATCH OPEN");
    }
    if (event.type === "bomb-explosion") pixelBombExplosion(context);
    if (event.type === "missile-award") {
      missileAwardFanfare(context);
      if (event.playerId === localPlayerId) announce("MISSILE ARMED");
    }
    if (event.type === "missile-launch") pixelMissileLaunch(context);
    if (event.type === "missile-hit") pixelMissileHit(context);
    if (event.type === "plane-hit") tone(context, 95, 0.1, "square", 0.028);
    if (event.type === "mayday" && event.targetId === localPlayerId) announce("MAYDAY MAYDAY");
    if (event.type === "pilot-eject") {
      sweptTone(context, 420, 150, 0.28, "square", 0.024);
      if (event.playerId === localPlayerId) announce("EJECT EJECT");
    }
    if (event.type === "pilot-gun") tone(context, 520, 0.035, "square", 0.018);
    if (event.type === "pilot-shot") pixelExplosion(context);
    if (event.type === "pilot-bombed") pixelBombExplosion(context);
    if (event.type === "pilot-vaporized") sweptTone(context, 940, 90, 0.32, "square", 0.04);
    if (event.type === "victory") victoryFanfare(context);
  }
}

function computerVoice(
  context: AudioContext,
  message: string,
  busyRef: React.MutableRefObject<number>,
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(message.replaceAll(" ", ". "));
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find((voice) => /zarvox/i.test(voice.name))
    ?? voices.find((voice) => /fred|ralph|trinoids/i.test(voice.name))
    ?? voices.find((voice) => /^en[-_]/i.test(voice.lang));
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.lang = "en-US";
  utterance.rate = 0.72;
  utterance.pitch = 0.48;
  utterance.volume = 0.62;

  busyRef.current += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    busyRef.current = Math.max(0, busyRef.current - 1);
  };
  utterance.onend = release;
  utterance.onerror = release;

  const start = context.currentTime;
  scheduleEffectTone(context, 720, start, 0.045, 0.018);
  scheduleEffectTone(context, 510, start + 0.065, 0.055, 0.016);
  window.speechSynthesis.speak(utterance);
}

function victoryFanfare(context: AudioContext) {
  const start = context.currentTime;
  const melody = [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5];
  melody.forEach((frequency, index) => {
    scheduleEffectTone(context, frequency, start + index * 0.13, index === melody.length - 1 ? 0.72 : 0.16, 0.045);
    if (index >= 3) scheduleEffectTone(context, frequency * 0.75, start + index * 0.13, 0.2, 0.022);
  });
}

function heroicFanfare(context: AudioContext, pilotIndex: number) {
  const roots = [261.63, 293.66, 329.63, 349.23, 392, 440];
  const patterns = [
    [1, 1.5, 2, 2.5],
    [1, 1.333, 2, 2.667],
    [1, 1.25, 1.875, 2.5],
    [1, 1.5, 1.75, 2.25],
    [1, 1.2, 1.6, 2.4],
    [1, 1.333, 1.667, 2.667],
  ];
  const index = Math.abs(pilotIndex) % roots.length;
  const start = context.currentTime;
  patterns[index].forEach((multiple, note) => {
    scheduleEffectTone(context, roots[index] * multiple, start + note * 0.075, note === 3 ? 0.24 : 0.09, 0.032);
  });
}

function suspenseFanfare(context: AudioContext) {
  const start = context.currentTime;
  [220, 233.08, 185, 164.81].forEach((frequency, index) => {
    scheduleEffectTone(context, frequency, start + index * 0.105, index === 3 ? 0.3 : 0.13, 0.032);
  });
}

function missileAwardFanfare(context: AudioContext) {
  const start = context.currentTime;
  [329.63, 493.88, 659.25, 987.77].forEach((frequency, index) => {
    scheduleEffectTone(context, frequency, start + index * 0.055, index === 3 ? 0.24 : 0.08, 0.035);
  });
}

function pixelReload(context: AudioContext) {
  scheduleEffectTone(context, 105, context.currentTime, 0.035, 0.025);
  scheduleEffectTone(context, 150, context.currentTime + 1.16, 0.045, 0.022);
  scheduleEffectTone(context, 225, context.currentTime + 1.22, 0.055, 0.02);
}

function pixelRoll(context: AudioContext) {
  sweptTone(context, 740, 185, 0.34, "square", 0.022);
}

function pixelMissileLaunch(context: AudioContext) {
  sweptTone(context, 115, 72, 0.18, "square", 0.028);
  window.setTimeout(
    () => sweptTone(context, 260, 780, 0.28, "sawtooth", 0.035),
    MISSILE_DROP_TIME * 1000,
  );
}

function pixelMissileHit(context: AudioContext) {
  pixelExplosion(context);
  tone(context, 180, 0.16, "square", 0.027);
}

function scheduleEffectTone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
) {
  scheduleMusicTone(context, context.destination, frequency, start, duration, volume);
}

function pixelBombExplosion(context: AudioContext) {
  pixelExplosion(context);
  tone(context, 58, 0.42, "square", 0.075);
  window.setTimeout(() => pixelExplosion(context), 70);
}

function pixelSplash(context: AudioContext) {
  sweptTone(context, 180, 42, 0.38, "triangle", 0.04);
  tone(context, 72, 0.22, "square", 0.022);
}

function pixelExplosion(context: AudioContext) {
  const duration = 0.34;
  const frameCount = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let held = 0;
  for (let index = 0; index < frameCount; index += 1) {
    if (index % 11 === 0) held = Math.round((Math.random() * 2 - 1) * 4) / 4;
    const envelope = Math.pow(1 - index / frameCount, 1.7);
    samples[index] = held * envelope;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 1250;
  filter.Q.value = 0.55;
  gain.gain.value = 0.12;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  tone(context, 92, 0.2, "square", 0.038);
}

function pixelGunshot(context: AudioContext) {
  const duration = 0.055;
  const frameCount = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let held = 0;
  for (let index = 0; index < frameCount; index += 1) {
    if (index % 7 === 0) held = Math.random() > 0.5 ? 0.8 : -0.8;
    samples[index] = held * (1 - index / frameCount);
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = 900;
  gain.gain.value = 0.065;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  tone(context, 340, duration, "square", 0.035);
}

function tone(context: AudioContext, frequency: number, duration: number, type: OscillatorType, volume: number) {
  sweptTone(context, frequency, Math.max(30, frequency * 0.55), duration, type, volume);
}

function sweptTone(
  context: AudioContext,
  startFrequency: number,
  endFrequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), context.currentTime + duration);
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return window.btoa(binary);
}

function base64ToBlob(data: string, mimeType: string) {
  const binary = window.atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function enqueueRadioClip(
  clip: VoiceClipPayload,
  playerId: string,
  pilotName: string,
  audioRef: React.MutableRefObject<AudioContext | null>,
  queueRef: React.MutableRefObject<QueuedVoiceClip[]>,
  playingRef: React.MutableRefObject<boolean>,
  audioElementRef: React.MutableRefObject<HTMLAudioElement | null>,
  urlRef: React.MutableRefObject<string>,
  announce: (text: string, duration?: number) => void,
  pausePlayback: boolean,
) {
  if (queueRef.current.length >= 4) queueRef.current.shift();
  queueRef.current.push({ ...clip, playerId, pilotName });
  if (pausePlayback) return;
  drainRadioQueue(audioRef, queueRef, playingRef, audioElementRef, urlRef, announce);
}

function drainRadioQueue(
  audioRef: React.MutableRefObject<AudioContext | null>,
  queueRef: React.MutableRefObject<QueuedVoiceClip[]>,
  playingRef: React.MutableRefObject<boolean>,
  audioElementRef: React.MutableRefObject<HTMLAudioElement | null>,
  urlRef: React.MutableRefObject<string>,
  announce: (text: string, duration?: number) => void,
) {
  if (playingRef.current) return;
  const clip = queueRef.current.shift();
  const context = audioRef.current;
  if (!clip || !context) return;

  playingRef.current = true;
  const url = URL.createObjectURL(base64ToBlob(clip.data, clip.mimeType));
  const audio = new Audio(url);
  const source = context.createMediaElementSource(audio);
  const highpass = context.createBiquadFilter();
  const lowpass = context.createBiquadFilter();
  const distortion = context.createWaveShaper();
  const gain = context.createGain();
  highpass.type = "highpass";
  highpass.frequency.value = 360;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2_650;
  distortion.curve = radioDistortionCurve();
  distortion.oversample = "2x";
  gain.gain.value = 0.72;
  source.connect(highpass).connect(lowpass).connect(distortion).connect(gain).connect(context.destination);
  audioElementRef.current = audio;
  urlRef.current = url;
  announce(`RADIO / ${clip.pilotName}`, 1800);
  tone(context, 1_450, 0.045, "square", 0.025);
  void context.resume();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    audio.onended = null;
    audio.onerror = null;
    source.disconnect();
    highpass.disconnect();
    lowpass.disconnect();
    distortion.disconnect();
    gain.disconnect();
    URL.revokeObjectURL(url);
    if (audioElementRef.current === audio) audioElementRef.current = null;
    if (urlRef.current === url) urlRef.current = "";
    playingRef.current = false;
    if (context.state !== "closed") tone(context, 760, 0.035, "square", 0.018);
    window.setTimeout(
      () => drainRadioQueue(audioRef, queueRef, playingRef, audioElementRef, urlRef, announce),
      90,
    );
  };
  audio.onended = finish;
  audio.onerror = finish;
  void audio.play().catch(finish);
}

function radioDistortionCurve() {
  const curve = new Float32Array(256);
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(x * 2.4) * 0.88;
  }
  return curve;
}

function clearVoicePlayback(
  queueRef: React.MutableRefObject<QueuedVoiceClip[]>,
  playingRef: React.MutableRefObject<boolean>,
  audioElementRef: React.MutableRefObject<HTMLAudioElement | null>,
  urlRef: React.MutableRefObject<string>,
) {
  queueRef.current = [];
  const audio = audioElementRef.current;
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audioElementRef.current = null;
  }
  if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  urlRef.current = "";
  playingRef.current = false;
}

function stopMediaStream(streamRef: React.MutableRefObject<MediaStream | null>) {
  for (const track of streamRef.current?.getTracks() ?? []) track.stop();
  streamRef.current = null;
}

function discardVoiceCapture(
  recorderRef: React.MutableRefObject<MediaRecorder | null>,
  streamRef: React.MutableRefObject<MediaStream | null>,
  chunksRef: React.MutableRefObject<Blob[]>,
  pendingRef: React.MutableRefObject<boolean>,
) {
  pendingRef.current = false;
  const recorder = recorderRef.current;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onstop = null;
    if (recorder.state === "recording") recorder.stop();
  }
  recorderRef.current = null;
  chunksRef.current = [];
  stopMediaStream(streamRef);
}
