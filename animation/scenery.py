"""Backgrounds and effects: night sky, city, rooftop, magic circle, particles."""
import math
import random

import cairo

from .util import (TAU, ease_out, ellipse, glow, hrand, lerp, mix, rgb, sparkle, span, stroke)

W, H = 1280, 720


class Sky:
    def __init__(self, seed=1):
        rng = random.Random(seed)
        self.stars = [(rng.uniform(-300, W + 300), rng.uniform(0, H * 0.72), rng.uniform(0.5, 2.4),
                       rng.uniform(0, TAU), rng.uniform(1.0, 3.5)) for _ in range(280)]

    def draw(self, ctx, t, pan=0.0):
        g = cairo.LinearGradient(0, 0, 0, H)
        for stop, c in ((0, '#060922'), (0.45, '#1b1650'), (0.75, '#46286c'), (1.0, '#a3587f')):
            g.add_color_stop_rgb(stop, *rgb(c))
        ctx.set_source(g)
        ctx.paint()
        for x, y, size, phase, speed in self.stars:
            a = 0.3 + 0.7 * (0.5 + 0.5 * math.sin(t * speed + phase))
            sx = x - pan * 0.08
            if size > 2.0:
                sparkle(ctx, sx, y, size * 3.2, rgb('#fff6e0'), a)
            else:
                ctx.arc(sx, y, size * 0.8, 0, TAU)
                ctx.set_source_rgba(1, 1, 1, a * 0.85)
                ctx.fill()


def moon(ctx, x, y, r):
    glow(ctx, x, y, r * 4, rgb('#ffdcb0'), 0.32)
    g = cairo.RadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    g.add_color_stop_rgb(0, *rgb('#fffaf0'))
    g.add_color_stop_rgb(1, *rgb('#ffe2b8'))
    ctx.arc(x, y, r, 0, TAU)
    ctx.set_source(g)
    ctx.fill()
    for dx, dy, cr in ((-0.3, -0.2, 0.18), (0.25, 0.1, 0.24), (-0.05, 0.4, 0.12), (0.35, -0.38, 0.1)):
        ellipse(ctx, x + dx * r, y + dy * r, cr * r, cr * r * 0.9)
        ctx.set_source_rgba(*rgb('#e8b98a'), 0.25)
        ctx.fill()


def shooting_star(ctx, t, start, end, p0, p1):
    p = span(t, start, end)
    if p <= 0 or p >= 1:
        return
    e = ease_out(p)
    hx, hy = lerp(p0[0], p1[0], e), lerp(p0[1], p1[1], e)
    tx, ty = lerp(p0[0], p1[0], max(0, e - 0.25)), lerp(p0[1], p1[1], max(0, e - 0.25))
    fade = math.sin(p * math.pi)
    g = cairo.LinearGradient(tx, ty, hx, hy)
    g.add_color_stop_rgba(0, 1, 1, 1, 0)
    g.add_color_stop_rgba(1, 1, 0.95, 0.85, fade)
    ctx.move_to(tx, ty)
    ctx.line_to(hx, hy)
    ctx.set_source(g)
    ctx.set_line_width(3)
    ctx.stroke()
    glow(ctx, hx, hy, 26, rgb('#fff1c9'), fade)


