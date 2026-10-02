// Text-to-speech. Each provider turns a line of text into an audio clip.
import { settings } from "../config.ts";
import { EdgeTTS } from "./edge.ts";
import { MockTTS } from "./mock.ts";

export interface AudioClip {
  data: Buffer;
  mime: string;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string): Promise<AudioClip>;
}

export function createTTS(): TTSProvider {
  switch (settings.tts.provider) {
    case "mock":
      return new MockTTS();
    case "edge":
      return new EdgeTTS(settings.tts.voice, settings.tts.rate, settings.tts.pitch);
    default:
      throw new Error(`Unknown TTS_PROVIDER "${settings.tts.provider}". Use "edge" or "mock".`);
  }
}
