// Messages exchanged over the /ws WebSocket between the server and the pages
// it serves (the avatar page that OBS shows, and the control panel).

/** One move the avatar can make, as listed in config/avatar.json. */
export interface MotionRef {
  group: string;
  index: number;
  /** Shown to the AI so it knows when to use this motion. */
  description?: string;
}

export interface AvatarConfig {
  /** URL of the .model3.json file, e.g. /models/zhaomu/朝暮_v6.model3.json */
  model: string;
  layout: {
    /** Model height as a fraction of the screen height. */
    zoom: number;
    /** Centre of the model, as a fraction of screen width / height. */
    x: number;
    y: number;
  };
  /** Expression applied when nothing else is going on (a key of `emotions`). */
  defaultEmotion: string;
  /** How long an emotion stays on her face after she stops talking. */
  emotionHoldSeconds: number;
  /** Emotion name -> expression name from the .model3.json file. */
  emotions: Record<string, string>;
  /** Motion name -> motion in the .model3.json file. */
  motions: Record<string, MotionRef>;
  /** Motions that loop forever alongside the idle motion (e.g. an accessory). */
  loops: MotionRef[];
  /** Lip-sync tuning. */
  mouth: { parameter: string; gain: number; smoothing: number };
  /** Sticker name -> model parameter that shows it (videos). */
  stickers?: Record<string, string>;
  /** Camera shot name -> framing (videos). Same units as `layout`. */
  cameras?: Record<string, { zoom: number; x: number; y: number }>;
}

export type ServerToClient =
  | { type: "config"; avatar: AvatarConfig; paused: boolean }
  | {
      type: "speak";
      id: string;
      audioUrl: string;
      text: string;
      emotion?: string;
      motion?: string;
    }
  | { type: "emotion"; name: string }
  | { type: "motion"; name: string }
  | { type: "stop" }
  | { type: "status"; paused: boolean; queue: number; activity: string }
  | { type: "log"; line: string };

export type ClientToServer =
  | { type: "hello"; role: "avatar" | "panel" }
  | { type: "speech-start"; id: string }
  | { type: "speech-end"; id: string }
  /** Control panel: make her say exact text (skips the AI). */
  | { type: "say"; text: string; emotion?: string; motion?: string }
  /** Control panel: pretend to be a viewer typing in chat. */
  | { type: "chat"; author: string; text: string }
  | { type: "emotion"; name: string }
  | { type: "motion"; name: string }
  /** Panic button: stop talking now and stop replying until resumed. */
  | { type: "pause" }
  | { type: "resume" };
