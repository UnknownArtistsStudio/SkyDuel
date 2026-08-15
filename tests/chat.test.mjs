import assert from "node:assert/strict";
import test from "node:test";

import { CHAT_MAX_LENGTH, cleanChatText, wrapChatText } from "../lib/chat.ts";

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
