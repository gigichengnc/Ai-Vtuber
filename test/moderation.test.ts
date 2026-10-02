import assert from "node:assert/strict";
import { test } from "node:test";
import { Moderator } from "../server/moderation.ts";

const msg = (text: string, author = "alice") => ({ author, text, source: "test" });

test("drops blocked words, including spaced-out spellings", () => {
  const m = new Moderator(["badword"]);
  assert.equal(m.screen(msg("this has BADWORD in it")), null);
  assert.equal(m.screen(msg("b a d w o r d", "bob")), null);
  assert.ok(m.screen(msg("totally fine", "carol")));
});

test("strips links, invisible characters and long repeats", () => {
  const m = new Moderator([]);
  const zeroWidth = String.fromCharCode(0x200b);
  const out = m.screen(msg(`look${zeroWidth} https://evil.example/x hiiiiiiiiiiiii`));
  assert.equal(out?.text, "look [link] hiii");
});

test("rate limits each viewer but not moderators or Super Chats", () => {
  const m = new Moderator([]);
  assert.ok(m.screen(msg("one"), 1000));
  assert.equal(m.screen(msg("two"), 2000), null);
  assert.ok(m.screen(msg("three"), 7000));
  assert.ok(m.screen({ ...msg("mod", "mod"), privileged: true }, 7001));
  assert.ok(m.screen({ ...msg("mod again", "mod"), privileged: true }, 7002));
  assert.ok(m.screen({ ...msg("thanks", "fan"), highlight: "Super Chat $5" }, 7003));
});

test("caps very long messages", () => {
  const out = new Moderator([]).screen(msg("ab".repeat(300)));
  assert.ok(out && out.text.length <= 201);
});
