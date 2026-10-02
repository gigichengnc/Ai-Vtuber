"""Render a storyboard YAML file to an MP4 (or to PNG stills).

    python -m animation.render episodes/ep00_demo.yaml
    python -m animation.render episodes/ep00_demo.yaml --scale 1.5          # 1080p
    python -m animation.render episodes/ep00_demo.yaml --stills 2,7.5,21    # PNG frames
"""
import argparse
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import cairo
import yaml

from .audio import render_audio
from .scenery import H, W
from .shots import SCENES, ShotState
from .text import draw_runs
from .util import rgb, smooth, span


def load_timeline(story):
    timeline, start = [], 0.0
    for i, shot in enumerate(story['shots']):
        if shot['scene'] not in SCENES:
            raise SystemExit(f"shot {i + 1}: unknown scene '{shot['scene']}'. "
                             f"Available: {', '.join(SCENES)}")
        shot = dict(shot, start=start, end=start + float(shot['duration']))
        for ln in shot.get('dialogue', []):
            ln.setdefault('end', ln['at'] + 2.5)
        timeline.append(shot)
        start = shot['end']
    return timeline, start


def draw_subtitles(ctx, shot, lt, story):
    chars = story.get('characters', {})
    for ln in shot.get('dialogue', []):
        if not ln['at'] <= lt < ln['end']:
            continue
        a = smooth(span(lt, ln['at'], ln['at'] + 0.12)) * (1 - smooth(span(lt, ln['end'] - 0.12, ln['end'])))
        who = chars.get(ln['who'], {})
        name = who.get('name', ln['who'])
        color = rgb(who.get('color', '#ffffff'))
        draw_runs(ctx, [(f'{name}：', color), (ln['zh'], rgb('#ffffff'))], W / 2, H - 70, 34,
                  outline=rgb('#1a1026'), outline_w=7, alpha=a)
        if ln.get('en'):
            draw_runs(ctx, [(ln['en'], rgb('#f3eaff'))], W / 2, H - 32, 22,
                      outline=rgb('#1a1026'), outline_w=5, alpha=a)


def draw_frame(ctx, t, frame, timeline, story, fps):
    shot = next((s for s in timeline if s['start'] <= t < s['end']), timeline[-1])
    lt = t - shot['start']
    ctx.set_source_rgb(0, 0, 0)
    ctx.paint()
    ctx.save()
    SCENES[shot['scene']](ctx, ShotState(lt, shot['duration'], frame, shot.get('dialogue', []), fps), story)
    ctx.restore()

    black = 0.0
    if shot.get('fade_in'):
        black = max(black, 1 - span(lt, 0, shot['fade_in']))
    if shot.get('fade_out'):
        black = max(black, span(lt, shot['duration'] - shot['fade_out'], shot['duration']))
    draw_subtitles(ctx, shot, lt, story)
    if black > 0:
        ctx.set_source_rgba(0, 0, 0, black)
        ctx.paint()
    if story.get('watermark'):
        draw_runs(ctx, [(story['watermark'], rgb('#ffffff'))], W - 20, 34, 16, alpha=0.45, align='right')


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('story', type=Path)
    ap.add_argument('-o', '--out', type=Path)
    ap.add_argument('--scale', type=float, default=1.0, help='1.0 = 1280x720, 1.5 = 1920x1080')
    ap.add_argument('--stills', help='comma-separated times (seconds) to save as PNG instead of video')
    ap.add_argument('--no-audio', action='store_true')
    ap.add_argument('--crf', type=int, default=18)
    args = ap.parse_args(argv)

    story = yaml.safe_load(args.story.read_text(encoding='utf-8'))
    timeline, total = load_timeline(story)
    fps = int(story.get('fps', 24))
    out = args.out or Path('output') / f'{args.story.stem}.mp4'
    out.parent.mkdir(parents=True, exist_ok=True)

    width, height = int(W * args.scale) // 2 * 2, int(H * args.scale) // 2 * 2
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, width, height)
    ctx = cairo.Context(surface)
    ctx.scale(width / W, height / H)

    if args.stills:
        for ts in args.stills.split(','):
            t = float(ts)
            draw_frame(ctx, t, int(t * fps), timeline, story, fps)
            png = out.with_name(f'{out.stem}_{t:05.2f}s.png')
            surface.write_to_png(str(png))
            print(png)
        return

    with tempfile.TemporaryDirectory() as tmp:
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra',
               '-s', f'{width}x{height}', '-r', str(fps), '-i', '-']
        if not args.no_audio:
            wav = Path(tmp) / 'audio.wav'
            render_audio(timeline, story, total, wav)
            cmd += ['-i', str(wav), '-c:a', 'aac', '-b:a', '192k', '-shortest']
        cmd += ['-c:v', 'libx264', '-preset', 'medium', '-crf', str(args.crf),
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out)]
        ffmpeg = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        frames = int(round(total * fps))
        started = time.time()
        for frame in range(frames):
            draw_frame(ctx, frame / fps, frame, timeline, story, fps)
            surface.flush()
            ffmpeg.stdin.write(bytes(surface.get_data()))
            if frame % fps == 0:
                print(f'\rframe {frame}/{frames}', end='', file=sys.stderr, flush=True)
        ffmpeg.stdin.close()
        if ffmpeg.wait() != 0:
            raise SystemExit('ffmpeg failed')
    print(f'\rrendered {frames} frames in {time.time() - started:.1f}s -> {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
