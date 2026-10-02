// Starts everything: the web server for OBS, the AI, the voice, and chat.
//   npm start
import { createReadStream, statSync, watch } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";
import { AudioStore } from "./audio-store.ts";
import { Brain } from "./brain.ts";
import { startConsoleChat } from "./chat/console.ts";
import { startYouTubeChat } from "./chat/youtube.ts";
import { loadAvatarConfig, loadBlocklist, loadPersona, rootPath, settings } from "./config.ts";
import { Hub } from "./hub.ts";
import { Moderator } from "./moderation.ts";
import { Stage } from "./stage.ts";
import { createTTS } from "./tts/index.ts";

const modelsDir = fileURLToPath(rootPath("models"));
const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".moc3": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

let avatarConfig = loadAvatarConfig();
let persona = loadPersona();
const nameOf = (text: string) => /your name is\s+([^\s.,。，!！]+)/i.exec(text)?.[1] ?? "VTuber";

const audio = new AudioStore();
const moderator = new Moderator(loadBlocklist());
const tts = createTTS();
const brain = settings.llm.baseUrl && settings.llm.model
  ? new Brain({ ...settings.llm, persona, avatar: avatarConfig, log })
  : null;

const hub = new Hub(onClientMessage, (send) => {
  send({ type: "config", avatar: avatarConfig, paused: stage.paused });
  send({ type: "status", paused: stage.paused, queue: stage.queueLength, activity: stage.activity });
});

const stage = new Stage({
  hub,
  tts,
  brain,
  moderator,
  audio,
  name: nameOf(persona),
  idleTalkSeconds: settings.idleTalkSeconds,
  log,
});

let panelsReady = false;
function log(line: string): void {
  console.log(line);
  if (panelsReady) hub.toPanels({ type: "log", line } satisfies ServerToClient);
}
panelsReady = true;

function onClientMessage(message: ClientToServer): void {
  switch (message.type) {
    case "speech-end":
      stage.speechEnded(message.id);
      break;
    case "say":
      if (message.text?.trim()) stage.say({ text: message.text.trim().slice(0, 500), emotion: message.emotion, motion: message.motion });
      break;
    case "chat":
      if (message.text?.trim()) stage.addChat({ author: String(message.author || "Tester"), text: String(message.text), source: "panel", privileged: true });
      break;
    case "emotion":
    case "motion":
      hub.broadcast({ type: message.type, name: String(message.name) });
      break;
    case "pause":
      stage.pause();
      break;
    case "resume":
      stage.resume();
      break;
  }
}

// ---- HTTP: model files, voice clips, and the avatar page (via Vite) ----

function serveFile(res: ServerResponse, path: string): void {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    createReadStream(path).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = decodeURIComponent(url.pathname);

  if (path.startsWith("/audio/")) {
    const clip = audio.get(path.slice("/audio/".length));
    if (!clip) {
      res.writeHead(404).end();
      return true;
    }
    res.writeHead(200, { "Content-Type": clip.mime, "Content-Length": clip.data.length, "Cache-Control": "no-store" });
    res.end(clip.data);
    return true;
  }

  if (path.startsWith("/models/")) {
    const file = resolve(modelsDir, `.${path.slice("/models".length)}`);
    if (!file.startsWith(modelsDir + sep)) {
      res.writeHead(403).end();
      return true;
    }
    serveFile(res, file);
    return true;
  }

  return false;
}

const httpServer = createServer((req, res) => {
  if (!handleRequest(req, res)) vite.middlewares(req, res);
});
httpServer.on("upgrade", (req, socket, head) => {
  hub.handleUpgrade(req, socket, head); // anything else is Vite's hot reload
});

const vite = await createViteServer({
  configFile: fileURLToPath(rootPath("vite.config.ts")),
  server: { middlewareMode: true, hmr: { server: httpServer } },
  appType: "spa",
  logLevel: "warn",
});

// ---- Reload config/ files when you edit them, no restart needed ----

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
watch(fileURLToPath(rootPath("config")), () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    try {
      avatarConfig = loadAvatarConfig();
      persona = loadPersona();
      moderator.setBlocklist(loadBlocklist());
      brain?.configure(persona, avatarConfig);
      hub.broadcast({ type: "config", avatar: avatarConfig, paused: stage.paused });
      log("Reloaded config/ files.");
    } catch (error) {
      log(`Couldn't reload config/: ${String(error)}`);
    }
  }, 300);
});

httpServer.listen(settings.port, settings.host, () => {
  const base = `http://localhost:${settings.port}`;
  console.log(`
  AI VTuber is running.
    OBS browser source:  ${base}/
    Control panel:       ${base}/?panel

  Brain: ${brain ? `${settings.llm.model} at ${settings.llm.baseUrl}` : "off"}
  Voice: ${tts.name}${tts.name === "edge" ? ` (${settings.tts.voice})` : ""}
  Chat:  ${settings.chatSources.join(", ") || "none"}
`);
});

if (settings.chatSources.includes("console")) startConsoleChat(stage, log);
if (settings.chatSources.includes("youtube")) {
  void startYouTubeChat({ ...settings.youtube, onMessage: (m) => stage.addChat(m), log });
}
void stage.run();
