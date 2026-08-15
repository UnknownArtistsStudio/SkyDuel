export const VOICE_CLIP_SECONDS = 3;
export const VOICE_MAX_BASE64_LENGTH = 80_000;
export const VOICE_COOLDOWN = 1_200;

export type VoiceClipPayload = {
  mimeType: string;
  data: string;
};

const ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg",
  "audio/ogg;codecs=opus",
]);

export function cleanVoiceClip(value: unknown): VoiceClipPayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { mimeType?: unknown; data?: unknown };
  if (typeof candidate.mimeType !== "string" || !ALLOWED_MIME_TYPES.has(candidate.mimeType)) return null;
  if (typeof candidate.data !== "string") return null;
  if (candidate.data.length === 0 || candidate.data.length > VOICE_MAX_BASE64_LENGTH) return null;
  if (candidate.data.length % 4 !== 0) return null;
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(candidate.data)) return null;
  return { mimeType: candidate.mimeType, data: candidate.data };
}

export function preferredVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const choices = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return choices.find((choice) => MediaRecorder.isTypeSupported(choice)) ?? "";
}
