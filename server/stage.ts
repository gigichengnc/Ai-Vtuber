// The show runner: collects chat, asks the AI what to say, turns it into
// voice, sends it to the avatar, and waits for her to finish each line.
import { AudioStore, estimateSeconds } from "./audio-store.ts";
import { type Brain, BrainError, type Line } from "./brain.ts";
import type { Hub } from "./hub.ts";
import type { ChatMessage, Moderator } from "./moderation.ts";
import type { TTSProvider } from "./tts/index.ts";

const MAX_INBOX = 30;
const BATCH = 8;
const TRANSCRIPT_LINES = 40;
const GAP_BETWEEN_LINES_MS = 350;
const ERROR_BACKOFF_MS = 15_000;

export interface StageOptions {
  hub: Hub;
  tts: TTSProvider;
  brain: Brain | null;
  moderator: Moderator;
  audio: AudioStore;
  name: string;
  idleTalkSeconds: number;
  log: (line: string) => void;
}

export class Stage {
  paused = false;
  activity = "idle";
  private inbox: ChatMessage[] = [];
  private manual: Line[] = [];
  private transcript: string[] = [];
  private lastActivity = Date.now();
  private wakeUp: (() => void) | null = null;
  private speechDone = new Map<string, () => void>();

  constructor(private o: StageOptions) {}

  get queueLength(): number {
    return this.inbox.length + this.manual.length;
  }

  /** A viewer wrote something. */
  addChat(message: ChatMessage): void {
    const clean = this.o.moderator.screen(message);
    if (!clean) return;
    this.o.log(`[${clean.source}] ${clean.author}: ${clean.text}`);
    if (this.paused) return;
    this.inbox.push(clean);
    // Too much chat to answer: drop the oldest ordinary messages first.
    while (this.inbox.length > MAX_INBOX) {
      const ordinary = this.inbox.findIndex((m) => !m.privileged && !m.highlight);
      this.inbox.splice(ordinary === -1 ? 0 : ordinary, 1);
    }
    this.notify();
  }

  /** Say exact text, skipping the AI (from the control panel or console). */
  say(line: Line): void {
    this.manual.push(line);
    this.notify();
  }

  pause(): void {
    this.paused = true;
    this.inbox = [];
    this.manual = [];
    this.o.hub.broadcast({ type: "stop" });
    for (const done of this.speechDone.values()) done();
    this.o.log("Paused: she stops talking and ignores chat until you press Resume.");
    this.status("paused");
  }

  resume(): void {
    this.paused = false;
    this.lastActivity = Date.now();
    this.o.log("Resumed.");
    this.status("idle");
    this.notify();
  }

  /** The avatar page finished playing a clip. */
  speechEnded(id: string): void {
    this.speechDone.get(id)?.();
  }

  status(activity = this.activity): void {
    this.activity = activity;
    this.o.hub.broadcast({ type: "status", paused: this.paused, queue: this.queueLength, activity });
  }

  async run(): Promise<never> {
    for (;;) {
      if (this.paused) {
        await this.sleepUntilNotified();
        continue;
      }
      const manual = this.manual.shift();
      if (manual) {
        await this.speak(manual);
        continue;
      }
      if (this.inbox.length > 0) {
        const batch = this.inbox.splice(0, BATCH);
        await this.reply(batch);
        continue;
      }
      const idleMs = this.o.idleTalkSeconds * 1000;
      if (this.o.brain && idleMs > 0 && this.o.hub.watching) {
        const waited = Date.now() - this.lastActivity;
        if (waited >= idleMs) {
          await this.reply([]);
          continue;
        }
        await this.sleepUntilNotified(idleMs - waited);
      } else {
        await this.sleepUntilNotified(5_000);
      }
    }
  }

  private async reply(chat: ChatMessage[]): Promise<void> {
    this.lastActivity = Date.now();
    const brain = this.o.brain;
    if (!brain) {
      this.o.log("No AI configured, so chat isn't answered. Set LLM_BASE_URL / LLM_MODEL in .env.");
      return;
    }
    this.status("thinking");
    let lines: Line[] = [];
    try {
      lines = await brain.respond(this.transcript, chat);
    } catch (error) {
      this.o.log(error instanceof BrainError ? error.message : `AI error: ${String(error)}`);
      this.status("waiting after an error");
      await this.sleep(ERROR_BACKOFF_MS);
    }
    for (const m of chat) this.remember(`[chat] ${m.author}: ${m.text}`);
    for (const line of lines) {
      if (this.paused) break;
      if (this.o.moderator.blocked(line.text)) {
        this.o.log(`Blocked a reply containing a blocklisted word: ${line.text}`);
        continue;
      }
      await this.speak(line);
    }
    this.status("idle");
  }

  private async speak(line: Line): Promise<void> {
    this.status("speaking");
    let clip;
    try {
      clip = await this.o.tts.synthesize(line.text);
    } catch (error) {
      this.o.log(`Voice (${this.o.tts.name}) failed: ${String(error)}`);
      this.status("idle");
      return;
    }
    if (this.paused) return;

    const id = this.o.audio.put(clip);
    this.remember(`[you] ${this.o.name}: ${line.text}`);
    this.o.log(`${this.o.name}: ${line.text}${line.emotion ? ` (${line.emotion}` : ""}${line.motion ? `, ${line.motion})` : line.emotion ? ")" : ""}`);
    const finished = new Promise<void>((resolve) => this.speechDone.set(id, resolve));
    this.o.hub.broadcast({ type: "speak", id, audioUrl: `/audio/${id}`, text: line.text, emotion: line.emotion, motion: line.motion });

    // Wait for the page to say it finished; give up after the clip length plus
    // slack so a closed browser tab can't freeze the show.
    const limit = (estimateSeconds(clip) + 5) * 1000;
    await Promise.race([finished, this.sleep(limit)]);
    this.speechDone.delete(id);
    this.lastActivity = Date.now();
    await this.sleep(GAP_BETWEEN_LINES_MS);
    this.status("idle");
  }

  private remember(entry: string): void {
    this.transcript.push(entry);
    if (this.transcript.length > TRANSCRIPT_LINES) this.transcript.splice(0, this.transcript.length - TRANSCRIPT_LINES);
  }

  private notify(): void {
    this.status();
    this.wakeUp?.();
  }

  private sleepUntilNotified(ms?: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = ms === undefined ? undefined : setTimeout(done, ms);
      const self = this;
      function done() {
        clearTimeout(timer);
        if (self.wakeUp === done) self.wakeUp = null;
        resolve();
      }
      this.wakeUp = done;
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
