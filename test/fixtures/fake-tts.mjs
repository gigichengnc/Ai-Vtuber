// A stand-in voice program for test/command-tts.test.ts: echoes what it was
// given inside a minimal "WAV" so the test can check it.
let text = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (text += chunk));
process.stdin.on("end", () => {
  if (text === "fail") {
    process.stderr.write("no voice today");
    process.exit(3);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  const body = JSON.stringify({ text, speaker: process.env.TTS_SPEAKER, emotion: process.env.TTS_EMOTION });
  process.stdout.write(Buffer.concat([header, Buffer.from(body)]));
});
