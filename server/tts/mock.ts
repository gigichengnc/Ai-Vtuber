// Offline stand-in voice: cheerful "babble" beeps, one per syllable, so you
// can test lip sync and timing without internet or API keys.
import type { AudioClip, TTSProvider } from "./index.ts";
import { SAMPLE_RATE, toWav } from "./wav.ts";

export class MockTTS implements TTSProvider {
  readonly name = "mock";

  /** `pitch` 1 = her; lower for a narrator. */
  constructor(private pitch = 1) {}

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
        pushSyllable(0.11 + Math.random() * 0.07, (260 + Math.random() * 120) * this.pitch);
        pushSilence(0.03);
      }
    }
    if (samples.length === 0) pushSyllable(0.3, 300 * this.pitch);
    pushSilence(0.1);
    return { data: toWav(samples), mime: "audio/wav" };
  }
}
