// Text-to-speech. Each provider turns a line of text into an audio clip.
import { existsSync, readFileSync } from "node:fs";
import { rootPath, settings } from "../config.ts";
import { CommandTTS } from "./command.ts";
import { EdgeTTS } from "./edge.ts";
import { type GptSovitsConfig, GptSovitsTTS } from "./gpt-sovits.ts";
import { MockTTS } from "./mock.ts";

export interface AudioClip {
  data: Buffer;
  mime: string;
}

export interface SpeakOptions {
  /** Lets voices that can act (GPT-SoVITS) match the emotion. */
  emotion?: string;
  /** "narrator" lines use a second voice (videos). */
  speaker?: "main" | "narrator";
}

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, options?: SpeakOptions): Promise<AudioClip>;
}

function loadVoiceConfig(): { gptSovits?: GptSovitsConfig } {
  const path = rootPath("config/voice.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

function createMainVoice(): TTSProvider {
  switch (settings.tts.provider) {
    case "mock":
      return new MockTTS();
    case "edge":
      return new EdgeTTS(settings.tts.voice, settings.tts.rate, settings.tts.pitch);
    case "command":
      if (!settings.tts.command) throw new Error("TTS_PROVIDER=command needs TTS_COMMAND in .env.");
      return new CommandTTS(settings.tts.command);
    case "gpt-sovits": {
      const config = loadVoiceConfig().gptSovits;
      if (!config) throw new Error('TTS_PROVIDER=gpt-sovits needs a "gptSovits" section in config/voice.json.');
      return new GptSovitsTTS(config);
    }
    default:
      throw new Error(`Unknown TTS_PROVIDER "${settings.tts.provider}". Use "edge", "command", "gpt-sovits" or "mock".`);
  }
}

/** Her voice, plus a narrator voice that is created the first time it's needed. */
export function createTTS(): TTSProvider {
  const main = createMainVoice();
  let narrator: TTSProvider | null = null;
  return {
    name: main.name,
    synthesize(text, options = {}) {
      if (options.speaker !== "narrator") return main.synthesize(text, options);
      // A command picks its own narrator voice from TTS_SPEAKER.
      if (main instanceof CommandTTS) return main.synthesize(text, options);
      narrator ??=
        settings.tts.provider === "mock" ? new MockTTS(0.6) : new EdgeTTS(settings.tts.narratorVoice, "+0%", "+0Hz");
      return narrator.synthesize(text);
    },
  };
}
