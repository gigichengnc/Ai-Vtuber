// The AI script writer: picks a topic that fits 朝暮's world and writes a
// short video script she can perform (lines, faces, moves, stickers, camera,
// captions, sound effects).
import { type Aspect, BACKGROUNDS } from "../shared/episode.ts";
import type { AvatarConfig } from "../shared/protocol.ts";
import { ChatClient } from "../server/llm.ts";
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
  request: { type: VideoType; aspect: Aspect; topic?: string; pastTitles: string[] },
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
- The first line grabs attention within 2 seconds. No slow intros, no "大家好我是朝暮" openers.
- Each spoken line is short, one breath: at most about 25 Chinese characters (or 15 English words).
- Your face keeps changing with the feeling: pick an emotion on almost every beat.
- Stickers, captions, sound effects and camera moves land on the funny or emotional peaks. Don't put
  something on every beat; contrast makes the peaks pop.
- Captions are big meme text, 2 to 8 characters, not a copy of the line.
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
 "background": "sakura",
 "beats": [
  {"say": "喂！你怎么还在睡！", "emotion": "angry", "sticker": "angry_mark", "camera": "close", "caption": "起床！！", "sfx": "pop"},
  {"say": "什么？再睡五分钟？", "emotion": "confused", "sticker": "question", "camera": "medium"},
  {"emotion": "pout", "motion": "pout", "hold": 0.8, "sfx": "boing"}
 ]}`;

  const user = `Video type: ${VIDEO_TYPES[request.type]}

Format: ${request.aspect === "portrait" ? "vertical 9:16 short" : "horizontal 16:9 video"}, ${LENGTH[request.type][request.aspect]}.

Topic: ${request.topic ? request.topic : "choose one yourself that fits your world and personality."}

${
  request.pastTitles.length
    ? `Videos you already made (don't repeat these ideas):\n${request.pastTitles.map((t) => `- ${t}`).join("\n")}`
    : "This is your first video."
}`;

  return o.client.complete(system, user, { maxTokens: 4000, temperature: 0.9 });
}
