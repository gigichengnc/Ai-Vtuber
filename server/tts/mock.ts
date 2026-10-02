// Offline stand-in voice: cheerful "babble" beeps, one per syllable, so you
// can test lip sync and timing without internet or API keys.
import type { AudioClip, TTSProvider } from "./index.ts";

const SAMPLE_RATE = 24_000;

export class MockTTS implements TTSProvider {
  readonly name = "mock";

  async synthesize(text: string): Promise<AudioClip> {
    const samples: number[] = [];
    const pushSilence = (seconds: number) => {
      for (let i = 0; i < seconds * SAMPLE_RATE; i++) samples.push(0);
    };
    const pushSyllable = (seconds: number, pitch: number) => {
      const n = Math.floor(seconds * SAMPLE_RATE);
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        const envelope = Math.sin((Math.PI * i) / n);
        const f = pitch * (1 + 0.03 * Math.sin(2 * Math.PI * 6 * t));
        const wave = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t);
        samples.push(0.35 * envelope * wave);
      }
    };

    // Roughly one beep per CJK character or per English syllable.
    for (const token of text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[a-zA-Z]+|[.,!?;:。，！？；：…]/gu) ?? []) {
      if (/^[.,!?;:。，！？；：…]$/u.test(token)) {
        pushSilence(0.22);
        continue;
      }
      const syllables = /^[a-zA-Z]+$/.test(token) ? Math.max(1, Math.round(token.length / 3)) : 1;
      for (let s = 0; s < syllables; s++) {
        pushSyllable(0.11 + Math.random() * 0.07, 260 + Math.random() * 120);
        pushSilence(0.03);
      }
    }
    if (samples.length === 0) pushSyllable(0.3, 300);
    pushSilence(0.1);
    return { data: toWav(samples), mime: "audio/wav" };
  }
}

function toWav(samples: number[]): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
