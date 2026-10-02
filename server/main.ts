// Starts everything: the web server for OBS, the AI, the voice, and chat.
//   npm start
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ClientToServer, ServerToClient } from "../shared/protocol.ts";
import { AudioStore } from "./audio-store.ts";
import { Brain } from "./brain.ts";
import { startConsoleChat } from "./chat/console.ts";
import { startYouTubeChat } from "./chat/youtube.ts";
import { loadAvatarConfig, loadBlocklist, loadLore, loadPersona, rootPath, settings } from "./config.ts";
import { Hub } from "./hub.ts";
import { Moderator } from "./moderation.ts";
import { Stage } from "./stage.ts";
import { createTTS } from "./tts/index.ts";
import { createWebServer } from "./web.ts";

let avatarConfig = loadAvatarConfig();
let persona = loadPersona();
const nameOf = (text: string) => /your name is\s+([^\s.,。，!！]+)/i.exec(text)?.[1] ?? "VTuber";

const audio = new AudioStore();
const moderator = new Moderator(loadBlocklist());
const tts = createTTS();
const brain = settings.llm.baseUrl && settings.llm.model
  ? new Brain({ ...settings.llm, persona, lore: loadLore(), avatar: avatarConfig, log })
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

// ---- HTTP: the avatar page, model files and voice clips ----

const httpServer = await createWebServer({
  handle(path, _req, res) {
    if (!path.startsWith("/audio/")) return false;
    const clip = audio.get(path.slice("/audio/".length));
    if (!clip) res.writeHead(404).end();
    else res.writeHead(200, { "Content-Type": clip.mime, "Content-Length": clip.data.length, "Cache-Control": "no-store" }).end(clip.data);
    return true;
  },
  upgrade: (req, socket, head) => void hub.handleUpgrade(req, socket, head),
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
      brain?.configure(persona, loadLore(), avatarConfig);
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
