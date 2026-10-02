// Reads .env and the files in config/.
import { existsSync, readFileSync } from "node:fs";
import type { AvatarConfig } from "../shared/protocol.ts";

const root = new URL("../", import.meta.url);
export const rootPath = (relative: string) => new URL(relative, root);

if (existsSync(rootPath(".env"))) process.loadEnvFile(rootPath(".env"));

const env = (name: string, fallback = "") => process.env[name]?.trim() || fallback;
const number = (name: string, fallback: number) => {
  const value = Number(env(name));
  return Number.isFinite(value) && env(name) !== "" ? value : fallback;
};

export const settings = {
  port: number("PORT", 8787),
  // 127.0.0.1 = only this computer can open the panel. Use 0.0.0.0 to allow your LAN.
  host: env("HOST", "127.0.0.1"),
  llm: {
    baseUrl: env("LLM_BASE_URL", "http://localhost:11434/v1"),
    apiKey: env("LLM_API_KEY"),
    model: env("LLM_MODEL", "qwen3:8b"),
  },
  idleTalkSeconds: number("IDLE_TALK_SECONDS", 60),
  tts: {
    provider: env("TTS_PROVIDER", "edge"),
    voice: env("TTS_VOICE", "zh-CN-XiaoyiNeural"),
    rate: env("TTS_RATE", "+0%"),
    pitch: env("TTS_PITCH", "+0Hz"),
  },
  chatSources: (process.env.CHAT_SOURCES ?? "console")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  youtube: {
    apiKey: env("YOUTUBE_API_KEY"),
    videoId: env("YOUTUBE_VIDEO_ID"),
    pollSeconds: number("YOUTUBE_POLL_SECONDS", 8),
  },
};

export function loadAvatarConfig(): AvatarConfig {
  return JSON.parse(readFileSync(rootPath("config/avatar.json"), "utf8")) as AvatarConfig;
}

export function loadPersona(): string {
  return readFileSync(rootPath("config/persona.md"), "utf8").trim();
}

export function loadBlocklist(): string[] {
  const path = rootPath("config/blocklist.txt");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"));
}
