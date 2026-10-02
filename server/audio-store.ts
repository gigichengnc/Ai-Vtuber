// Keeps recent voice clips in memory so the avatar page can fetch them.
import { randomBytes } from "node:crypto";
import type { AudioClip } from "./tts/index.ts";

const KEEP_MS = 10 * 60_000;

export class AudioStore {
  private clips = new Map<string, AudioClip & { at: number }>();

  put(clip: AudioClip): string {
    const now = Date.now();
    for (const [id, old] of this.clips) if (now - old.at > KEEP_MS) this.clips.delete(id);
    const id = randomBytes(8).toString("hex");
    this.clips.set(id, { ...clip, at: now });
    return id;
  }

  get(id: string): AudioClip | undefined {
    return this.clips.get(id);
  }
}

/** Rough clip length in seconds, used as a safety timeout while she speaks. */
export function estimateSeconds(clip: AudioClip): number {
  if (clip.mime === "audio/wav") return Math.max(0, clip.data.length - 44) / (24_000 * 2);
  return (clip.data.length * 8) / 48_000; // Edge TTS mp3 is 48 kbit/s
}
