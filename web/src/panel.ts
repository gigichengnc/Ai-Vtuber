// Control panel shown with ?panel: test her voice and faces, chat as a fake
// viewer, hit the panic button, and position the model for OBS.
import type { AvatarConfig, ClientToServer } from "../../shared/protocol.ts";

type Layout = AvatarConfig["layout"];

export class Panel {
  private root = document.createElement("aside");
  private el = <T extends HTMLElement>(selector: string) => this.root.querySelector(selector) as T;
  private paused = false;

  constructor(
    host: HTMLElement,
    private send: (message: ClientToServer) => void,
    private onLayout: (layout: Layout) => void,
  ) {
    this.root.id = "panel";
    this.root.innerHTML = `
      <h2>Status</h2>
      <div class="status"><span class="dot" id="dot"></span><span id="status-text">Connecting…</span></div>
      <div class="row"><button id="pause" class="danger">Stop talking (panic)</button></div>

      <h2>Make her say</h2>
      <textarea id="say-text" placeholder="Hello, I'm Zhaomu."></textarea>
      <div class="row">
        <select id="say-emotion"></select>
        <select id="say-motion"></select>
      </div>
      <div class="row"><button id="say" class="primary">Say it</button></div>

      <h2>Chat as a viewer</h2>
      <div class="row">
        <input type="text" id="chat-author" value="Tester" style="flex:0 0 90px" />
        <input type="text" id="chat-text" placeholder="Ask her something…" />
      </div>
      <div class="row"><button id="chat">Send to the AI</button></div>

      <h2>Faces</h2>
      <div class="chips" id="emotions"></div>

      <h2>Moves</h2>
      <div class="chips" id="motions"></div>

      <h2>Position (for OBS)</h2>
      <label>Size <input type="range" id="zoom" min="0.3" max="4" step="0.01" /><output id="zoom-out"></output></label>
      <label>Left/right <input type="range" id="x" min="0" max="1" step="0.005" /><output id="x-out"></output></label>
      <label>Up/down <input type="range" id="y" min="-0.5" max="2" step="0.005" /><output id="y-out"></output></label>
      <div class="row"><button id="copy-layout">Copy for config/avatar.json</button></div>

      <h2>Log</h2>
      <div id="log"></div>
    `;
    host.appendChild(this.root);

    this.el("#pause").addEventListener("click", () => this.send({ type: this.paused ? "resume" : "pause" }));
    this.el("#say").addEventListener("click", () => this.say());
    this.el("#say-text").addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter" && !(e as KeyboardEvent).shiftKey) {
        e.preventDefault();
        this.say();
      }
    });
    this.el("#chat").addEventListener("click", () => this.chat());
    this.el("#chat-text").addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") this.chat();
    });
  }

  setAvatar(config: AvatarConfig, layout: Layout): void {
    const emotions = Object.keys(config.emotions);
    const motions = Object.keys(config.motions);
    this.el<HTMLSelectElement>("#say-emotion").innerHTML =
      `<option value="">(keep face)</option>` + emotions.map((e) => `<option>${e}</option>`).join("");
    this.el<HTMLSelectElement>("#say-motion").innerHTML =
      `<option value="">(no move)</option>` + motions.map((m) => `<option>${m}</option>`).join("");

    const chips = (container: string, names: string[], type: "emotion" | "motion") => {
      const box = this.el(container);
      box.replaceChildren(
        ...names.map((name) => {
          const button = document.createElement("button");
          button.textContent = name;
          button.title = type === "motion" ? (config.motions[name]?.description ?? "") : (config.emotions[name] ?? "");
          button.addEventListener("click", () => this.send({ type, name }));
          return button;
        }),
      );
    };
    chips("#emotions", emotions, "emotion");
    chips("#motions", motions, "motion");

    const current = { ...layout };
    for (const key of ["zoom", "x", "y"] as const) {
      const input = this.el<HTMLInputElement>(`#${key}`);
      const out = this.el<HTMLOutputElement>(`#${key}-out`);
      input.value = String(current[key]);
      out.value = current[key].toFixed(2);
      input.addEventListener("input", () => {
        current[key] = Number(input.value);
        out.value = current[key].toFixed(2);
        this.onLayout({ ...current });
      });
    }
    this.el("#copy-layout").addEventListener("click", () => {
      const json = `"layout": ${JSON.stringify({ zoom: round(current.zoom), x: round(current.x), y: round(current.y) })}`;
      void navigator.clipboard?.writeText(json).catch(() => {});
      this.log(`Paste this into config/avatar.json:\n${json}`);
    });
  }

  setConnected(connected: boolean): void {
    if (!connected) {
      this.el("#dot").className = "dot";
      this.el("#status-text").textContent = "Server offline, reconnecting…";
    }
  }

  setStatus(status: { paused: boolean; queue?: number; activity?: string }): void {
    this.paused = status.paused;
    this.el("#dot").className = `dot ${status.paused ? "paused" : "live"}`;
    const parts = [status.paused ? "Paused" : "Live"];
    if (status.activity) parts.push(status.activity);
    if (status.queue) parts.push(`${status.queue} chat waiting`);
    this.el("#status-text").textContent = parts.join(" · ");
    const button = this.el<HTMLButtonElement>("#pause");
    button.textContent = status.paused ? "Resume" : "Stop talking (panic)";
    button.className = status.paused ? "primary" : "danger";
  }

  log(line: string): void {
    const log = this.el("#log");
    const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
    log.append(`${new Date().toLocaleTimeString()}  ${line}\n`);
    while (log.childNodes.length > 300) log.firstChild?.remove();
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  private say(): void {
    const text = this.el<HTMLTextAreaElement>("#say-text").value.trim();
    if (!text) return;
    const emotion = this.el<HTMLSelectElement>("#say-emotion").value || undefined;
    const motion = this.el<HTMLSelectElement>("#say-motion").value || undefined;
    this.send({ type: "say", text, emotion, motion });
    this.el<HTMLTextAreaElement>("#say-text").value = "";
  }

  private chat(): void {
    const input = this.el<HTMLInputElement>("#chat-text");
    const text = input.value.trim();
    if (!text) return;
    const author = this.el<HTMLInputElement>("#chat-author").value.trim() || "Tester";
    this.send({ type: "chat", author, text });
    input.value = "";
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
