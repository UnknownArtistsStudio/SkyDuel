import assert from "node:assert/strict";
import test from "node:test";

import { CHAT_MAX_LENGTH, cleanChatText, wrapChatText } from "../lib/chat.ts";
import { VOICE_MAX_BASE64_LENGTH, cleanVoiceClip } from "../lib/radio.ts";

test("radio messages are short, uppercase, and safe to render", () => {
  assert.equal(cleanChatText("  hello   pilots!  "), "HELLO PILOTS!");
  assert.equal(cleanChatText("<script>alert(1)</script> ✈"), "SCRIPTALERT1SCRIPT");
  assert.equal(cleanChatText("A".repeat(80)).length, CHAT_MAX_LENGTH);
  assert.equal(cleanChatText(null), "");
});

test("speech bubbles wrap into no more than two pixel-text lines", () => {
  assert.deepEqual(wrapChatText("bank left now", 9), ["BANK LEFT", "NOW"]);
  assert.deepEqual(wrapChatText("abcdefghijklmnop", 6), ["ABCDEF", "GHIJKL"]);
  assert.deepEqual(wrapChatText(""), []);
});

test("radio clips accept only small supported audio payloads", () => {
  assert.deepEqual(cleanVoiceClip({ mimeType: "audio/webm;codecs=opus", data: "QUJD" }), {
    mimeType: "audio/webm;codecs=opus",
    data: "QUJD",
  });
  assert.equal(cleanVoiceClip({ mimeType: "text/html", data: "QUJD" }), null);
  assert.equal(cleanVoiceClip({ mimeType: "audio/webm", data: "!not-base64!" }), null);
  assert.equal(cleanVoiceClip({ mimeType: "audio/webm", data: "AAA" }), null);
  assert.equal(cleanVoiceClip({ mimeType: "audio/webm", data: "A".repeat(VOICE_MAX_BASE64_LENGTH + 1) }), null);
});
