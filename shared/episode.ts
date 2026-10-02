// A video script: what the AI writer produces and the renderer performs.
// Saved as script.json next to each video, so you can edit it and re-render.

export type Aspect = "portrait" | "landscape";

export const FRAME_SIZE: Record<Aspect, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1920 }, // Shorts / Reels / 竖屏
  landscape: { width: 1920, height: 1080 }, // 16:9
};

/** Named backgrounds the AI can pick (images in assets/backgrounds/ work too). */
export const BACKGROUNDS: Record<string, string> = {
  sakura: "#ffe4ef,#d7ecff",
  morning: "#fff4c2,#ffd6e7",
  night: "#1d2340,#4b3b72",
  mint: "#dff7ec,#cfe8ff",
  ocean: "#bfe9ff,#6fb6e8",
  sunset: "#ffcf9f,#d98cc8",
  angry: "#ffd0d0,#ffe9c7",
  gloomy: "#b9bfd0,#8a8fa6",
};

export interface Beat {
  /** Spoken line. Leave out for a silent beat (e.g. just a reaction). */
  say?: string;
  /** "main" is 朝暮; "narrator" is a second voice (her mouth stays still). */
  speaker?: "main" | "narrator";
  /** Emotion name from config/avatar.json "emotions". */
  emotion?: string;
  /** Motion name from config/avatar.json "motions". */
  motion?: string;
  /** Built-in model sticker from config/avatar.json "stickers" (e.g. "angry_mark"). */
  sticker?: string;
  /** Camera shot from config/avatar.json "cameras", or "shake". */
  camera?: string;
  /** Big on-screen meme text. */
  caption?: string;
  /** Sound effect: pop, ding, boing, whoosh, wobble. */
  sfx?: string;
  /** Background for this beat onwards: a colour, "a,b" gradient, or /assets/... image. */
  background?: string;
  /** Seconds to hold a beat with no speech (default 1.2). */
  hold?: number;
  /** Extra silence after the beat, in seconds (default 0.25). */
  pause?: number;
}

export interface Episode {
  title: string;
  /** Video description for the upload page. */
  description?: string;
  tags?: string[];
  aspect: Aspect;
  /** Where in her story this video is set, shown as a small label at the start (e.g. "Age 17 · the first autumn"). */
  when?: string;
  /** Starting background (see Beat.background). */
  background?: string;
  /** Optional background music: a file name in assets/music/, played quietly on loop. */
  music?: string;
  beats: Beat[];
}

/** What the renderer worked out about timing (used to mix the audio). */
export interface Timeline {
  fps: number;
  frames: number;
  beats: { start: number; end: number; speechEnd: number }[];
}
