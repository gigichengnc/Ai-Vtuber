import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatClient } from "../server/llm.ts";
import type { AvatarConfig } from "../shared/protocol.ts";
import { reviewScript } from "../video/writer.ts";

const fakeClient = (reply: string) => ({ complete: async () => reply }) as unknown as ChatClient;
const writer = (reply: string) => ({
  client: fakeClient(reply),
  persona: "persona",
  lore: "lore",
  avatar: {} as AvatarConfig,
  language: "British English",
});
const episode = { title: "t", aspect: "portrait" as const, beats: [{ say: "hello" }] };

test("passes when the editor finds nothing", async () => {
  assert.deepEqual(await reviewScript(writer('{"ok": true, "problems": []}'), episode), { ok: true, problems: [] });
});

test("fails with the editor's problems", async () => {
  const review = await reviewScript(writer('```json\n{"ok": false, "problems": ["beat 1: he never drinks sweet things"]}\n```'), episode);
  assert.equal(review.ok, false);
  assert.deepEqual(review.problems, ["beat 1: he never drinks sweet things"]);
});

test("listing problems counts as a fail even if ok is true", async () => {
  const review = await reviewScript(writer('{"ok": true, "problems": ["when: missing"]}'), episode);
  assert.equal(review.ok, false);
});

test("an unreadable reply is treated as a fail, never a silent pass", async () => {
  const review = await reviewScript(writer("Looks fine to me!"), episode);
  assert.equal(review.ok, false);
});
