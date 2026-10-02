// Free Microsoft Edge "Read Aloud" voices. Unofficial, so it can change without
// notice; if it stops working, switch TTS_PROVIDER or add another provider.
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { AudioClip, TTSProvider } from "./index.ts";

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

export class EdgeTTS implements TTSProvider {
  readonly name = "edge";
  private client: MsEdgeTTS | null = null;

  constructor(
    private voice: string,
    private rate: string,
    private pitch: string,
  ) {}

  private async connect(): Promise<MsEdgeTTS> {
    if (!this.client) {
      const client = new MsEdgeTTS();
      await client.setMetadata(this.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      this.client = client;
    }
    return this.client;
  }

  async synthesize(text: string): Promise<AudioClip> {
    try {
      return await this.request(text);
    } catch {
      // The connection drops after being idle; reconnect once and retry.
      this.client?.close();
      this.client = null;
      return this.request(text);
    }
  }

  private async request(text: string): Promise<AudioClip> {
    const client = await this.connect();
    const { audioStream } = client.toStream(escapeXml(text), { rate: this.rate, pitch: this.pitch });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Edge TTS timed out")), 20_000);
      audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      audioStream.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const data = Buffer.concat(chunks);
    if (data.length === 0) throw new Error("Edge TTS returned no audio");
    return { data, mime: "audio/mpeg" };
  }
}
