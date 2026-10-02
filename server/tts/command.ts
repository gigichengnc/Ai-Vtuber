// Any local text-to-speech program: the line goes in on stdin, a WAV file
// comes out on stdout. scripts/kokoro-tts.py is one (free, offline, British
// voices). The program is told who is speaking and how through
// TTS_SPEAKER ("main" or "narrator") and TTS_EMOTION.
import { spawn } from "node:child_process";
import type { AudioClip, SpeakOptions, TTSProvider } from "./index.ts";

const TIMEOUT_MS = 180_000;

export class CommandTTS implements TTSProvider {
  readonly name = "command";

  constructor(private command: string) {}

  synthesize(text: string, { emotion, speaker }: SpeakOptions = {}): Promise<AudioClip> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, TTS_SPEAKER: speaker ?? "main", TTS_EMOTION: emotion ?? "" },
      });
      const out: Buffer[] = [];
      let err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("TTS_COMMAND took longer than 3 minutes."));
      }, TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => {
        err = (err + chunk.toString()).slice(-2000);
      });
      child.stdin.on("error", () => {}); // the program may exit before reading everything
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`Couldn't run TTS_COMMAND: ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const data = Buffer.concat(out);
        if (code !== 0 || data.length < 44 || data.toString("ascii", 0, 4) !== "RIFF") {
          reject(new Error(`TTS_COMMAND failed (exit ${code}): ${err.trim() || "it didn't write a WAV file to stdout"}`));
        } else {
          resolve({ data, mime: "audio/wav" });
        }
      });
      child.stdin.end(text);
    });
  }
}
