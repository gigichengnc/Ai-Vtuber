// Finding and running ffmpeg.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

/** FFMPEG_PATH, else the copy installed by npm (ffmpeg-static), else whatever is on PATH. */
export function ffmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) return fromEnv;
  const bundled = ffmpegStatic as unknown as string | null;
  if (bundled && existsSync(bundled)) return bundled;
  return "ffmpeg";
}

/** Runs ffmpeg and resolves when it finishes; rejects with its last output on failure. */
export function runFfmpeg(args: string[], stdin?: (stream: NodeJS.WritableStream) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      stdio: [stdin ? "pipe" : "ignore", "ignore", "pipe"],
    });
    let errors = "";
    child.stderr!.on("data", (chunk) => (errors = (errors + chunk).slice(-4000)));
    child.on("error", (error) => reject(new Error(`Couldn't start ffmpeg (${error.message}). Set FFMPEG_PATH in .env.`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (exit ${code}):\n${errors}`))));
    if (stdin) {
      stdin(child.stdin!)
        .then(() => child.stdin!.end())
        .catch((error) => {
          child.kill();
          reject(error);
        });
    }
  });
}
