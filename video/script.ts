// Checks a script (from the AI or edited by hand) and cleans it up: unknown
// faces, moves or stickers are dropped with a warning instead of breaking the
// render, and lengths are kept sane.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Aspect, BACKGROUNDS, type Beat, type Episode } from "../shared/episode.ts";
import type { AvatarConfig } from "../shared/protocol.ts";
import { rootPath } from "../server/config.ts";
import type { Moderator } from "../server/moderation.ts";
import { SFX_NAMES } from "./sfx.ts";

const MAX_BEATS = 80;
const MAX_SAY = 120;
const MAX_CAPTION = 24;

export function listAssets(folder: "backgrounds" | "music"): string[] {
  const dir = fileURLToPath(rootPath(`assets/${folder}`));
  if (!existsSync(dir)) return [];
  const pattern = folder === "music" ? /\.(mp3|ogg|wav|m4a)$/i : /\.(png|jpe?g|webp)$/i;
  return readdirSync(dir).filter((f) => pattern.test(f));
}

function validBackground(value: string, images: string[]): boolean {
  return value in BACKGROUNDS || images.includes(value) || /^#[0-9a-f]{3,8}(\s*,\s*#[0-9a-f]{3,8})?$/i.test(value);
}

export interface Checked {
  episode: Episode;
  warnings: string[];
}

export function checkEpisode(raw: unknown, avatar: AvatarConfig, moderator: Moderator, aspect?: Aspect): Checked {
  const warnings: string[] = [];
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
  const images = listAssets("backgrounds");
  const cameras = new Set([...Object.keys(avatar.cameras ?? {}), "shake"]);

  const pick = (value: unknown, allowed: Iterable<string>, what: string, beat: number): string | undefined => {
    const v = str(value, 60);
    if (!v) return undefined;
    if ([...allowed].includes(v)) return v;
    warnings.push(`Beat ${beat + 1}: unknown ${what} "${v}", ignored.`);
    return undefined;
  };

  const rawBeats = Array.isArray(obj.beats) ? obj.beats : [];
  if (rawBeats.length > MAX_BEATS) warnings.push(`Script had ${rawBeats.length} beats; kept the first ${MAX_BEATS}.`);
  const beats: Beat[] = [];
  rawBeats.slice(0, MAX_BEATS).forEach((item, i) => {
    const b = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const beat: Beat = {};
    const say = str(b.say, MAX_SAY);
    if (say) {
      if (moderator.blocked(say)) warnings.push(`Beat ${i + 1}: line contains a blocklisted word, removed: ${say}`);
      else beat.say = say;
    }
    if (b.speaker === "narrator") beat.speaker = "narrator";
    beat.emotion = pick(b.emotion, Object.keys(avatar.emotions), "emotion", i);
    beat.motion = b.motion === "none" ? undefined : pick(b.motion, Object.keys(avatar.motions), "motion", i);
    beat.sticker = b.sticker === "none" ? undefined : pick(b.sticker, Object.keys(avatar.stickers ?? {}), "sticker", i);
    beat.camera = pick(b.camera, cameras, "camera", i);
    beat.sfx = b.sfx === "none" ? undefined : pick(b.sfx, SFX_NAMES, "sound effect", i);
    const caption = str(b.caption, MAX_CAPTION);
    if (caption && !moderator.blocked(caption)) beat.caption = caption;
    const background = str(b.background, 80);
    if (background) {
      if (validBackground(background, images)) beat.background = background;
      else warnings.push(`Beat ${i + 1}: unknown background "${background}", ignored.`);
    }
    beat.hold = num(b.hold, 0.2, 6);
    beat.pause = num(b.pause, 0, 3);
    for (const key of Object.keys(beat) as (keyof Beat)[]) if (beat[key] === undefined) delete beat[key];
    if (Object.keys(beat).length > 0) beats.push(beat);
  });
  if (!beats.some((b) => b.say)) throw new Error("The script has no spoken lines.");

  const background = str(obj.background, 80);
  const music = str(obj.music, 120);
  const episode: Episode = {
    title: str(obj.title, 80) || "朝暮的新视频",
    description: str(obj.description, 1000),
    tags: Array.isArray(obj.tags) ? obj.tags.map((t) => str(t, 30)).filter((t): t is string => !!t).slice(0, 12) : undefined,
    aspect: aspect ?? (obj.aspect === "landscape" ? "landscape" : "portrait"),
    background: background && validBackground(background, images) ? background : undefined,
    music: music && listAssets("music").includes(music) ? music : undefined,
    beats,
  };
  for (const key of Object.keys(episode) as (keyof Episode)[]) if (episode[key] === undefined) delete episode[key];
  return { episode, warnings };
}
