"""Shot templates. The storyboard picks a template by name and supplies timing + dialogue.

Every scene function receives the cairo context, a ShotState (local clock and
dialogue lookups) and the whole storyboard dict.
"""
import math

import cairo

from .character import FoxSpirit, Girl, Pose, auto_blink
from .scenery import (City, Particles, Sky, color_wash, light_pillar, magic_circle, moon, rooftop,
                      shockwave, shooting_star, speed_lines, vignette)
from .text import draw_text
from .util import (ease_in, ease_out, glow, hrand, lerp, on_twos, rgb, smooth, span, sparkle)

W, H = 1280, 720
VOICE_RATE = 9.0  # syllables per second of lip flap
PUNCT = set('，。！？、…—―·~～,.!?- "“”‘’「」『』（）()')

SKY = Sky(seed=7)
CITY = City(seed=5)
GIRL = Girl()
FOX = FoxSpirit()
FIREFLIES = Particles(11, 40, (0, 200, W, 640), speed=(12, 30), size=(3, 7),
                      colors=('#ffe9a8', '#ffd0f0', '#bff0ff'))
RISING = Particles(21, 90, (380, -40, 900, 700), speed=(160, 380), size=(5, 15))
FALLING = Particles(31, 70, (180, -40, 1100, 720), speed=(-90, -40), size=(5, 13))