class City:
    """Three parallax layers of skyline with lit windows."""
    LAYERS = (('#2d2662', 0.25, 120, 300), ('#1d1843', 0.5, 80, 230), ('#110d29', 0.85, 50, 160))

    def __init__(self, seed=3):
        rng = random.Random(seed)
        self.layers = []
        for li, (_, _, hmin, hmax) in enumerate(self.LAYERS):
            x, blocks = -400, []
            while x < W + 400:
                bw = rng.uniform(50, 130)
                bh = rng.uniform(hmin, hmax)
                spire = rng.random() < 0.18
                blocks.append((x, bw, bh, spire, rng.randrange(1 << 30)))
                x += bw + rng.uniform(-6, 10)
            self.layers.append(blocks)

    def draw(self, ctx, t, pan=0.0, base_y=H):
        for li, ((color, parallax, _, _), blocks) in enumerate(zip(self.LAYERS, self.layers)):
            off = -pan * parallax
            col = rgb(color)
            for x, bw, bh, spire, seed in blocks:
                bx = x + off
                if bx > W + 20 or bx + bw < -20:
                    continue
                top = base_y - bh
                ctx.rectangle(bx, top, bw, H - top + 10)
                ctx.set_source_rgb(*col)
                ctx.fill()
                if spire:
                    ctx.move_to(bx + bw / 2, top - 40)
                    ctx.line_to(bx + bw / 2, top)
                    stroke(ctx, col, 3)
                    if math.sin(t * 3 + seed) > 0.2:
                        glow(ctx, bx + bw / 2, top - 40, 10, rgb('#ff4d6d'), 0.9)
                if li == 0:
                    continue
                cols = max(1, int(bw // 16))
                rows = int(bh // 22)
                for r in range(rows):
                    for c in range(cols):
                        h = hrand(seed, r, c)
                        if h > 0.33:
                            continue
                        flick = hrand(seed, r, c, int(t * 2)) < 0.02
                        if flick:
                            continue
                        wc = '#ffd98a' if h < 0.24 else ('#ff9ec9' if h < 0.29 else '#9fd8ff')
                        ctx.rectangle(bx + 6 + c * 16, top + 10 + r * 22, 7, 10)
                        ctx.set_source_rgba(*rgb(wc), 0.55 + li * 0.15)
                        ctx.fill()
            if li < 2:
                g = cairo.LinearGradient(0, base_y - 140, 0, base_y)
                g.add_color_stop_rgba(0, *rgb('#ff8fb1'), 0)
                g.add_color_stop_rgba(1, *rgb('#ff8fb1'), 0.12)
                ctx.rectangle(-10, base_y - 140, W + 20, 150)
                ctx.set_source(g)
                ctx.fill()


def rooftop(ctx, floor_y, pan=0.0):
    rail = rgb('#0d0a1f')
    for i in range(-2, 20):
        x = i * 92 - (pan % 92)
        ctx.rectangle(x, floor_y - 132, 9, 132)
        ctx.set_source_rgb(*rail)
        ctx.fill()
    for y, h in ((floor_y - 138, 11), (floor_y - 72, 6)):
        ctx.rectangle(-10, y, W + 20, h)
        ctx.set_source_rgb(*rail)
        ctx.fill()
    ctx.rectangle(-10, floor_y - 138, W + 20, 2)
    ctx.set_source_rgba(*rgb('#7b6bc4'), 0.7)
    ctx.fill()
    g = cairo.LinearGradient(0, floor_y, 0, H)
    g.add_color_stop_rgb(0, *rgb('#2a2050'))
    g.add_color_stop_rgb(1, *rgb('#120d26'))
    ctx.rectangle(-200, floor_y, W + 400, H - floor_y + 300)
    ctx.set_source(g)
    ctx.fill()
    ctx.rectangle(-10, floor_y, W + 20, 3)
    ctx.set_source_rgba(*rgb('#7b6bc4'), 0.5)
    ctx.fill()


def magic_circle(ctx, cx, cy, radius, t, alpha=1.0, color='#ff9ad5', accent='#ffe27a'):
    """Rotating sigil drawn flat, then squashed into perspective on the floor."""
    if radius <= 1 or alpha <= 0:
        return
    col, acc = rgb(color), rgb(accent)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, 0.3)
    ctx.set_operator(cairo.OPERATOR_ADD)
    glow(ctx, 0, 0, radius * 1.3, col, 0.5 * alpha, additive=False)
    k = radius / 240

    def ring(r, width, c, a=1.0):
        ctx.arc(0, 0, r * k, 0, TAU)
        stroke(ctx, c, width, a * alpha)

    for passes, a in ((9, 0.25), (3, 1.0)):
        ring(240, passes, col, a)
        ring(222, passes * 0.6, col, a)
        ring(118, passes * 0.6, acc, a)
        ctx.save()
        ctx.rotate(t * 0.6)
        for tri in range(2):
            for i in range(4):
                ang = tri * math.pi / 3 + i * TAU / 3 - math.pi / 2
                pt = (math.cos(ang) * 205 * k, math.sin(ang) * 205 * k)
                (ctx.move_to if i == 0 else ctx.line_to)(*pt)
            stroke(ctx, acc, passes * 0.5, a * alpha)
        for i in range(6):
            ang = i * TAU / 6 - math.pi / 2
            ctx.arc(math.cos(ang) * 205 * k, math.sin(ang) * 205 * k, 14 * k, 0, TAU)
            stroke(ctx, col, passes * 0.5, a * alpha)
        ctx.restore()
    # Rune band, counter-rotating.
    ctx.save()
    ctx.rotate(-t * 0.35)
    for i in range(36):
        ang = i * TAU / 36
        ctx.save()
        ctx.rotate(ang)
        ctx.translate(0, -231 * k)
        g = int(hrand(i, 11) * 4)
        s = 6 * k
        if g == 0:
            ctx.move_to(-s, s)
            ctx.line_to(0, -s)
            ctx.line_to(s, s)
        elif g == 1:
            ctx.arc(0, 0, s * 0.8, 0, TAU)
        elif g == 2:
            ctx.move_to(-s, -s)
            ctx.line_to(s, s)
            ctx.move_to(s, -s)
            ctx.line_to(-s, s)
        else:
            ctx.move_to(0, -s)
            ctx.line_to(0, s)
            ctx.move_to(-s, 0)
            ctx.line_to(s * 0.6, -s * 0.6)
        stroke(ctx, acc, 2.2, alpha)
        ctx.restore()
    ctx.restore()
    ctx.restore()


def light_pillar(ctx, cx, bottom, width, alpha):
    if alpha <= 0:
        return
    ctx.save()
    ctx.set_operator(cairo.OPERATOR_ADD)
    g = cairo.LinearGradient(cx - width / 2, 0, cx + width / 2, 0)
    g.add_color_stop_rgba(0, 1, 0.6, 0.85, 0)
    g.add_color_stop_rgba(0.5, 1, 0.9, 0.97, alpha)
    g.add_color_stop_rgba(1, 1, 0.6, 0.85, 0)
    ctx.rectangle(cx - width / 2, -50, width, bottom + 50)
    ctx.set_source(g)
    ctx.fill()
    ctx.restore()


class Particles:
    """Deterministic sparkles that rise (speed > 0) or fall (speed < 0) through a box."""

    def __init__(self, seed, n, box, speed=(40, 120), size=(4, 12),
                 colors=('#ffffff', '#ffe27a', '#ff9ad5', '#9fe6ff')):
        rng = random.Random(seed)
        self.box = box
        self.items = [(rng.uniform(box[0], box[2]), rng.uniform(0, 1), rng.uniform(*speed),
                       rng.uniform(*size), rng.uniform(0, TAU), rgb(rng.choice(colors)))
                      for _ in range(n)]

    def draw(self, ctx, t, alpha=1.0, additive=True):
        if alpha <= 0:
            return
        x0, y0, x1, y1 = self.box
        span_y = y1 - y0
        ctx.save()
        if additive:
            ctx.set_operator(cairo.OPERATOR_ADD)
        for x, phase, speed, size, wob, col in self.items:
            u = (phase + t * speed / span_y) % 1.0
            y = y1 - u * span_y if speed > 0 else y0 + u * span_y
            px = x + math.sin(t * 1.7 + wob) * 14
            life = math.sin(u * math.pi)
            tw = 0.6 + 0.4 * math.sin(t * 9 + wob)
            sparkle(ctx, px, y, size * tw, col, alpha * life)
        ctx.restore()


def speed_lines(ctx, cx, cy, frame, alpha, n=70):
    """Radial focus lines (集中線) that redraw every two frames."""
    if alpha <= 0:
        return
    key = frame // 2
    ctx.save()
    for i in range(n):
        a = hrand(key, i) * TAU
        inner = 260 + hrand(key, i, 1) * 200
        width = 0.006 + hrand(key, i, 2) * 0.012
        outer = 900
        ctx.move_to(cx + math.cos(a) * inner, cy + math.sin(a) * inner)
        ctx.line_to(cx + math.cos(a - width) * outer, cy + math.sin(a - width) * outer)
        ctx.line_to(cx + math.cos(a + width) * outer, cy + math.sin(a + width) * outer)
        ctx.close_path()
        ctx.set_source_rgba(1, 1, 1, alpha * (0.4 + 0.6 * hrand(key, i, 3)))
        ctx.fill()
    ctx.restore()


def shockwave(ctx, cx, cy, p, color='#ffffff'):
    if p <= 0 or p >= 1:
        return
    r = ease_out(p) * 700
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, 0.55)
    ctx.arc(0, 0, r, 0, TAU)
    stroke(ctx, rgb(color), 30 * (1 - p), 1 - p)
    ctx.restore()


def vignette(ctx, strength=0.55):
    g = cairo.RadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95)
    g.add_color_stop_rgba(0, 0, 0, 0, 0)
    g.add_color_stop_rgba(1, *rgb('#05030f'), strength)
    ctx.set_source(g)
    ctx.paint()


def color_wash(ctx, color, alpha):
    if alpha > 0:
        ctx.set_source_rgba(*rgb(color), min(1.0, alpha))
        ctx.paint()


def tint(c1, c2, t):
    return mix(rgb(c1), rgb(c2), t)
