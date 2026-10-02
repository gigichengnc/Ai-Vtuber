// Tiny WAV helpers for the sounds we generate ourselves.
export const SAMPLE_RATE = 24_000;

/** Mono 16-bit PCM WAV from samples in -1..1. */
export function toWav(samples: ArrayLike<number>, sampleRate = SAMPLE_RATE): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Length of a WAV file in seconds, read from its header. */
export function wavSeconds(wav: Buffer): number {
  const byteRate = wav.length >= 32 ? wav.readUInt32LE(28) : 0;
  return byteRate > 0 ? Math.max(0, wav.length - 44) / byteRate : 0;
}
