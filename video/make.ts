// Makes a video, start to finish:
//   npm run video                                   AI picks a topic, POV short (9:16)
//   npm run video -- --type skit                    pov | skit | explainer
//   npm run video -- --aspect landscape             portrait (9:16) | landscape (16:9)
//   npm run video -- --topic "叫你起床"              give the AI a topic
//   npm run video -- --write-only                   only write the script
//   npm run video -- --script output/<folder>/script.json   (re-)render a script you edited
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { Aspect, Episode } from "../shared/episode.ts";
import { ChatClient, extractJson } from "../server/llm.ts";
import { loadAvatarConfig, loadBlocklist, loadLore, loadPersona, rootPath, settings } from "../server/config.ts";
import { Moderator } from "../server/moderation.ts";
import { renderEpisode } from "./render.ts";
import { checkEpisode } from "./script.ts";
import { VIDEO_TYPES, type VideoType, writeScript } from "./writer.ts";

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

async function newScript(): Promise<{ episode: Episode; dir: string }> {
  const lore = loadLore();
  const lorePath = rootPath("config/lore.md");
  if (!existsSync(lorePath) || readFileSync(lorePath, "utf8").includes("（例：")) {
    log("Note: config/lore.md still has the example text. Fill in 朝暮's story there so the scripts match her world.\n");
  }
  const client = new ChatClient({ ...settings.llm, log });
  log(`Writing a ${type} script (${aspect}) with ${settings.llm.model}...`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const reply = await writeScript(
      { client, persona: loadPersona(), lore, avatar, language: settings.videoLanguage },
      { type, aspect, topic: values.topic, pastTitles: pastTitles() },
    );
    const raw = extractJson(reply);
    if (raw === null) {
      log(`Attempt ${attempt}: the AI's reply wasn't valid JSON. ${attempt < 3 ? "Trying again..." : ""}`);
      continue;
    }
    try {
      const { episode, warnings } = checkEpisode(raw, avatar, moderator, aspect);
      for (const w of warnings) log(`  note: ${w}`);
      const dir = folderFor(episode.title);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "script.json"), `${JSON.stringify(episode, null, 2)}\n`);
      return { episode, dir };
    } catch (error) {
      log(`Attempt ${attempt}: ${String(error)} ${attempt < 3 ? "Trying again..." : ""}`);
    }
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
    `标题 / Title:\n${episode.title}`,
    `简介 / Description:\n${episode.description ?? ""}`,
    `标签 / Tags:\n${(episode.tags ?? []).join(", ")}`,
    `时长 / Length: ${seconds.toFixed(1)} s, ${episode.aspect === "portrait" ? "9:16" : "16:9"}`,
    "上传时请按平台要求声明“内容由AI生成”。\nWhen uploading, mark the video as AI-generated where the platform asks.",
  ].join("\n\n");
}

const { episode, dir } = values.script ? existingScript(values.script) : await newScript();
log(`\nScript: ${relative(process.cwd(), join(dir, "script.json"))}`);
log(`"${episode.title}" - ${episode.beats.length} beats`);
for (const beat of episode.beats) {
  if (beat.say) log(`  ${beat.speaker === "narrator" ? "旁白" : "朝暮"}${beat.emotion ? ` [${beat.emotion}]` : ""}: ${beat.say}`);
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
