// Plays the voice clips the server sends, and measures how loud they are each
// frame so the avatar's mouth can follow the voice.

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SpeechPlayer {
  private ctx = new AudioContext();
  private analyser = this.ctx.createAnalyser();
  private output = this.ctx.createGain();
  private samples = new Float32Array(1024);
  private current: AudioBufferSourceNode | null = null;
  private level = 0;

  constructor(muted: boolean) {
    this.analyser.fftSize = 1024;
    this.analyser.connect(this.output);
    this.output.connect(this.ctx.destination);
    // Muted pages still analyse the audio so the mouth moves; they just stay silent.
    this.output.gain.value = muted ? 0 : 1;
  }

  /** Browsers block audio until the page is clicked once (OBS does not). */
  get blocked(): boolean {
    return this.ctx.state === "suspended";
  }

  unlock(): Promise<void> {
    return this.ctx.resume();
  }

  /** Resolves when the clip finishes (or is stopped). */
  async play(url: string): Promise<void> {
    this.stop();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio ${url} returned HTTP ${response.status}`);
    const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
    if (this.blocked) {
      await Promise.race([this.unlock(), sleep(200)]).catch(() => {});
      // Still not allowed to make sound: wait out the clip silently so the
      // server's timing stays right.
      if (this.blocked) return sleep(buffer.duration * 1000);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    this.current = source;
    return new Promise((resolve) => {
      source.onended = () => {
        if (this.current === source) this.current = null;
        resolve();
      };
      source.start();
    });
  }

  stop(): void {
    if (!this.current) return;
    const source = this.current;
    this.current = null;
    source.stop();
  }

  get speaking(): boolean {
    return this.current !== null;
  }

  /**
   * Mouth openness between 0 and 1 for this frame. Opens fast and closes a
   * little slower, which looks more natural than raw volume.
   */
  mouthLevel(gain: number, smoothing: number): number {
    let target = 0;
    if (this.current) {
      this.analyser.getFloatTimeDomainData(this.samples);
      let sum = 0;
      for (const s of this.samples) sum += s * s;
      const rms = Math.sqrt(sum / this.samples.length);
      // Ignore background hiss, then scale speech into 0..1.
      target = Math.min(1, Math.max(0, (rms - 0.01) * 8 * gain));
    }
    const rate = target > this.level ? 0.6 : 1 - smoothing;
    this.level += (target - this.level) * rate;
    return this.level;
  }
}
