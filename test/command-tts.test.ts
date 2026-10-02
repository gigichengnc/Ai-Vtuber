import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CommandTTS } from "../server/tts/command.ts";

const fake = fileURLToPath(new URL("./fixtures/fake-tts.mjs", import.meta.url));
const tts = new CommandTTS(`"${process.execPath}" "${fake}"`);

test("command voice gets the line, speaker and emotion, and returns its WAV", async () => {
  const clip = await tts.synthesize("Right. Wednesday.", { speaker: "narrator", emotion: "sleepy" });
  assert.equal(clip.mime, "audio/wav");
  assert.deepEqual(JSON.parse(clip.data.subarray(44).toString()), {
    text: "Right. Wednesday.",
    speaker: "narrator",
    emotion: "sleepy",
  });
});

test("command voice failures say why", async () => {
  await assert.rejects(tts.synthesize("fail"), /exit 3.*no voice today/);
});
