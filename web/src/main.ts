// The page OBS shows. Open it with ?panel to get the control panel next to it.
//   ?panel         control panel (for you, not for OBS)
//   ?mute          animate the mouth but play no sound (e.g. a preview tab)
//   ?subtitles=0   hide the speech bubble
//   ?bg=%2300ff00  solid background colour (for chroma key) instead of transparent
//   ?debug         expose window.vtuber for poking at the model in DevTools
import { Application, extensions } from "pixi.js";
import { Live2DPlugin } from "untitled-pixi-live2d-engine/cubism";
import type { AvatarConfig, ClientToServer, ServerToClient } from "../../shared/protocol.ts";
import { Avatar } from "./avatar.ts";
import { Panel } from "./panel.ts";
import { SpeechPlayer } from "./speech.ts";

const params = new URLSearchParams(location.search);
const withPanel = params.has("panel");
const showSubtitles = params.get("subtitles") !== "0";

const stageEl = document.getElementById("stage")!;
const subtitleEl = document.getElementById("subtitle")!;
const unlockEl = document.getElementById("unlock-audio") as HTMLButtonElement;
const errorEl = document.getElementById("error")!;

extensions.add(Live2DPlugin);
// Lay out the page (panel column or not) before the canvas measures its area.
if (withPanel) document.body.classList.add("with-panel");

const app = new Application();
await app.init({
  resizeTo: stageEl,
  preference: "webgl",
  backgroundAlpha: params.has("bg") ? 1 : 0,
  background: params.get("bg") ?? "#000000",
  antialias: true,
  autoDensity: true,
  resolution: window.devicePixelRatio,
});
stageEl.appendChild(app.canvas);
// Keep the canvas and model fitted when the window or OBS source is resized.
new ResizeObserver(() => {
  app.resize();
  avatar?.applyLayout(avatar.layout);
}).observe(stageEl);

const player = new SpeechPlayer(params.has("mute"));
let avatar: Avatar | null = null;
let avatarConfig: AvatarConfig | null = null;
let panel: Panel | null = null;
let socket: WebSocket | null = null;

function send(message: ClientToServer): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

if (withPanel) {
  panel = new Panel(document.body, send, (layout) => avatar?.applyLayout(layout));
}

function showError(message: string): void {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// Browsers (not OBS) block sound until the page is clicked once. The button
// only appears with ?panel so it can never end up on stream.
function checkAudioUnlocked(): void {
  unlockEl.hidden = !(withPanel && player.blocked);
}
unlockEl.addEventListener("click", () => player.unlock().then(checkAudioUnlocked));
setTimeout(checkAudioUnlocked, 500);

app.ticker.add(() => {
  if (!avatar || !avatarConfig) return;
  avatar.mouth = player.mouthLevel(avatarConfig.mouth.gain, avatarConfig.mouth.smoothing);
});

async function loadAvatar(config: AvatarConfig): Promise<void> {
  if (avatarConfig && avatarConfig.model !== config.model) {
    location.reload(); // model changed in config/avatar.json
    return;
  }
  avatarConfig = config;
  if (avatar) return;
  try {
    avatar = await Avatar.load(app, config);
    errorEl.hidden = true;
    if (params.has("debug")) Object.assign(window, { vtuber: { avatar, player } });
    panel?.setAvatar(config, avatar.layout);
  } catch (error) {
    showError(
      `Couldn't load the Live2D model from ${config.model}\n\n${String(error)}\n\n` +
        "Check that the model folder is inside models/ and that \"model\" in config/avatar.json points at its .model3.json file.",
    );
    console.error(error);
  }
}

let subtitleTimer: ReturnType<typeof setTimeout> | undefined;

async function speak(message: Extract<ServerToClient, { type: "speak" }>): Promise<void> {
  avatar?.setEmotion(message.emotion);
  avatar?.playMotion(message.motion);
  if (showSubtitles) {
    clearTimeout(subtitleTimer);
    subtitleEl.textContent = message.text;
    subtitleEl.hidden = false;
  }
  send({ type: "speech-start", id: message.id });
  try {
    await player.play(message.audioUrl);
  } catch (error) {
    console.error("Could not play speech audio", error);
  }
  send({ type: "speech-end", id: message.id });
  avatar?.relaxEmotionSoon();
  subtitleTimer = setTimeout(() => (subtitleEl.hidden = true), 1500);
}

function handle(message: ServerToClient): void {
  switch (message.type) {
    case "config":
      void loadAvatar(message.avatar);
      panel?.setStatus({ paused: message.paused });
      break;
    case "speak":
      void speak(message);
      break;
    case "emotion":
      avatar?.setEmotion(message.name);
      avatar?.relaxEmotionSoon();
      break;
    case "motion":
      avatar?.playMotion(message.name);
      break;
    case "stop":
      player.stop();
      break;
    case "status":
      panel?.setStatus(message);
      break;
    case "log":
      panel?.log(message.line);
      break;
  }
}

function connect(): void {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => {
    send({ type: "hello", role: withPanel ? "panel" : "avatar" });
    panel?.setConnected(true);
  };
  ws.onmessage = (event) => handle(JSON.parse(String(event.data)) as ServerToClient);
  ws.onclose = () => {
    panel?.setConnected(false);
    setTimeout(connect, 1500); // the server restarted; keep trying
  };
}

connect();
