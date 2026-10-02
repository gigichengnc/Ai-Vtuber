// Turns a script into an MP4: makes the voice clips, has a hidden browser draw
// every frame (web/src/render.ts), mixes voice + sound effects, and encodes.
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { type Episode, FRAME_SIZE, type Timeline } from "../shared/episode.ts";
import { rootPath } from "../server/config.ts";
import { createTTS } from "../server/tts/index.ts";
import { createWebServer, serveFromDir } from "../server/web.ts";
import { runFfmpeg } from "./ffmpeg.ts";
import { makeSfx, SFX_NAMES, type SfxName } from "./sfx.ts";

export interface RenderResult {
  video: string;
  subtitles: string;
  seconds: number;
}

type Log = (line: string) => void;

export async function renderEpisode(episode: Episode, outDir: string, log: Log): Promise<RenderResult> {
  const clipsDir = join(outDir, "clips");
  await mkdir(clipsDir, { recursive: true });

  // 1. Voice for every spoken line.
  const tts = createTTS();
  const clipFiles: (string | null)[] = [];
  const spoken = episode.beats.filter((b) => b.say).length;
  let done = 0;
  for (const [i, beat] of episode.beats.entries()) {
    if (!beat.say) {
      clipFiles.push(null);
      continue;
    }
    log(`Voice ${++done}/${spoken}: ${beat.say}`);
    const clip = await tts.synthesize(beat.say, { emotion: beat.emotion, speaker: beat.speaker });
    const name = `${String(i).padStart(3, "0")}.${clip.mime === "audio/mpeg" ? "mp3" : "wav"}`;
    await writeFile(join(clipsDir, name), clip.data);
    clipFiles.push(name);
  }

  // 2. A private web server for the render page, and a hidden browser.
  const server = await createWebServer({
    handle(path, _req, res) {
      if (!path.startsWith("/clips/")) return false;
      serveFromDir(res, clipsDir, path.slice("/clips".length));
      return true;
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: FRAME_SIZE[episode.aspect], deviceScaleFactor: 1 });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/render.html`);
    await page.waitForFunction(() => "studio" in window, null, { timeout: 30_000 });
    const urls = clipFiles.map((f) => (f ? `/clips/${f}` : null));
    let timeline: Timeline;
    try {
      timeline = await page.evaluate(([ep, clipUrls]) => (window as any).studio.load(ep, clipUrls), [episode, urls] as const);
    } catch (error) {
      throw new Error(`The render page couldn't load the model or audio: ${String(error)} ${pageErrors.join(" ")}`);
    }
    const seconds = timeline.frames / timeline.fps;

    // 3. Soundtrack: voices and sound effects placed on the timeline.
    const audioFile = join(outDir, "audio.wav");
    await mixAudio(episode, timeline, clipFiles, clipsDir, audioFile, seconds);

    // 4. Frames -> H.264 video with the soundtrack.
    const video = join(outDir, "video.mp4");
    const started = Date.now();
    log(`Rendering ${timeline.frames} frames (${seconds.toFixed(1)} s of video)...`);
    await runFfmpeg(
      [
        ...["-f", "image2pipe", "-framerate", String(timeline.fps), "-c:v", "mjpeg", "-i", "-"],
        ...["-i", audioFile, "-map", "0:v", "-map", "1:a"],
        ...["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(timeline.fps)],
        ...["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", video],
      ],
      async (stdin) => {
        for (let i = 0; i < timeline.frames; i++) {
          const dataUrl: string = await page.evaluate((n) => (window as any).studio.frame(n), i);
          const jpeg = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
          if (!stdin.write(jpeg)) await once(stdin, "drain");
          if (i % (timeline.fps * 5) === 0 && i > 0) {
            const rate = i / ((Date.now() - started) / 1000);
            log(`  ${Math.round((i / timeline.frames) * 100)}%  (${rate.toFixed(1)} frames/s)`);
          }
        }
      },
    );
    if (pageErrors.length) log(`Warnings from the render page: ${pageErrors.join(" | ")}`);

    const subtitles = join(outDir, "subtitles.srt");
    await writeFile(subtitles, toSrt(episode, timeline));
    return { video, subtitles, seconds };
  } finally {
    await browser.close();
    server.close();
  }
}

async function launchBrowser(): Promise<Browser> {
  // Software WebGL is slow but works on machines (or servers) without a GPU.
  const args =
    process.env.RENDER_SOFTWARE_GL === "1"
      ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
  const executablePath = process.env.BROWSER_PATH?.trim();
  // Playwright's own Chromium, else Edge (always on Windows), else Chrome.
  const attempts = executablePath ? [{ executablePath }] : [{}, { channel: "msedge" }, { channel: "chrome" }];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ ...attempt, args });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Couldn't start a browser to render with. Run "npx playwright install chromium", or set BROWSER_PATH in .env. (${String(lastError).split("\n")[0]})`,
  );
}

async function mixAudio(
  episode: Episode,
  timeline: Timeline,
  clipFiles: (string | null)[],
  clipsDir: string,
  out: string,
  seconds: number,
): Promise<void> {
  const inputs: { file: string; at: number; volume: number }[] = [];
  episode.beats.forEach((beat, i) => {
    const start = timeline.beats[i]!.start;
    const clip = clipFiles[i];
    if (clip) inputs.push({ file: join(clipsDir, clip), at: start, volume: 1 });
  });
  for (const name of new Set(episode.beats.map((b) => b.sfx).filter((s): s is SfxName => SFX_NAMES.includes(s as SfxName)))) {
    await writeFile(join(clipsDir, `sfx-${name}.wav`), makeSfx(name));
  }
  episode.beats.forEach((beat, i) => {
    if (beat.sfx && SFX_NAMES.includes(beat.sfx as SfxName)) {
      inputs.push({ file: join(clipsDir, `sfx-${beat.sfx}.wav`), at: timeline.beats[i]!.start, volume: 0.8 });
    }
  });

  const args: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];
  inputs.forEach((input, k) => {
    args.push("-i", input.file);
    const ms = Math.round(input.at * 1000);
    filters.push(`[${k}:a]aresample=48000,volume=${input.volume},adelay=delays=${ms}:all=1[a${k}]`);
    labels.push(`[a${k}]`);
  });

  // Optional background music from assets/music/, quietly looped under everything.
  const musicFile = episode.music ? fileURLToPath(rootPath(`assets/music/${episode.music.replace(/^.*[\\/]/, "")}`)) : null;
  if (musicFile && existsSync(musicFile)) {
    const k = inputs.length;
    args.push("-stream_loop", "-1", "-i", musicFile);
    filters.push(`[${k}:a]aresample=48000,volume=0.12[a${k}]`);
    labels.push(`[a${k}]`);
  }

  if (labels.length === 0) {
    await runFfmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", seconds.toFixed(3), out]);
    return;
  }
  filters.push(
    `${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad,atrim=0:${seconds.toFixed(3)},alimiter=limit=0.95[out]`,
  );
  await runFfmpeg([...args, "-filter_complex", filters.join(";"), "-map", "[out]", "-ac", "2", "-ar", "48000", out]);
}

function toSrt(episode: Episode, timeline: Timeline): string {
  const stamp = (s: number) => {
    const ms = Math.round(s * 1000);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  const entries: string[] = [];
  episode.beats.forEach((beat, i) => {
    if (!beat.say) return;
    const t = timeline.beats[i]!;
    entries.push(`${entries.length + 1}\n${stamp(t.start)} --> ${stamp(Math.max(t.speechEnd, t.start + 0.5))}\n${beat.say}\n`);
  });
  return entries.join("\n");
}
