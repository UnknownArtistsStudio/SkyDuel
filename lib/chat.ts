export const CHAT_MAX_LENGTH = 48;
export const CHAT_LINE_LENGTH = 22;

export function cleanChatText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/[^a-zA-Z0-9 .,!?'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH)
    .trim()
    .toUpperCase();
}

export function wrapChatText(value: string, lineLength = CHAT_LINE_LENGTH): string[] {
  const text = cleanChatText(value);
  if (!text) return [];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const pieces = splitWord(word, lineLength);
    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (candidate.length <= lineLength) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = piece;
      }
      if (lines.length === 2) return lines;
    }
  }

  if (current && lines.length < 2) lines.push(current);
  return lines;
}

function splitWord(word: string, lineLength: number) {
  if (word.length <= lineLength) return [word];
  const pieces: string[] = [];
  for (let index = 0; index < word.length; index += lineLength) {
    pieces.push(word.slice(index, index + lineLength));
  }
  return pieces;
}