class ShotState:
    def __init__(self, t, duration, frame, lines, fps):
        self.t, self.duration, self.frame, self.lines, self.fps = t, duration, frame, lines, fps

    def line(self, who):
        for ln in self.lines:
            if ln['who'] == who and ln['at'] <= self.t < ln['end']:
                return ln
        return None

    def face(self, who, default='neutral'):
        """Expression of the character's most recent line (expressions persist)."""
        latest = None
        for ln in self.lines:
            if ln['who'] == who and ln['at'] <= self.t and 'face' in ln:
                if latest is None or ln['at'] > latest['at']:
                    latest = ln
        return (latest['face'], self.t - latest['at']) if latest else (default, self.t)

    def mouth(self, who):
        ln = self.line(who)
        if ln is None:
            return 0.0
        voiced = sum(ch not in PUNCT for ch in ln['zh']) / VOICE_RATE
        if self.t - ln['at'] > voiced:
            return 0.0
        return (0.0, 0.55, 1.0, 0.35)[int(hrand(self.frame // 2, 3) * 4)]


def camera(ctx, zoom, cx, cy, shake=0.0, frame=0):
    key = frame // 2
    ctx.translate(W / 2 + (hrand(key, 1) - 0.5) * shake, H / 2 + (hrand(key, 2) - 0.5) * shake)
    ctx.scale(zoom, zoom)
    ctx.translate(-cx, -cy)


def girl_pose(s, **kw):
    ct = on_twos(s.t)
    face, _ = s.face('yue')
    base = dict(t=ct, blink=auto_blink(ct), mouth=s.mouth('yue'), face=face)
    base.update(kw)
    return Pose(**base)


# ------------------------------------------------------------------- scenes

def city_establish(ctx, s, story):
    t = s.t
    p = t / s.duration
    pan = lerp(0, 140, smooth(p))
    ctx.save()
    camera(ctx, lerp(1.0, 1.05, p), 640, 360)
    SKY.draw(ctx, t, pan)
    moon(ctx, 930 - pan * 0.15, 170, 78)
    shooting_star(ctx, t, 1.6, 2.5, (260, 60), (700, 250))
    CITY.draw(ctx, t, pan, base_y=H)
    ctx.restore()
    vignette(ctx, 0.5)

    a = smooth(span(t, 0.7, 1.4)) * (1 - smooth(span(t, s.duration - 0.9, s.duration - 0.2)))
    title = story.get('title', {})
    draw_text(ctx, title.get('zh', ''), 640, 340 - 10 * (1 - a), 88, rgb('#fff6fb'),
              outline=rgb('#3b1d4f'), outline_w=10, alpha=a, glow=rgb('#ff8fd0'), spacing=10)
    draw_text(ctx, title.get('en', ''), 640, 400, 24, rgb('#ffe7a3'),
              outline=rgb('#2a1438'), outline_w=5, alpha=a, spacing=6)


def rooftop_girl(ctx, s, story):
    t = s.t
    p = smooth(t / s.duration)
    ctx.save()
    camera(ctx, lerp(1.0, 1.12, p), 640, lerp(360, 322, p))
    SKY.draw(ctx, t, 300)
    moon(ctx, 330, 150, 70)
    CITY.draw(ctx, t, 300, base_y=590)
    rooftop(ctx, 600)
    FIREFLIES.draw(ctx, t, 0.8)
    GIRL.draw(ctx, 640, 700, 0.98, girl_pose(s, look=(-0.5, -0.6), tilt=-0.04, wind=0.12))
    ctx.restore()
    vignette(ctx, 0.5)


def _fox_flight(t, arrive_start=0.2, arrive_end=1.8, home=(880, 330)):
    a = ease_out(span(t, arrive_start, arrive_end))
    x = lerp(1420, home[0], a)
    y = lerp(-90, home[1], a) - math.sin(a * math.pi) * 120
    return x, y


def spirit_arrives(ctx, s, story):
    t = s.t
    face, age = s.face('yue')
    shake = 12 * (1 - span(age, 0, 0.4)) if face == 'surprised' else 0
    ctx.save()
    camera(ctx, 1.02, 640, 360, shake, s.frame)
    SKY.draw(ctx, t, 620)
    moon(ctx, 1010, 120, 60)
    CITY.draw(ctx, t, 620, base_y=590)
    rooftop(ctx, 600, 40)
    FIREFLIES.draw(ctx, t, 0.6)

    if t < 1.9:
        for k in range(1, 16):
            tk = t - k * 0.045
            if tk > 0.2:
                px, py = _fox_flight(tk)
                sparkle(ctx, px + hrand(k, 1) * 20 - 10, py + hrand(k, 2) * 20 - 10,
                        10 * (1 - k / 16), rgb('#bff0ff'), 1 - k / 16)
    q = span(t, 1.8, 2.5)
    if 0 < q < 1:
        glow(ctx, 880, 330, 60 + 220 * q, rgb('#bff0ff'), 0.9 * (1 - q))
    fx, fy = _fox_flight(t)
    fox_face, _ = s.face('kitsu', 'happy')
    FOX.draw(ctx, fx, fy, 1.0, t, mouth=s.mouth('kitsu'), mood=fox_face)

    look = (0.8, -0.45) if t > 1.2 else (-0.3, -0.6)
    chest = smooth(span(age, 0, 0.25)) if face == 'surprised' else 0.0
    GIRL.draw(ctx, 430, 700, 0.95, girl_pose(s, look=look, arms_chest=chest, wind=0.12))
    ctx.restore()
    vignette(ctx, 0.5)


def transformation(ctx, s, story):
    t = s.t
    merge, flash, reveal = 1.6, 3.6, 4.0
    charge = smooth(span(t, merge, merge + 0.4)) * (1 - span(t, reveal, reveal + 0.1))
    after = smooth(span(t, reveal, reveal + 1.0))

    if t >= reveal:
        possessed = 1.0
    elif t > 2.4:
        possessed = 1.0 if hrand(s.frame // 2, 5) < span(t, 2.4, flash) * 0.85 else 0.0
    else:
        possessed = 0.0

    zoom = lerp(1.0, 1.14, smooth(span(t, merge, flash))) if t < reveal else lerp(1.1, 1.0, after)
    ctx.save()
    camera(ctx, zoom, 640, 380, 7 * charge, s.frame)
    SKY.draw(ctx, t, 900)
    CITY.draw(ctx, t, 900, base_y=590)
    rooftop(ctx, 600, 80)
    color_wash(ctx, '#1a0830', 0.35 + 0.25 * charge)

    circle_r = ease_out(span(t, 0.0, 1.2)) * 250
    circle_a = 1 - smooth(span(t, reveal + 0.8, reveal + 2.5))
    magic_circle(ctx, 640, 662, circle_r, t, circle_a)
    light_pillar(ctx, 640, 662, 420, 0.5 * charge)
    glow(ctx, 640, 420, 360, rgb('#ff8fd0'), 0.45 * charge + 0.25 * possessed * (1 - after))
    RISING.draw(ctx, t, span(t, 0.3, 1.0) * (1 - span(t, reveal + 1.0, reveal + 2.5)))

    ang = t * 5.5
    rad = lerp(270, 0, ease_in(span(t, 0.3, merge)))
    fx, fy = 640 + math.cos(ang) * rad, 400 + math.sin(ang) * rad * 0.35
    fox_alpha = 1 - span(t, merge - 0.25, merge)
    fox_scale = lerp(0.85, 0.35, span(t, 0.6, merge))
    fox_behind = math.sin(ang) < 0
    if fox_alpha > 0 and fox_behind:
        FOX.draw(ctx, fx, fy, fox_scale, t, mood='serious', alpha=fox_alpha)

    if t < reveal:
        pose = girl_pose(s, face='determined', look=(0, -0.2), possessed=possessed,
                         wind=charge, arms_up=smooth(span(t, merge + 0.2, merge + 0.8)),
                         eye_glow=charge)
    else:
        pose = girl_pose(s, look=(0.1, 0), possessed=1.0, wind=lerp(1, 0.15, after),
                         arms_up=lerp(1, 0.25, smooth(span(t, reveal, reveal + 0.6))),
                         eye_glow=0.4, wink=1.0)
    GIRL.draw(ctx, 640, 662, 0.9, pose)

    if fox_alpha > 0 and not fox_behind:
        FOX.draw(ctx, fx, fy, fox_scale, t, mood='serious', alpha=fox_alpha)
    burst = span(t, merge, merge + 0.6)
    if 0 < burst < 1:
        glow(ctx, 640, 440, 80 + 420 * burst, rgb('#ffffff'), 1 - burst)
    shockwave(ctx, 640, 440, span(t, merge, merge + 0.8))
    FALLING.draw(ctx, t, after * (1 - span(t, s.duration - 1.5, s.duration)))
    ctx.restore()

    speed_lines(ctx, 640, 400, s.frame, 0.55 * charge * (1 - span(t, flash - 0.1, flash + 0.1)))
    vignette(ctx, 0.45)
    white = span(t, flash, flash + 0.3) * (1 - span(t, reveal + 0.05, reveal + 0.6))
    color_wash(ctx, '#fff8fd', white)

    end = story.get('end_card', {})
    a = smooth(span(t, s.duration - 2.0, s.duration - 1.4))
    if a > 0:
        g = cairo.LinearGradient(0, H - 260, 0, H)
        g.add_color_stop_rgba(0, 0, 0, 0, 0)
        g.add_color_stop_rgba(1, 0.03, 0.01, 0.08, 0.75 * a)
        ctx.rectangle(0, H - 260, W, 260)
        ctx.set_source(g)
        ctx.fill()
        draw_text(ctx, end.get('zh', ''), 640, 610, 52, rgb('#fff6fb'), outline=rgb('#3b1d4f'),
                  outline_w=8, alpha=a, glow=rgb('#ff8fd0'), spacing=6)
        draw_text(ctx, end.get('en', ''), 640, 660, 24, rgb('#ffe7a3'), outline=rgb('#2a1438'),
                  outline_w=5, alpha=a, spacing=4)


SCENES = {
    'city_establish': city_establish,
    'rooftop_girl': rooftop_girl,
    'spirit_arrives': spirit_arrives,
    'transformation': transformation,
}
