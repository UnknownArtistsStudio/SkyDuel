"use client";

declare global {
  interface Window {
    SKY_WARS_ROOM_ORIGIN?: string;
  }
}

export type RoomInfo = {
  code: string;
  peerId: string;
  hostPeerId: string;
  isHost: boolean;
  name: string;
};

type Signal = {
  id: number;
  senderPeerId: string;
  kind: "peer-joined" | "peer-left" | "offer" | "answer" | "ice";
  payload: unknown;
};

type PeerRecord = {
  connection: RTCPeerConnection;
  channel?: RTCDataChannel;
};

export class PeerRoom {
  readonly info: RoomInfo;
  onMessage?: (peerId: string, message: unknown) => void;
  onPeerOpen?: (peerId: string, name?: string) => void;
  onPeerClose?: (peerId: string) => void;
  onStatus?: (status: string) => void;

  private peers = new Map<string, PeerRecord>();
  private peerNames = new Map<string, string>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private cursor = 0;
  private active = true;
  private polling = false;

  private constructor(info: RoomInfo) {
    this.info = info;
  }

  static async create(name: string): Promise<PeerRoom> {
    const info = await api<RoomInfo>("/api/game/create", { name });
    const room = new PeerRoom(info);
    room.poll();
    return room;
  }

  static async join(code: string, name: string): Promise<PeerRoom> {
    const info = await api<RoomInfo>("/api/game/join", { code, name });
    const room = new PeerRoom(info);
    room.poll();
    return room;
  }

  sendToHost(message: unknown) {
    if (this.info.isHost) return;
    this.sendTo(this.info.hostPeerId, message);
  }

  sendTo(peerId: string, message: unknown) {
    const channel = this.peers.get(peerId)?.channel;
    if (channel?.readyState === "open") channel.send(JSON.stringify(message));
  }

  broadcast(message: unknown) {
    const encoded = JSON.stringify(message);
    for (const peer of this.peers.values()) {
      if (peer.channel?.readyState === "open") peer.channel.send(encoded);
    }
  }

  async close() {
    if (!this.active) return;
    this.active = false;
    for (const peer of this.peers.values()) {
      peer.channel?.close();
      peer.connection.close();
    }
    this.peers.clear();
    const body = JSON.stringify({ code: this.info.code, peerId: this.info.peerId });
    const leaveUrl = roomApiUrl("/api/game/leave");
    if (!window.SKY_WARS_ROOM_ORIGIN && navigator.sendBeacon) {
      navigator.sendBeacon(leaveUrl, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(leaveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      });
    }
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    while (this.active) {
      try {
        const response = await fetch(
          roomApiUrl(`/api/game/signals?code=${encodeURIComponent(this.info.code)}&peer=${encodeURIComponent(this.info.peerId)}&after=${this.cursor}`),
          { cache: "no-store" },
        );
        if (!response.ok) {
          const problem = (await response.json()) as { error?: string };
          throw new Error(problem.error ?? "Room connection lost.");
        }
        const data = (await response.json()) as { signals: Signal[] };
        for (const signal of data.signals) {
          this.cursor = Math.max(this.cursor, signal.id);
          await this.handleSignal(signal);
        }
      } catch (error) {
        if (this.active) this.onStatus?.(error instanceof Error ? error.message : "Room connection lost.");
      }
      await delay(450);
    }
    this.polling = false;
  }

  private async handleSignal(signal: Signal) {
    if (signal.kind === "peer-joined" && this.info.isHost) {
      const payload = signal.payload as { name?: string };
      this.peerNames.set(signal.senderPeerId, payload.name ?? "PILOT");
      await this.connectToPeer(signal.senderPeerId, true);
      return;
    }
    if (signal.kind === "peer-left") {
      this.closePeer(signal.senderPeerId);
      return;
    }
    if (signal.kind === "ice") {
      const candidate = signal.payload as RTCIceCandidateInit;
      const peer = this.peers.get(signal.senderPeerId);
      if (peer?.connection.remoteDescription) {
        await peer.connection.addIceCandidate(candidate).catch(() => undefined);
      } else {
        const queued = this.pendingIce.get(signal.senderPeerId) ?? [];
        queued.push(candidate);
        this.pendingIce.set(signal.senderPeerId, queued);
      }
      return;
    }
    if (signal.kind === "offer" && !this.info.isHost) {
      const peer = await this.connectToPeer(signal.senderPeerId, false);
      await peer.connection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      await this.flushIce(signal.senderPeerId);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await this.signal(signal.senderPeerId, "answer", answer);
      return;
    }
    if (signal.kind === "answer" && this.info.isHost) {
      const peer = this.peers.get(signal.senderPeerId);
      if (!peer) return;
      await peer.connection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
      await this.flushIce(signal.senderPeerId);
    }
  }

  private async connectToPeer(peerId: string, initiator: boolean): Promise<PeerRecord> {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    });
    const peer: PeerRecord = { connection };
    this.peers.set(peerId, peer);
    connection.onicecandidate = (event) => {
      if (event.candidate) void this.signal(peerId, "ice", event.candidate.toJSON());
    };
    connection.onconnectionstatechange = () => {
      if (["closed", "failed", "disconnected"].includes(connection.connectionState)) this.closePeer(peerId);
    };
    connection.ondatachannel = (event) => this.attachChannel(peerId, event.channel);

    if (initiator) {
      this.attachChannel(peerId, connection.createDataChannel("sky-wars"));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await this.signal(peerId, "offer", offer);
    }
    return peer;
  }

  private attachChannel(peerId: string, channel: RTCDataChannel) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.channel = channel;
    channel.onopen = () => {
      this.onPeerOpen?.(peerId, this.peerNames.get(peerId));
    };
    channel.onmessage = (event) => {
      try {
        this.onMessage?.(peerId, JSON.parse(String(event.data)));
      } catch {
        // Ignore malformed peer messages.
      }
    };
    channel.onclose = () => this.closePeer(peerId);
  }

  private async flushIce(peerId: string) {
    const peer = this.peers.get(peerId);
    const candidates = this.pendingIce.get(peerId) ?? [];
    this.pendingIce.delete(peerId);
    for (const candidate of candidates) {
      await peer?.connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  private closePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.channel?.close();
    peer.connection.close();
    this.peers.delete(peerId);
    this.pendingIce.delete(peerId);
    this.onPeerClose?.(peerId);
  }

  private signal(targetPeerId: string, kind: "offer" | "answer" | "ice", payload: unknown) {
    return api<{ ok: boolean }>("/api/game/signal", {
      code: this.info.code,
      senderPeerId: this.info.peerId,
      targetPeerId,
      kind,
      payload,
    });
  }
}

async function api<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(roomApiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The tower did not answer.");
  return payload;
}

function roomApiUrl(path: string) {
  const origin = typeof window === "undefined"
    ? ""
    : (window.SKY_WARS_ROOM_ORIGIN ?? "").replace(/\/$/, "");
  return `${origin}${path}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
