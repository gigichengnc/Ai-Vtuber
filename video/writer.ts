// The AI script writer: picks a topic that fits 朝暮's world and writes a
// short video script she can perform (lines, faces, moves, stickers, camera,
// captions, sound effects).
import { type Aspect, BACKGROUNDS, type Episode } from "../shared/episode.ts";
import type { AvatarConfig } from "../shared/protocol.ts";
import { type ChatClient, extractJson } from "../server/llm.ts";
import { listAssets } from "./script.ts";
import { SFX_NAMES } from "./sfx.ts";

export const VIDEO_TYPES = {
  pov: `POV: talk straight to the viewer (call them 你) in an everyday moment from your world: waking
them up, saying good night, cheering them up after a bad day, sulking because they ignored you,
reminding them to eat or drink water, being jealous, celebrating something together. Mostly close
and medium shots. Strong emotions that change as the moment goes on, with stickers at the peaks.`,
  skit: `SKIT: a tiny story or meme from your world with a setup, a twist and a punchline. You may use
the narrator for a scene-setting line or a deadpan comment. Put captions on the punchlines and
sound effects on the gags. Camera shakes and quick cuts help the timing.`,
  explainer: `EXPLAINER: explain one interesting thing (a fun fact, how something works, a useful tip) in
your own playful voice, as if telling a friend. Short captions highlight the key words. Keep it
simple, accurate and concrete; if you are not sure a fact is true, pick a different topic.`,
} as const;
export type VideoType = keyof typeof VIDEO_TYPES;

const LENGTH: Record<VideoType, Record<Aspect, string>> = {
  pov: { portrait: "25 to 50 seconds (about 8 to 14 beats)", landscape: "40 to 90 seconds (about 12 to 24 beats)" },
  skit: { portrait: "30 to 60 seconds (about 10 to 16 beats)", landscape: "60 to 120 seconds (about 16 to 30 beats)" },
  explainer: { portrait: "45 to 75 seconds (about 12 to 18 beats)", landscape: "2 to 4 minutes (about 30 to 50 beats)" },
};

export interface WriterOptions {
  client: ChatClient;
  persona: string;
  lore: string;
  avatar: AvatarConfig;
  language: string;
}

