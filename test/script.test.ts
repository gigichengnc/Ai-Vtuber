import assert from "node:assert/strict";
import { test } from "node:test";
import type { AvatarConfig } from "../shared/protocol.ts";
import { Moderator } from "../server/moderation.ts";
import { checkEpisode } from "../video/script.ts";
import { makeSfx, SFX_NAMES } from "../video/sfx.ts";
import { wavSeconds } from "../server/tts/wav.ts";

const avatar = {
  model: "/models/x.model3.json",
  layout: { zoom: 1, x: 0.5, y: 0.5 },
  defaultEmotion: "neutral",
  emotionHoldSeconds: 4,
  emotions: { neutral: "a", happy: "b" },
  motions: { greet: { group: "Act", index: 0 } },
  loops: [],
  mouth: { parameter: "ParamMouthOpenY", gain: 1, smoothing: 0.5 },
  stickers: { question: "ParamStkQuestion" },
  cameras: { close: { zoom: 3, x: 0.5, y: 1.6 } },
} satisfies AvatarConfig;

test("keeps valid fields and drops unknown ones with a warning", () => {
  const { episode, warnings } = checkEpisode(
    {
      title: "Hi",
      aspect: "landscape",
      beats: [
        { say: "hello", emotion: "happy", motion: "greet", sticker: "question", camera: "close", sfx: "pop", caption: "HI" },
        { say: "again", emotion: "furious", motion: "moonwalk", camera: "drone", sfx: "laser", background: "nowhere" },
        { camera: "shake", hold: 99 },
      ],
    },
    avatar,
    new Moderator([]),
  );
  assert.equal(episode.aspect, "landscape");
  assert.deepEqual(episode.beats[0], { say: "hello", emotion: "happy", motion: "greet", sticker: "question", camera: "close", sfx: "pop", caption: "HI" });
  assert.deepEqual(episode.beats[1], { say: "again" });
  assert.deepEqual(episode.beats[2], { camera: "shake", hold: 6 });
  assert.equal(warnings.length, 5);
});

test("the command-line aspect wins, and blocked lines are removed", () => {
  const { episode, warnings } = checkEpisode(
    { aspect: "landscape", beats: [{ say: "fine line" }, { say: "a badword here" }] },
    avatar,
    new Moderator(["badword"]),
    "portrait",
  );
  assert.equal(episode.aspect, "portrait");
  assert.equal(episode.title, "朝暮的新视频");
  assert.deepEqual(episode.beats, [{ say: "fine line" }]);
  assert.match(warnings[0]!, /blocklisted/);
});

test("a script with nothing to say is rejected", () => {
  assert.throws(() => checkEpisode({ beats: [{ caption: "silent" }] }, avatar, new Moderator([])), /no spoken lines/);
  assert.throws(() => checkEpisode("not even an object", avatar, new Moderator([])), /no spoken lines/);
});

test("every sound effect renders a short, non-silent clip", () => {
  for (const name of SFX_NAMES) {
    const wav = makeSfx(name);
    const seconds = wavSeconds(wav);
    assert.ok(seconds > 0.05 && seconds < 1.5, `${name}: ${seconds}s`);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 3000, `${name} is too quiet (${peak})`);
  }
});
