import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLines } from "../server/brain.ts";

test("reads a plain JSON answer", () => {
  assert.deepEqual(parseLines('{"lines":[{"text":"Hi!","emotion":"happy","motion":"greet"}]}'), [
    { text: "Hi!", emotion: "happy", motion: "greet" },
  ]);
});

test("ignores thinking tags and code fences from local models", () => {
  const reply = '<think>let me think</think>\n```json\n{"lines":[{"text":"你好呀"}]}\n```';
  assert.deepEqual(parseLines(reply), [{ text: "你好呀", emotion: undefined, motion: undefined }]);
});

test("accepts a bare array, a single line object, and plain strings", () => {
  assert.equal(parseLines('[{"text":"a"},"b"]')?.length, 2);
  assert.deepEqual(parseLines('{"text":"solo","emotion":"sad"}'), [{ text: "solo", emotion: "sad", motion: undefined }]);
});

test("empty lines mean stay quiet; garbage means unreadable", () => {
  assert.deepEqual(parseLines('{"lines":[]}'), []);
  assert.deepEqual(parseLines('{"lines":[{"text":"   "}]}'), []);
  assert.equal(parseLines("sorry, I can't do JSON"), null);
  assert.equal(parseLines("{broken"), null);
});
