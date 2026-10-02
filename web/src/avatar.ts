// Loads the Live2D model and keeps it alive: idle motion, blinking, gentle
// head movement, lip sync, expressions and gestures.
import type { Application } from "pixi.js";
import {
  type CubismInternalModel,
  configureCubismSDK,
  Live2DModel,
  MotionPreloadStrategy,
  MotionPriority,
} from "untitled-pixi-live2d-engine/cubism";
import type { AvatarConfig } from "../../shared/protocol.ts";

// A 3.4 MB .moc3 needs more than the engine's 16 MB default work memory.
configureCubismSDK({ memorySizeMB: 64 });

type Layout = AvatarConfig["layout"];

export class Avatar {
  readonly model: Live2DModel;
  private params = new Map<string, number>();
  private time = 0;
  private blink = { next: 2, phase: -1 };
  private gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 1 };
  private resetTimer: ReturnType<typeof setTimeout> | undefined;
  private baseHeight = 1;
  /** Sticker parameter index -> how visible it is now (0..1) and should be. */
  private stickers = new Map<number, { value: number; target: number; max: number }>();

  /** Mouth openness 0..1, set every frame by whoever is playing audio. */
  mouth = 0;

  private constructor(
    model: Live2DModel,
    private config: AvatarConfig,
    private app: Application,
  ) {
    this.model = model;
    const core = this.internal.coreModel;
    const ids = core.getModel().parameters.ids;
    ids.forEach((id, index) => this.params.set(id, index));
    for (const id of Object.values(config.stickers ?? {})) {
      const index = this.params.get(id);
      if (index !== undefined) this.stickers.set(index, { value: 0, target: 0, max: core.getParameterMaximumValue(index) });
    }

    // Run our procedural animation after motions/expressions but before
    // physics, so hair and accessories swing with the head movement.
    const internal = this.internal;
    const original = internal.updateNaturalMovements.bind(internal);
    internal.updateNaturalMovements = (dt, now) => {
      original(dt, now);
      this.animate(dt / 1000);
    };
  }

  /**
   * `video: true` is for rendering videos: time only moves when the renderer
   * calls `model.update()`, and all motions are loaded up front.
   */
  static async load(app: Application, config: AvatarConfig, { video = false } = {}): Promise<Avatar> {
    const model = await Live2DModel.from(config.model, {
      autoFocus: false, // no mouse in OBS; we move the eyes ourselves
      autoHitTest: false,
      autoUpdate: !video,
      motionPreload: video ? MotionPreloadStrategy.ALL : MotionPreloadStrategy.IDLE,
    });
    const avatar = new Avatar(model, config, app);
    app.stage.addChild(model);
    model.anchor.set(0.5, 0.5);
    avatar.baseHeight = model.height / model.scale.y;
    avatar.applyLayout(config.layout);

    if (config.loops.length > 0) {
      void model.parallelMotion(config.loops.map((m) => ({ group: m.group, index: m.index, loop: true })));
    }
    avatar.setEmotion(config.defaultEmotion);
    return avatar;
  }

  private get internal(): CubismInternalModel {
    return this.model.internalModel as unknown as CubismInternalModel;
  }

  get layout(): Layout {
    return this.config.layout;
  }

  applyLayout(layout: Layout): void {
    this.config.layout = layout;
    const { width, height } = this.app.screen;
    this.model.scale.set((height * layout.zoom) / this.baseHeight);
    this.model.position.set(width * layout.x, height * layout.y);
  }

  /** Accepts an emotion name from config, or a raw expression name. */
  setEmotion(name: string | undefined): Promise<boolean> {
    if (!name) return Promise.resolve(false);
    clearTimeout(this.resetTimer);
    const expression = this.config.emotions[name] ?? name;
    return this.model.expression(expression);
  }

  /** Go back to the default face after `emotionHoldSeconds`. */
  relaxEmotionSoon(): void {
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(
      () => this.setEmotion(this.config.defaultEmotion),
      this.config.emotionHoldSeconds * 1000,
    );
  }

  playMotion(name: string | undefined): Promise<boolean> {
    const motion = name && name !== "none" ? this.config.motions[name] : undefined;
    if (!motion) return Promise.resolve(false);
    return this.model.motion(motion.group, motion.index, MotionPriority.FORCE, {
      resetExpression: false,
    });
  }

  /** Show one built-in sticker (fades in), or none (fades out). */
  setSticker(name: string | undefined): void {
    const id = name ? this.config.stickers?.[name] : undefined;
    const active = id === undefined ? undefined : this.params.get(id);
    for (const [index, sticker] of this.stickers) sticker.target = index === active ? 1 : 0;
  }

  private animate(dt: number): void {
    const core = this.internal.coreModel;
    const add = (id: string, value: number) => {
      const index = this.params.get(id);
      if (index !== undefined) core.addParameterValueByIndex(index, value);
    };
    const t = (this.time += dt);
    const talk = this.mouth;

    // Slow, layered sine waves read as natural idle sway; nod a bit while talking.
    add("ParamAngleX", 6 * Math.sin(t * 0.5) + 3 * Math.sin(t * 1.3 + 1));
    add("ParamAngleY", 3 * Math.sin(t * 0.7 + 2) + 1.5 * Math.sin(t * 1.9) + talk * 5);
    add("ParamAngleZ", 3 * Math.sin(t * 0.4 + 4) + talk * 1.5 * Math.sin(t * 6));
    add("ParamBodyAngleX", 2 * Math.sin(t * 0.35 + 1));
    add("ParamBodyAngleZ", 1.5 * Math.sin(t * 0.3 + 3));

    // Eyes glance somewhere new every few seconds.
    const gaze = this.gaze;
    if ((gaze.next -= dt) <= 0) {
      gaze.next = 1.5 + Math.random() * 3;
      const centre = Math.random() < 0.5;
      gaze.tx = centre ? 0 : (Math.random() - 0.5) * 0.8;
      gaze.ty = centre ? 0 : (Math.random() - 0.5) * 0.4;
    }
    gaze.x += (gaze.tx - gaze.x) * Math.min(1, dt * 8);
    gaze.y += (gaze.ty - gaze.y) * Math.min(1, dt * 8);
    add("ParamEyeBallX", gaze.x);
    add("ParamEyeBallY", gaze.y);

    // Blink every 2-6 s. We scale the eye-open value instead of setting it, so
    // smiling or sleepy expressions keep their eye shape.
    const blink = this.blink;
    if (blink.phase < 0 && (blink.next -= dt) <= 0) blink.phase = 0;
    if (blink.phase >= 0) {
      blink.phase += dt;
      const closing = 0.07, closed = 0.05, opening = 0.12;
      const p = blink.phase;
      const open =
        p < closing ? 1 - p / closing
        : p < closing + closed ? 0
        : p < closing + closed + opening ? (p - closing - closed) / opening
        : 1;
      for (const id of ["ParamEyeLOpen", "ParamEyeROpen"]) {
        const index = this.params.get(id);
        if (index !== undefined) core.setParameterValueByIndex(index, core.getParameterValueByIndex(index) * open);
      }
      if (p >= closing + closed + opening) {
        blink.phase = -1;
        blink.next = Math.random() < 0.15 ? 0.15 : 2 + Math.random() * 4; // sometimes a double blink
      }
    }

    // Stickers fade in quickly and out a little slower.
    for (const [index, sticker] of this.stickers) {
      const rate = sticker.target > sticker.value ? 12 : 6;
      sticker.value += (sticker.target - sticker.value) * Math.min(1, dt * rate);
      if (sticker.value > 0.001) core.setParameterValueByIndex(index, sticker.value * sticker.max);
    }

    // Lip sync.
    const mouthIndex = this.params.get(this.config.mouth.parameter);
    if (mouthIndex !== undefined && talk > 0.01) {
      const current = core.getParameterValueByIndex(mouthIndex);
      core.setParameterValueByIndex(mouthIndex, Math.max(current, talk));
    }
  }
}
