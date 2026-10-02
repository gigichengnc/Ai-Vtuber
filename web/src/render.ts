// Video renderer page. `npm run video` opens this in a hidden browser, hands it
// a script plus the voice clips, then asks for one frame at a time. Time only
// moves when a frame is requested, so videos come out smooth at a steady 30 fps
// however fast or slow the computer is.
import { Application, Assets, Container, extensions, Graphics, Sprite, Text, Texture } from "pixi.js";
import { Live2DPlugin } from "untitled-pixi-live2d-engine/cubism";
import { BACKGROUNDS, type Beat, type Episode, FRAME_SIZE, type Timeline } from "../../shared/episode.ts";
import type { AvatarConfig } from "../../shared/protocol.ts";
import { Avatar } from "./avatar.ts";

extensions.add(Live2DPlugin);

const FPS = 30;
const LEAD_IN = 0.3;
const TAIL = 0.7;
const CAMERA_MOVE_SECONDS = 0.35;
const SHAKE_SECONDS = 0.45;
const WHEN_SECONDS = 4;
const FONT = ["Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "WenQuanYi Zen Hei", "sans-serif"];

type Layout = AvatarConfig["layout"];

interface Clip {
  duration: number;
  /** Mouth openness for each frame of the clip. */
  mouth: Float32Array;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

class Studio {
  private app = new Application();
  private avatar!: Avatar;
  private config!: AvatarConfig;
  private episode!: Episode;
  private clips: (Clip | null)[] = [];
  private timeline!: Timeline;
  private background = new Container();
  private caption!: Text;
  private subtitle!: Text;
  private whenLabel!: Container;
  private beatIndex = -1;
  private camera = { from: { zoom: 1, x: 0.5, y: 0.5 }, to: { zoom: 1, x: 0.5, y: 0.5 }, start: -10 };
  private shakeStart = -10;
  private captionStart = 0;
  private captionTilt = 0;

  async load(episode: Episode, clipUrls: (string | null)[]): Promise<Timeline> {
    this.episode = episode;
    this.config = (await (await fetch("/api/avatar-config")).json()) as AvatarConfig;
    const { width, height } = FRAME_SIZE[episode.aspect];
    const portrait = episode.aspect === "portrait";

    await this.app.init({
      width,
      height,
      autoStart: false,
      preference: "webgl",
      background: "#000000",
      antialias: true,
      resolution: 1,
      preserveDrawingBuffer: true,
    });
    document.body.appendChild(this.app.canvas);
    this.app.stage.addChild(this.background);

    this.avatar = await Avatar.load(this.app, this.config, { video: true });
    const firstCamera = this.config.cameras?.medium ?? this.config.layout;
    this.camera.from = this.camera.to = { ...firstCamera };

    this.caption = new Text({
      text: "",
      anchor: 0.5,
      style: {
        fontFamily: FONT,
        fontSize: portrait ? 112 : 96,
        fontWeight: "900",
        fill: "#ffffff",
        stroke: { color: "#3a2140", width: portrait ? 16 : 14, join: "round" },
        dropShadow: { color: "#000000", alpha: 0.35, blur: 6, distance: 6, angle: Math.PI / 2 },
        align: "center",
        wordWrap: true,
        breakWords: true,
        wordWrapWidth: width * 0.86,
        lineHeight: (portrait ? 112 : 96) * 1.15,
      },
    });
    this.caption.position.set(width / 2, height * (portrait ? 0.17 : 0.15));
    this.subtitle = new Text({
      text: "",
      anchor: { x: 0.5, y: 1 },
      style: {
        fontFamily: FONT,
        fontSize: portrait ? 58 : 46,
        fontWeight: "700",
        fill: "#ffffff",
        stroke: { color: "#2a1830", width: portrait ? 10 : 8, join: "round" },
        align: "center",
        wordWrap: true,
        breakWords: true,
        wordWrapWidth: width * (portrait ? 0.86 : 0.8),
        lineHeight: (portrait ? 58 : 46) * 1.3,
      },
    });
    this.subtitle.position.set(width / 2, height * (portrait ? 0.9 : 0.93));
    this.whenLabel = this.makeWhenLabel(episode.when, portrait);
    this.app.stage.addChild(this.caption, this.subtitle, this.whenLabel);

    await this.setBackground(episode.background ?? "sakura");
    this.clips = await Promise.all(clipUrls.map((url) => (url ? this.loadClip(url) : null)));
    this.timeline = this.planTimeline();
    return this.timeline;
  }

  /** Renders frame `i` and returns it as a JPEG data URL. */
  async frame(i: number): Promise<string> {
    const t = i / FPS;
    const beats = this.timeline.beats;
    while (this.beatIndex + 1 < beats.length && beats[this.beatIndex + 1]!.start <= t) {
      this.beatIndex++;
      await this.enterBeat(this.beatIndex, t);
    }

    const beat = this.episode.beats[this.beatIndex];
    const timing = beats[this.beatIndex];
    const clip = this.clips[this.beatIndex];
    let mouth = 0;
    if (beat && timing && clip && (beat.speaker ?? "main") === "main") {
      mouth = clip.mouth[Math.floor((t - timing.start) * FPS)] ?? 0;
    }
    this.avatar.mouth = mouth;

    this.updateCamera(t);
    this.updateCaption(t);
    // The "when in her story" label: fade in, hold, fade out.
    const fade = Math.min(t / 0.4, 1, Math.max(0, (WHEN_SECONDS - t) / 0.6));
    this.whenLabel.alpha = Math.max(0, fade);
    this.avatar.model.update(1000 / FPS);
    this.app.renderer.render(this.app.stage);
    return this.app.canvas.toDataURL("image/jpeg", 0.92);
  }

  private makeWhenLabel(when: string | undefined, portrait: boolean): Container {
    const box = new Container();
    if (!when) return box;
    const size = portrait ? 40 : 32;
    const text = new Text({
      text: when,
      style: { fontFamily: FONT, fontSize: size, fontWeight: "600", fill: "#ffffff", letterSpacing: 1 },
    });
    const padX = size * 0.6;
    const padY = size * 0.35;
    const pill = new Graphics()
      .roundRect(0, 0, text.width + padX * 2, text.height + padY * 2, (text.height + padY * 2) / 2)
      .fill({ color: "#2a1830", alpha: 0.55 });
    text.position.set(padX, padY);
    box.addChild(pill, text);
    const margin = this.app.screen.width * 0.05;
    box.position.set(margin, this.app.screen.height * (portrait ? 0.045 : 0.06));
    box.alpha = 0;
    return box;
  }

  private planTimeline(): Timeline {
    let t = LEAD_IN;
    const beats = this.episode.beats.map((beat, i) => {
      const clip = this.clips[i];
      const speech = clip?.duration ?? 0;
      const start = t;
      const end = start + (clip ? speech : (beat.hold ?? 1.2)) + (beat.pause ?? 0.25);
      t = end;
      return { start, end, speechEnd: start + speech };
    });
    return { fps: FPS, frames: Math.ceil((t + TAIL) * FPS), beats };
  }

  private async enterBeat(index: number, t: number): Promise<void> {
    const beat: Beat = this.episode.beats[index]!;
    if (beat.background) await this.setBackground(beat.background);
    if (beat.emotion) await this.avatar.setEmotion(beat.emotion);
    if (beat.motion) await this.avatar.playMotion(beat.motion);
    this.avatar.setSticker(beat.sticker);

    if (beat.camera === "shake") this.shakeStart = t;
    else if (beat.camera && this.config.cameras?.[beat.camera]) {
      this.camera = { from: this.currentLayout(t), to: { ...this.config.cameras[beat.camera]! }, start: t };
    }

    this.caption.text = beat.caption ?? "";
    this.captionStart = t;
    this.captionTilt = ((((index * 37) % 9) - 4) * Math.PI) / 180;

    const narrator = beat.speaker === "narrator";
    this.subtitle.text = beat.say ?? "";
    this.subtitle.style.fill = narrator ? "#ffe28a" : "#ffffff";
  }

  private currentLayout(t: number): Layout {
    const k = easeOut((t - this.camera.start) / CAMERA_MOVE_SECONDS);
    const { from, to } = this.camera;
    return { zoom: lerp(from.zoom, to.zoom, k), x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) };
  }

  private updateCamera(t: number): void {
    const layout = this.currentLayout(t);
    const s = t - this.shakeStart;
    if (s >= 0 && s < SHAKE_SECONDS) {
      const strength = 0.012 * (1 - s / SHAKE_SECONDS);
      layout.x += Math.sin(s * 70) * strength;
      layout.y += Math.cos(s * 55) * strength;
    }
    this.avatar.applyLayout(layout);
  }

  private updateCaption(t: number): void {
    if (!this.caption.text) {
      this.caption.visible = false;
      return;
    }
    this.caption.visible = true;
    const s = t - this.captionStart;
    // Pop in: overshoot, settle, then a gentle wobble.
    const scale = s < 0.12 ? lerp(0.3, 1.15, s / 0.12) : s < 0.22 ? lerp(1.15, 1, (s - 0.12) / 0.1) : 1;
    this.caption.scale.set(scale);
    this.caption.rotation = this.captionTilt + Math.sin(s * 3) * 0.015;
  }

  /** Preset name, "#hex" colour, "#top,#bottom" gradient, or an image in assets/backgrounds/. */
  private async setBackground(name: string): Promise<void> {
    const spec = BACKGROUNDS[name] ?? name;
    const { width, height } = this.app.screen;
    let texture: Texture;
    if (spec.startsWith("/") || /\.(png|jpe?g|webp)$/i.test(spec)) {
      texture = await Assets.load<Texture>(spec.startsWith("/") ? spec : `/assets/backgrounds/${spec}`);
    } else {
      const [top, bottom] = spec.split(",").map((c) => c.trim());
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, top || "#ffe4ef");
      gradient.addColorStop(1, bottom || top || "#d7ecff");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 4, 256);
      texture = Texture.from(canvas);
    }
    const sprite = new Sprite(texture);
    // Cover the whole frame, cropping the image if its shape differs.
    const scale = Math.max(width / texture.width, height / texture.height);
    sprite.scale.set(scale);
    sprite.anchor.set(0.5);
    sprite.position.set(width / 2, height / 2);
    this.background.removeChildren().forEach((child) => child.destroy());
    this.background.addChild(sprite);
  }

  private async loadClip(url: string): Promise<Clip> {
    const data = await (await fetch(url)).arrayBuffer();
    const buffer = await new OfflineAudioContext(1, 1, 48_000).decodeAudioData(data);
    const samples = buffer.getChannelData(0);
    const perFrame = buffer.sampleRate / FPS;
    const frames = Math.ceil(buffer.duration * FPS);
    const mouth = new Float32Array(frames);
    const { gain, smoothing } = this.config.mouth;
    let level = 0;
    for (let f = 0; f < frames; f++) {
      const from = Math.floor(f * perFrame);
      const to = Math.min(samples.length, Math.floor((f + 1) * perFrame));
      let sum = 0;
      for (let s = from; s < to; s++) sum += samples[s]! * samples[s]!;
      const rms = Math.sqrt(sum / Math.max(1, to - from));
      // Same feel as live mode (web/src/speech.ts): open fast, close a bit slower.
      const target = Math.min(1, Math.max(0, (rms - 0.01) * 8 * gain));
      level += (target - level) * (target > level ? 0.6 : 1 - smoothing);
      mouth[f] = level;
    }
    return { duration: buffer.duration, mouth };
  }
}

Object.assign(window, { studio: new Studio() });
