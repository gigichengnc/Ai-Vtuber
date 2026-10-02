// Makes a video, start to finish:
//   npm run video                                   AI picks a topic, POV short (9:16)
//   npm run video -- --type skit                    pov | skit | explainer
//   npm run video -- --aspect landscape             portrait (9:16) | landscape (16:9)
//   npm run video -- --topic "叫你起床"              give the AI a topic
//   npm run video -- --write-only                   only write the script
//   npm run video -- --skip-review                  skip the AI continuity check
//   npm run video -- --script output/<folder>/script.json   (re-)render a script you edited
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Aspect, Episode } from "../shared/episode.ts";
import { ChatClient, extractJson } from "../server/llm.ts";
import { hasOwnLore, loadAvatarConfig, loadBlocklist, loadLore, loadPersona, rootPath, settings } from "../server/config.ts";
import { Moderator } from "../server/moderation.ts";
import { renderEpisode } from "./render.ts";
import { checkEpisode } from "./script.ts";
import { reviewScript, VIDEO_TYPES, type VideoType, writeScript } from "./writer.ts";

const log = (line: string) => console.log(line);
const outputRoot = fileURLToPath(rootPath("output"));
const logFile = join(outputRoot, "episodes.jsonl");

const { values } = parseArgs({
  options: {
    type: { type: "string", default: "pov" },
    aspect: { type: "string", default: "portrait" },
    topic: { type: "string" },
    script: { type: "string" },
    "write-only": { type: "boolean", default: false },
    "skip-review": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

const type = values.type as VideoType;
if (!(type in VIDEO_TYPES)) fail(`--type must be one of: ${Object.keys(VIDEO_TYPES).join(", ")}`);
const aspect = values.aspect as Aspect;
if (aspect !== "portrait" && aspect !== "landscape") fail("--aspect must be portrait or landscape");

const avatar = loadAvatarConfig();
const moderator = new Moderator(loadBlocklist());

function pastTitles(): string[] {
  if (!existsSync(logFile)) return [];
  return readFileSync(logFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return (JSON.parse(line) as { title?: string }).title ?? "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .slice(-40);
}

function folderFor(title: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const safe = title.replace(/[<>:"/\\|?*\p{Cc}]/gu, "").replace(/\s+/g, "_").slice(0, 30) || "video";
  return join(outputRoot, `${stamp}_${safe}`);
}

function saveScript(episode: Episode, extra?: { name: string; text: string }): string {
  const dir = folderFor(episode.title);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "script.json"), `${JSON.stringify(episode, null, 2)}\n`);
  if (extra) writeFileSync(join(dir, extra.name), extra.text);
  return dir;
}

async function newScript(): Promise<{ episode: Episode; dir: string }> {
  const lore = loadLore();
  if (!hasOwnLore()) {
    log("Note: there's no config/lore.md yet. Copy config/lore.example.md to config/lore.md and fill in her story so the scripts match her world.\n");
  }
  const client = new ChatClient({ ...settings.llm, log });
  const writer = { client, persona: loadPersona(), lore, avatar, language: settings.videoLanguage };
  log(`Writing a ${type} script (${aspect}) with ${settings.llm.model}...`);

  let feedback: string[] = [];
  let rejected: { episode: Episode; problems: string[] } | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const again = attempt < 3 ? " Trying again..." : "";
    const reply = await writeScript(writer, { type, aspect, topic: values.topic, pastTitles: pastTitles(), feedback });
    const raw = extractJson(reply);
    if (raw === null) {
      log(`Draft ${attempt}: the AI's reply wasn't valid JSON.${again}`);
      continue;
    }
    let episode: Episode;
    try {
      const checked = checkEpisode(raw, avatar, moderator, aspect);
      for (const w of checked.warnings) log(`  note: ${w}`);
      episode = checked.episode;
    } catch (error) {
      log(`Draft ${attempt}: ${String(error)}${again}`);
      continue;
    }
    if (values["skip-review"]) return { episode, dir: saveScript(episode) };

    log(`Draft ${attempt}: "${episode.title}". Checking it against her canon...`);
    const review = await reviewScript(writer, episode);
    if (review.ok) {
      log("  Continuity check passed.");
      return { episode, dir: saveScript(episode) };
    }
    log("  Continuity check found problems:");
    for (const p of review.problems) log(`   - ${p}`);
    if (attempt < 3) log("  Rewriting...");
    feedback = review.problems;
    rejected = { episode, problems: review.problems };
  }

  if (rejected) {
    const dir = saveScript(rejected.episode, {
      name: "review.txt",
      text: `The continuity check didn't pass:\n${rejected.problems.map((p) => `- ${p}`).join("\n")}\n`,
    });
    fail(
      `No draft passed the continuity check after 3 tries, so nothing was rendered.\n` +
        `The last draft and its problems are in ${relative(process.cwd(), dir)} (script.json, review.txt).\n` +
        `Fix it and render with --script, or just run again.`,
    );
  }
  fail("The AI couldn't write a usable script after 3 tries. Try again, or try a bigger model.");
}

function existingScript(path: string): { episode: Episode; dir: string } {
  if (!existsSync(path)) fail(`No script at ${path}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path} isn't valid JSON: ${String(error)}`);
  }
  const { episode, warnings } = checkEpisode(raw, avatar, moderator);
  for (const w of warnings) log(`  note: ${w}`);
  return { episode, dir: dirname(path) };
}

function uploadText(episode: Episode, seconds: number): string {
  return [
    `Title:\n${episode.title}`,
    `Description:\n${episode.description ?? ""}${episode.when ? `\n(${episode.when})` : ""}`,
    `Tags:\n${(episode.tags ?? []).join(", ")}`,
    `Length: ${seconds.toFixed(1)} s, ${episode.aspect === "portrait" ? "9:16" : "16:9"}`,
    "When uploading, mark the video as AI-generated where the platform asks.\n上传时请按平台要求声明“内容由AI生成”。",
  ].join("\n\n");
}

const { episode, dir } = values.script ? existingScript(values.script) : await newScript();
log(`\nScript: ${relative(process.cwd(), join(dir, "script.json"))}`);
log(`"${episode.title}" - ${episode.beats.length} beats${episode.when ? ` - ${episode.when}` : ""}`);
for (const beat of episode.beats) {
  if (beat.say) log(`  ${beat.speaker === "narrator" ? "narrator" : "朝暮"}${beat.emotion ? ` [${beat.emotion}]` : ""}: ${beat.say}`);
}
if (values["write-only"]) {
  log("\nEdit the script if you like, then render it with:");
  log(`  npm run video -- --script "${relative(process.cwd(), join(dir, "script.json"))}"`);
  process.exit(0);
}

log("");
const result = await renderEpisode(episode, dir, log);
writeFileSync(join(dir, "upload.txt"), `${uploadText(episode, result.seconds)}\n`);
if (!values.keep) {
  rmSync(join(dir, "clips"), { recursive: true, force: true });
  rmSync(join(dir, "audio.wav"), { force: true });
}
if (!values.script) {
  mkdirSync(outputRoot, { recursive: true });
  appendFileSync(logFile, `${JSON.stringify({ date: new Date().toISOString(), title: episode.title, type, aspect, folder: relative(outputRoot, dir) })}\n`);
}
log(`\nDone! ${relative(process.cwd(), result.video)}  (${result.seconds.toFixed(1)} s)`);
log(`Title, description and tags: ${relative(process.cwd(), join(dir, "upload.txt"))}`);
process.exit(0);
