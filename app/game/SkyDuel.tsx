"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPlayer,
  botInput,
  cleanName,
  createGame,
  removePlayer,
  resetRound,
  stepGame,
  type GameState,
  type MatchMode,
  type PilotInput,
  type Plane,
  type ScoreLimit,
  type Team,
  type TeamPreference,
} from "../../lib/game-core";
import { CHAT_MAX_LENGTH, cleanChatText } from "../../lib/chat";
import { PeerRoom } from "./peer-room";
import { pilotReadout, renderGame, type ChatBubble } from "./render-game";

type Screen = "title" | "menu" | "join" | "connecting" | "playing";
type Mode = "practice" | "host" | "guest" | null;
type NetworkMessage =
  | { type: "hello"; name: string; teamPreference: TeamPreference }
  | { type: "input"; input: PilotInput }
  | { type: "welcome"; playerId: string; state: GameState }
  | { type: "snapshot"; state: GameState }
  | { type: "chat-request"; text: string }
  | { type: "chat"; playerId: string; text: string };
type EngineSound = { oscillator: OscillatorNode; gain: GainNode };
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

const neutralInput: PilotInput = { turn: 0, fire: false };
const CHAT_DURATION = 4600;
const CHAT_COOLDOWN = 900;

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
  const chatBubblesRef = useRef<ChatBubble[]>([]);
  const chatRateRef = useRef(new Map<string, number>());
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionStoppingRef = useRef(false);
  const recognitionTimerRef = useRef<number | null>(null);
  const radioMessageTimerRef = useRef<number | null>(null);
  const recognitionTranscriptRef = useRef("");
  const isTalkingRef = useRef(false);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [screen, setScreen] = useState<Screen>("title");
  const [mode, setMode] = useState<Mode>(null);
  const [matchMode, setMatchMode] = useState<MatchMode>("free-for-all");
  const [scoreLimit, setScoreLimit] = useState<ScoreLimit>(10);
  const [teamPreference, setTeamPreference] = useState<TeamPreference>("auto");
  const [callsign, setCallsign] = useState("ACE");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [message, setMessage] = useState("Engine on. First to 10 wins.");
  const [error, setError] = useState("");
  const [hud, setHud] = useState<{
    readout: ReturnType<typeof pilotReadout>;
    pilots: Array<{ id: string; name: string; color: string; score: number; team: Team | null }>;
    scoreLimit: ScoreLimit;
    winner: GameState["winner"];
  }>({
    readout: { speed: 0, altitude: 0, stalled: false, protected: false, alive: false, respawnIn: 0 },
    pilots: [],
    scoreLimit: 10,
    winner: null,
  });
  const [copied, setCopied] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatInputOpen, setChatInputOpen] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [radioMessage, setRadioMessage] = useState("");
  const [lastChatLine, setLastChatLine] = useState("");

  const { readout, pilots, scoreLimit: activeScoreLimit, winner } = hud;

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

  const clearChat = useCallback(() => {
    if (radioMessageTimerRef.current !== null) {
      window.clearTimeout(radioMessageTimerRef.current);
      radioMessageTimerRef.current = null;
    }
    chatBubblesRef.current = [];
    chatRateRef.current.clear();
    setChatDraft("");
    setChatInputOpen(false);
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
        setMessage("A pilot left the formation.");
      } else if (peerId === room.info.hostPeerId) {
        setError("The room closed when its lead pilot left.");
        setScreen("menu");
        setMode(null);
        gameRef.current = makeAttractGame();
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
      if (role === "guest" && incoming.type === "welcome") {
        localIdRef.current = incoming.playerId;
        gameRef.current = incoming.state;
        lastSoundEventRef.current = 0;
        setMatchMode(incoming.state.matchMode);
        setScoreLimit(incoming.state.scoreLimit);
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
    };
  }, [acceptChat, showChat]);

  const pressStart = useCallback(() => {
    wakeAudio(audioRef, engineSoundRef);
    setScreen("menu");
  }, []);

  const beginPractice = useCallback(() => {
    void roomRef.current?.close();
    roomRef.current = null;
    const state = createGame("free-for-all", scoreLimit);
    const playerId = `pilot-${crypto.randomUUID()}`;
    addPlayer(state, playerId, cleanName(callsign));
    addPlayer(state, "practice-rival", "RIVAL");
    gameRef.current = state;
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
  }, [callsign, clearChat, scoreLimit]);

  const createRoom = useCallback(async () => {
    setError("");
    setMessage("CALLING THE TOWER...");
    setScreen("connecting");
    wakeAudio(audioRef, engineSoundRef);
    try {
      const room = await PeerRoom.create(cleanName(callsign));
      const state = createGame(matchMode, scoreLimit);
      addPlayer(state, room.info.peerId, room.info.name, teamPreference);
      gameRef.current = state;
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
  }, [callsign, clearChat, matchMode, scoreLimit, setupRoom, teamPreference]);

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
    if (recognitionTimerRef.current !== null) window.clearTimeout(recognitionTimerRef.current);
    recognitionTimerRef.current = null;
    isTalkingRef.current = false;
    setIsTalking(false);
    void roomRef.current?.close();
    roomRef.current = null;
    gameRef.current = makeAttractGame();
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

  const openChatInput = useCallback(() => {
    setChatInputOpen(true);
    flashRadio("TYPE MESSAGE / ENTER SEND", 1500);
  }, [flashRadio]);

  const sendChat = useCallback((value: unknown) => {
    const text = cleanChatText(value);
    const playerId = localIdRef.current;
    const plane = gameRef.current.players.find((candidate) => candidate.id === playerId);
    setChatDraft("");
    setChatInputOpen(false);
    if (!text || !playerId) return;
    if (!plane?.alive || gameRef.current.winner) {
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

  const stopTalking = useCallback(() => {
    if (recognitionTimerRef.current !== null) {
      window.clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = null;
    }
    const recognition = recognitionRef.current;
    if (!recognition || recognitionStoppingRef.current) return;
    recognitionStoppingRef.current = true;
    try {
      recognition.stop();
    } catch {
      recognition.abort();
    }
  }, []);

  const startTalking = useCallback(() => {
    if (screen !== "playing" || recognitionRef.current) return;
    const plane = gameRef.current.players.find((candidate) => candidate.id === localIdRef.current);
    if (!plane?.alive || gameRef.current.winner) {
      flashRadio("RADIO OFF WHILE DOWN");
      return;
    }

    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      openChatInput();
      return;
    }

    wakeAudio(audioRef, engineSoundRef);
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
      const transcript = recognitionTranscriptRef.current;
      recognitionTranscriptRef.current = "";
      if (transcript) {
        sendChat(transcript);
        flashRadio("MESSAGE SENT");
      } else if (recognitionError === "not-allowed" || recognitionError === "service-not-allowed") {
        setChatInputOpen(true);
        flashRadio("MIC BLOCKED / TYPE MESSAGE", 2600);
      } else {
        flashRadio("NO MESSAGE HEARD");
      }
    };

    recognitionRef.current = recognition;
    isTalkingRef.current = true;
    setIsTalking(true);
    flashRadio("TRANSMITTING...", 0);
    try {
      recognition.start();
      recognitionTimerRef.current = window.setTimeout(stopTalking, 5000);
    } catch {
      recognitionRef.current = null;
      recognitionStoppingRef.current = false;
      isTalkingRef.current = false;
      setIsTalking(false);
      openChatInput();
    }
  }, [flashRadio, openChatInput, screen, sendChat, stopTalking]);

  const setArcadeTurn = useCallback((turn: -1 | 0 | 1) => {
    if (turn !== 0) void audioRef.current?.resume();
    inputRef.current = { ...inputRef.current, turn };
  }, []);

  const setArcadeFire = useCallback((fire: boolean) => {
    if (fire) void audioRef.current?.resume();
    inputRef.current = { ...inputRef.current, fire };
  }, []);

  useEffect(() => {
    if (chatInputOpen) chatInputRef.current?.focus();
  }, [chatInputOpen]);

  useEffect(() => {
    const keys = new Set<string>();
    const refreshInput = () => {
      const left = ["a", "arrowleft", "w", "arrowup"].some((key) => keys.has(key));
      const right = ["d", "arrowright", "s", "arrowdown"].some((key) => keys.has(key));
      inputRef.current = {
        turn: left === right ? 0 : left ? -1 : 1,
        fire: keys.has(" "),
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
      if (key === "enter" && screen === "playing") {
        event.preventDefault();
        openChatInput();
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
  }, [leaveGame, openChatInput, pressStart, screen, startTalking, stopTalking]);

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
      } else if (mode === "host") {
        stepGame(state, {
          ...remoteInputsRef.current,
          [localIdRef.current]: inputRef.current,
        }, dt);
        if (time - lastBroadcast > 66) {
          roomRef.current?.broadcast({ type: "snapshot", state } satisfies NetworkMessage);
          lastBroadcast = time;
        }
      } else if (mode === "guest" && time - lastBroadcast > 45) {
        roomRef.current?.sendToHost({ type: "input", input: inputRef.current } satisfies NetworkMessage);
        lastBroadcast = time;
      }

      const localPlane = state.players.find((plane) => plane.id === localIdRef.current);
      if (screen === "playing" && (!localPlane?.alive || state.winner)) {
        inputRef.current = { ...neutralInput };
        if (isTalkingRef.current) stopTalking();
      }
      updateEngineSound(
        audioRef.current,
        engineSoundRef.current,
        localPlane,
        screen === "playing" && !state.winner,
        isTalkingRef.current,
      );
      playNewSounds(state, lastSoundEventRef, audioRef);
      if (canvasRef.current) {
        renderGame(canvasRef.current, state, localIdRef.current, time, chatBubblesRef.current);
      }
      if (time - lastHud > 100) {
        setHud({
          readout: pilotReadout(state, localIdRef.current),
          pilots: state.players
            .map(({ id, name, color, score, team }) => ({ id, name, color, score, team }))
            .sort((a, b) => b.score - a.score),
          scoreLimit: state.scoreLimit,
          winner: state.winner,
        });
        lastHud = time;
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [mode, screen, stopTalking]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionStoppingRef.current = false;
    if (recognitionTimerRef.current !== null) window.clearTimeout(recognitionTimerRef.current);
    if (radioMessageTimerRef.current !== null) window.clearTimeout(radioMessageTimerRef.current);
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
              {modeLabel(mode)} / {mode === "practice" ? "FREE FOR ALL" : matchMode === "teams" ? "TEAMS" : "FREE FOR ALL"} / {limitLabel(activeScoreLimit)}
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

            <div className={`flight-readout ${readout.stalled ? "is-stalled" : ""}`}>
              <span>SPEED <strong>{readout.speed}</strong></span>
              <span>
                {readout.protected
                  ? "SAFE / GUNS OFF"
                  : readout.stalled
                    ? "STALL / NOSE DOWN"
                    : "A D TURN / SPACE FIRE / T TALK"}
              </span>
              <span>ALT <strong>{readout.altitude}</strong></span>
            </div>

            {radioMessage && (
              <div className={`radio-status ${isTalking ? "is-transmitting" : ""}`} role="status">
                {radioMessage}
              </div>
            )}

            {chatInputOpen && (
              <form
                className="chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendChat(chatDraft);
                }}
              >
                <label>
                  <span>MESSAGE &gt;</span>
                  <input
                    ref={chatInputRef}
                    value={chatDraft}
                    maxLength={CHAT_MAX_LENGTH}
                    autoComplete="off"
                    aria-label="Message to the other pilots"
                    onChange={(event) => setChatDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setChatDraft("");
                        setChatInputOpen(false);
                      }
                    }}
                  />
                </label>
                <button type="submit">SEND</button>
              </form>
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
              onTurn={setArcadeTurn}
              onFire={setArcadeFire}
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
                {matchMode === "teams" && (
                  <TeamPicker value={teamPreference} onChange={setTeamPreference} />
                )}
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
  onTurn,
  onFire,
  onTalkStart,
  onTalkEnd,
}: {
  disabled: boolean;
  isTalking: boolean;
  onTurn: (turn: -1 | 0 | 1) => void;
  onFire: (fire: boolean) => void;
  onTalkStart: () => void;
  onTalkEnd: () => void;
}) {
  const stickPointerRef = useRef<number | null>(null);
  const [stickX, setStickX] = useState(0);
  const [firing, setFiring] = useState(false);

  const releaseStick = useCallback(() => {
    stickPointerRef.current = null;
    setStickX(0);
    onTurn(0);
  }, [onTurn]);

  const moveStick = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (stickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const travel = Math.min(28, bounds.width * 0.28);
    const offset = Math.max(-travel, Math.min(travel, event.clientX - bounds.left - bounds.width / 2));
    setStickX(offset);
    onTurn(offset < -7 ? -1 : offset > 7 ? 1 : 0);
  }, [onTurn]);

  return (
    <div className="arcade-controls" aria-label="Arcade flight controls">
      <button
        className="arcade-stick"
        type="button"
        disabled={disabled}
        aria-label="Turn joystick"
        style={{ "--stick-x": `${disabled ? 0 : stickX}px` } as React.CSSProperties}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          stickPointerRef.current = event.pointerId;
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
        <span className="stick-label">TURN</span>
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

function playNewSounds(
  state: GameState,
  lastEventRef: React.MutableRefObject<number>,
  audioRef: React.MutableRefObject<AudioContext | null>,
) {
  const context = audioRef.current;
  if (!context) return;
  for (const event of state.events) {
    if (event.id <= lastEventRef.current) continue;
    lastEventRef.current = event.id;
    if (event.type === "shot") pixelGunshot(context);
    if (event.type === "crash") pixelExplosion(context);
    if (event.type === "stall") tone(context, 120, 0.12, "triangle", 0.025);
  }
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
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * 0.55), context.currentTime + duration);
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}