export async function writeScript(
  o: WriterOptions,
  request: { type: VideoType; aspect: Aspect; topic?: string; pastTitles: string[]; feedback?: string[] },
): Promise<string> {
  const motions = Object.entries(o.avatar.motions).map(([name, m]) => `${name} (${m.description ?? name})`);
  const images = listAssets("backgrounds");
  const music = listAssets("music");

  const system = `${o.persona}

# Your world and story (stay true to this; never contradict it)

${o.lore}

# Your job now: write a short video script

You are writing a script for one of your own short videos (Bilibili / YouTube / Reels). You will
perform it as a Live2D character. Write in ${o.language}.

What makes these videos good:
- The first line grabs attention within 2 seconds. No slow intros like "Hi everyone, I'm Zhaomu".
- Each spoken line is short, one breath: at most about 15 English words (or 25 Chinese characters).
- Your face keeps changing with the feeling: pick an emotion on almost every beat.
- Stickers, captions, sound effects and camera moves land on the funny or emotional peaks. Don't put
  something on every beat; contrast makes the peaks pop.
- Captions are big meme text: 1 to 4 words (or 2 to 8 Chinese characters), not a copy of the line.
- Pick when in your story this video takes place (any point on your timeline) and put a short label
  for the screen in "when", e.g. "Age 17 · the first autumn" or "After the story · a quiet Wednesday".
  Everything in the video must fit that moment: who you were then, where 晝霽 was, what had happened.
- A clear ending: a callback, a twist, or a sweet sign-off in character. Don't beg for likes.
- Stay in character and in your world. Nothing about real people, politics, or anything unsafe.

What you can use on each beat (all optional except that the video needs spoken lines):
- say: the spoken line. speaker: "main" (you) or "narrator" (a second voice; your mouth stays still).
- emotion: ${Object.keys(o.avatar.emotions).join(", ")}
- motion: ${motions.join(", ")}
- sticker: ${Object.keys(o.avatar.stickers ?? {}).join(", ")}
- camera: ${[...Object.keys(o.avatar.cameras ?? {}), "shake"].join(", ")}
- caption: big on-screen text.
- sfx: ${SFX_NAMES.join(", ")}
- background: ${[...Object.keys(BACKGROUNDS), ...images].join(", ")}
- hold: seconds to stay on a beat with no line (for a silent reaction). pause: extra silence after a beat.
${music.length ? `- top-level "music" (optional, played quietly): ${music.join(", ")}` : ""}

Reply with only a JSON object and nothing else, in this shape:
{"title": "catchy video title", "description": "1-2 sentence video description", "tags": ["tag", "tag"],
 "when": "Age 21 · the week he came back", "background": "sakura",
 "beats": [
  {"say": "Right. Who told you to bring a brolly that small?", "emotion": "pout", "sticker": "sweat", "camera": "close", "caption": "TINY", "sfx": "pop"},
  {"say": "Your whole right shoulder is soaked. Again.", "emotion": "confused", "sticker": "question", "camera": "medium"},
  {"emotion": "shy", "motion": "surprised_shy", "hold": 0.8, "sfx": "boing"}
 ]}`;

  const user = `Video type: ${VIDEO_TYPES[request.type]}

Format: ${request.aspect === "portrait" ? "vertical 9:16 short" : "horizontal 16:9 video"}, ${LENGTH[request.type][request.aspect]}.

Topic: ${request.topic ? request.topic : "choose one yourself that fits your world and personality."}

${
  request.pastTitles.length
    ? `Videos you already made (don't repeat these ideas):\n${request.pastTitles.map((t) => `- ${t}`).join("\n")}`
    : "This is your first video."
}`;

  const fixes = request.feedback?.length
    ? `\n\nYour previous draft was rejected by the continuity editor for these problems. Write a new script that avoids them:\n${request.feedback.map((p) => `- ${p}`).join("\n")}`
    : "";
  return o.client.complete(system, user + fixes, { maxTokens: 4000, temperature: 0.9 });
}

export interface Review {
  ok: boolean;
  problems: string[];
}

/**
 * A second AI pass that protects the character: checks a script against her
 * canon and voice before anything is rendered.
 */
export async function reviewScript(o: WriterOptions, episode: Episode): Promise<Review> {
  const system = `You are the continuity editor for the character IP 朝暮 (Zhaomu). You protect her canon and her voice.

# Canon

${o.lore}

# Her character and rules

${o.persona}

# Your job

Read one video script (JSON) and list only real problems:
- contradictions with the canon: names (use the English names from the canon), places, the timeline
  (who was where and when, whether they were together yet), habits and preferences;
- lines that are out of character for her or for 晝霽;
- anything unsafe or off-brand under her safety rules;
- spoken lines or captions not written in ${o.language};
- a missing "when", or lines that don't fit that moment in her story.
Ignore matters of taste and small creative details that don't contradict the canon.

Reply with only a JSON object:
{"ok": true, "problems": []}
or
{"ok": false, "problems": ["beat 3: ...", "when: ..."]}`;

  const reply = await o.client.complete(system, JSON.stringify(episode, null, 1), { maxTokens: 1500, temperature: 0.2 });
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, problems: ["The continuity check's reply couldn't be read."] };
  }
  const result = parsed as { ok?: unknown; problems?: unknown };
  const problems = Array.isArray(result.problems)
    ? result.problems.filter((p): p is string => typeof p === "string" && p.trim() !== "").slice(0, 10)
    : [];
  return { ok: result.ok !== false && problems.length === 0, problems };
}
