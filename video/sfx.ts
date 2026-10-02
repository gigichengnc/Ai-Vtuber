// Little sound effects for videos, generated in code (no licensing worries).
import { SAMPLE_RATE, toWav } from "../server/tts/wav.ts";

export const SFX_NAMES = ["pop", "ding", "boing", "whoosh", "wobble"] as const;
export type SfxName = (typeof SFX_NAMES)[number];

function render(seconds: number, fn: (t: number, i: number) => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < seconds * SAMPLE_RATE; i++) out.push(fn(i / SAMPLE_RATE, i));
  return out;
}

export function makeSfx(name: SfxName): Buffer {
  let phase = 0;
  const tone = (freq: number) => {
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    return Math.sin(phase);
  };
  let samples: number[];
  switch (name) {
    case "pop": // quick upward blip
      samples = render(0.09, (t) => tone(500 + 9000 * t) * Math.exp(-t * 40) * 0.6);
      break;
    case "ding": // bright bell
      samples = render(0.7, (t) => (Math.sin(2 * Math.PI * 1320 * t) + 0.5 * Math.sin(2 * Math.PI * 2640 * t)) * Math.exp(-t * 6) * 0.35);
      break;
    case "boing": // springy cartoon bounce
      samples = render(0.45, (t) => tone(220 + 160 * Math.sin(t * 40) * Math.exp(-t * 5) + 120 * t) * Math.exp(-t * 4) * 0.55);
      break;
    case "whoosh": { // swish of air
      let smooth = 0;
      samples = render(0.4, (t) => {
        smooth += (Math.random() * 2 - 1 - smooth) * (0.05 + 0.4 * Math.sin(Math.PI * (t / 0.4)));
        return smooth * Math.sin(Math.PI * (t / 0.4)) * 0.9;
      });
      break;
    }
    case "wobble": // confused "huh?"
      samples = render(0.55, (t) => tone(420 + 70 * Math.sin(2 * Math.PI * 9 * t)) * Math.min(1, t * 30) * Math.exp(-t * 3) * 0.45);
      break;
  }
  return toWav(samples);
}
