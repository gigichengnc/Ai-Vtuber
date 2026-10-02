// Your own cloned voice through GPT-SoVITS (https://github.com/RVC-Boss/GPT-SoVITS),
// running on your PC with its API server (api_v2.py, port 9880 by default).
// It copies the tone of a short reference clip, so config/voice.json can give
// a different clip per emotion: an angry clip makes angry lines sound angry.
//
// Only clone a voice you have the rights to: your own, or a voice actor who
// agreed to it.
import type { AudioClip, SpeakOptions, TTSProvider } from "./index.ts";

export interface Reference {
  /** Path to a 3-10 second clip, as seen from the GPT-SoVITS machine. */
  audio: string;
  /** Exactly what is said in that clip. */
  text: string;
}

export interface GptSovitsConfig {
  url: string;
  /** Language of the lines she speaks: zh, en, ja, yue, ko, or auto. */
  textLang: string;
  /** Language spoken in the reference clips. */
  promptLang: string;
  speed?: number;
  /** "default" plus optional clips per emotion name (happy, angry, sleepy...). */
  refs: Record<string, Reference>;
}

export class GptSovitsTTS implements TTSProvider {
  readonly name = "gpt-sovits";

  constructor(private config: GptSovitsConfig) {
    if (!config.refs?.default?.audio) {
      throw new Error('config/voice.json: gptSovits.refs.default needs a reference clip ("audio") and its words ("text").');
    }
  }

  async synthesize(text: string, { emotion }: SpeakOptions = {}): Promise<AudioClip> {
    const ref = (emotion && this.config.refs[emotion]) || this.config.refs.default!;
    const url = `${this.config.url.replace(/\/+$/, "")}/tts`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          text_lang: this.config.textLang,
          ref_audio_path: ref.audio,
          prompt_text: ref.text,
          prompt_lang: this.config.promptLang,
          text_split_method: "cut5",
          batch_size: 1,
          speed_factor: this.config.speed ?? 1,
          media_type: "wav",
          streaming_mode: false,
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      throw new Error(`Couldn't reach GPT-SoVITS at ${url}. Is its API server (api_v2.py) running? (${String(error)})`);
    }
    if (!response.ok) throw new Error(`GPT-SoVITS returned HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return { data: Buffer.from(await response.arrayBuffer()), mime: "audio/wav" };
  }
}
