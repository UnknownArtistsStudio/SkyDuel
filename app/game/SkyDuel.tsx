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
import { PeerRoom } from "./peer-room";
import { pilotReadout, renderGame } from "./render-game";

type Screen = "title" | "menu" | "join" | "connecting" | "playing";
type Mode = "practice" | "host" | "guest" | null;
type NetworkMessage =
  | { type: "hello"; name: string; teamPreference: TeamPreference }
  | { type: "input"; input: PilotInput }
  | { type: "welcome"; playerId: string; state: GameState }
  | { type: "snapshot"; state: GameState };
type EngineSound = { oscillator: OscillatorNode; gain: GainNode };

const neutralInput: PilotInput = { turn: 0, fire: false };

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

  const { readout, pilots, scoreLimit: activeScoreLimit, winner } = hud;

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
      if (role === "host") setMessage(`${cleanName(name ?? "PILOT")} is joining…`);
    };
    room.onPeerClose = (peerId) => {
      if (role === "host") {
        removePlayer(gameRef.current, peerId);
        delete remoteInputsRef.current[peerId];
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
    };
  }, []);

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
  }, [callsign, scoreLimit]);

  const createRoom = useCallback(async () => {
    setError("");
    setMessage("Calling the tower…");
    setScreen("connecting");
    wakeAudio(audioRef, engineSoundRef);
    try {
      const room = await PeerRoom.create(cleanName(callsign));
      const state = createGame(matchMode, scoreLimit);
      addPlayer(state, room.info.peerId, room.info.name, teamPreference);
      gameRef.current = state;
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
  }, [callsign, matchMode, scoreLimit, setupRoom, teamPreference]);

  const joinRoom = useCallback(async () => {
    const code = joinCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (code.length !== 4) {
      setError("Enter the four-letter room code.");
      return;
    }
    setError("");
    setMessage("Looking for that formation…");
    setScreen("connecting");
    wakeAudio(audioRef, engineSoundRef);
    try {
      const room = await PeerRoom.join(code, cleanName(callsign));
      roomRef.current = room;
      localIdRef.current = room.info.peerId;
      setupRoom(room, "guest", cleanName(callsign), teamPreference);
      setRoomCode(room.info.code);
      setMode("guest");
      setMessage("Negotiating a direct connection to the lead pilot…");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That room could not be joined.");
      setScreen("join");
    }
  }, [callsign, joinCode, setupRoom, teamPreference]);

  const leaveGame = useCallback(() => {
    void roomRef.current?.close();
    roomRef.current = null;
    gameRef.current = makeAttractGame();
    lastSoundEventRef.current = 0;
    localIdRef.current = "";
    inputRef.current = { ...neutralInput };
    remoteInputsRef.current = {};
    setMode(null);
    setRoomCode("");
    setMessage("Engine on. First to 10 wins.");
    setScreen("menu");
  }, []);

  const restartRound = useCallback(() => {
    const state = gameRef.current;
    resetRound(state);
    setMessage("New round. Clear skies.");
    if (mode === "host") {
      roomRef.current?.broadcast({ type: "snapshot", state } satisfies NetworkMessage);
    }
  }, [mode]);

  useEffect(() => {
    const keys = new Set<string>();
    const refreshInput = () => {
      const left = ["a", "arrowleft", "w", "arrowup"].some((key) => keys.has(key));
      const right = ["d", "arrowright", "s", "arrowdown"].some((key) => keys.has(key));
      inputRef.current = {
        turn: left === right ? 0 : left ? -1 : 1,
        fire: keys.has(" ") || keys.has("enter"),
      };
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "enter" && screen === "title") {
        event.preventDefault();
        pressStart();
        return;
      }
      if (["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter"].includes(key)) {
        if (screen === "playing") event.preventDefault();
        if (screen === "playing") void audioRef.current?.resume();
        keys.add(key);
        refreshInput();
      }
      if (key === "escape" && screen === "playing") leaveGame();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
      refreshInput();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => keys.clear());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [leaveGame, pressStart, screen]);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    let lastBroadcast = 0;
    let lastHud = 0;
    const frame = (time: number) => {
      const dt = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      const state = gameRef.current;

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
      updateEngineSound(
        audioRef.current,
        engineSoundRef.current,
        localPlane,
        screen === "playing" && !state.winner,
      );
      playNewSounds(state, lastSoundEventRef, audioRef);
      if (canvasRef.current) renderGame(canvasRef.current, state, localIdRef.current, time);
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
  }, [mode, screen]);

  useEffect(() => () => {
    void roomRef.current?.close();
    engineSoundRef.current?.oscillator.stop();
    void audioRef.current?.close();
  }, []);

  const touchControl = (field: "left" | "right" | "fire", pressed: boolean) => {
    if (pressed) void audioRef.current?.resume();
    if (field === "fire") inputRef.current = { ...inputRef.current, fire: pressed };
    if (field === "left") inputRef.current = { ...inputRef.current, turn: pressed ? -1 : 0 };
    if (field === "right") inputRef.current = { ...inputRef.current, turn: pressed ? 1 : 0 };
  };

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
              {modeLabel(mode)} · {mode === "practice" ? "FREE FOR ALL" : matchMode === "teams" ? "TEAMS" : "FREE FOR ALL"} · {limitLabel(activeScoreLimit)}
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
                {readout.protected ? "SAFE · GUNS OFF" : readout.stalled ? "STALL · NOSE DOWN" : "A D TURN · SPACE FIRE"}
              </span>
              <span>ALT <strong>{readout.altitude}</strong></span>
            </div>

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

            <div className="touch-controls" aria-label="Touch flight controls">
              <button
                type="button"
                aria-label="Rotate left"
                onPointerDown={() => touchControl("left", true)}
                onPointerUp={() => touchControl("left", false)}
                onPointerCancel={() => touchControl("left", false)}
              >
                ↶
              </button>
              <button
                className="touch-fire"
                type="button"
                aria-label="Fire"
                onPointerDown={() => touchControl("fire", true)}
                onPointerUp={() => touchControl("fire", false)}
                onPointerCancel={() => touchControl("fire", false)}
              >
                FIRE
              </button>
              <button
                type="button"
                aria-label="Rotate right"
                onPointerDown={() => touchControl("right", true)}
                onPointerUp={() => touchControl("right", false)}
                onPointerCancel={() => touchControl("right", false)}
              >
                ↷
              </button>
            </div>
          </>
        )}

        {screen !== "title" && screen !== "playing" && (
          <div className="hangar-overlay">
            {screen === "menu" && (
              <div className="menu-card">
                <p className="menu-eyebrow">SKY DUEL · 2–6 PILOTS</p>
                <h1>SELECT GAME</h1>
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
                  <button type="button" onClick={beginPractice}>PRACTICE</button>
                  <button className="button-primary" type="button" onClick={createRoom}>CREATE ROOM</button>
                  <button type="button" onClick={() => { setError(""); setScreen("join"); }}>JOIN ROOM</button>
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
                  <button className="button-primary" type="button" onClick={joinRoom}>JOIN</button>
                  <button type="button" onClick={() => setScreen("menu")}>BACK</button>
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
) {
  if (!context || !engine) return;
  const active = Boolean(playing && plane?.alive);
  const speed = plane ? Math.min(240, Math.hypot(plane.vx, plane.vy)) : 0;
  engine.oscillator.frequency.setTargetAtTime(44 + speed * 0.09, context.currentTime, 0.08);
  engine.gain.gain.setTargetAtTime(active ? 0.014 : 0.0001, context.currentTime, 0.06);
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
    if (event.type === "shot") tone(context, 210, 0.028, "square", 0.016);
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
