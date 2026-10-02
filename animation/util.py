"""Small math, colour and drawing helpers shared by every module."""
import math

import cairo

TAU = math.tau


def clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def lerp(a, b, t):
    return a + (b - a) * t


def lerp2(p, q, t):
    return (lerp(p[0], q[0], t), lerp(p[1], q[1], t))


def smooth(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in(t):
    t = clamp(t)
    return t ** 3


def span(t, start, end):
    """Progress (0..1) of t through the window [start, end]."""
    if end <= start:
        return 1.0 if t >= start else 0.0
    return clamp((t - start) / (end - start))


def on_twos(t, fps=12):
    """Quantise time to 12 drawings per second, like hand-drawn anime 'on twos'."""
    return math.floor(t * fps + 1e-6) / fps


def hrand(*keys):
    """Deterministic pseudo-random float in [0, 1) from integer keys."""
    h = 2166136261
    for k in keys:
        h = ((h ^ (int(k) & 0xFFFFFFFF)) * 16777619) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0x5BD1E995) & 0xFFFFFFFF
    h ^= h >> 15
    return h / 2 ** 32


def rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mix(c1, c2, t):
    return tuple(lerp(a, b, t) for a, b in zip(c1, c2))


def darker(c, k=0.6):
    return tuple(v * k for v in c)


# --------------------------------------------------------------------------- paths

def ellipse(ctx, x, y, rx, ry):
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(rx, ry)
    ctx.arc(0, 0, 1, 0, TAU)
    ctx.restore()


def rounded_rect(ctx, x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    ctx.close_path()


def polyline(ctx, pts):
    ctx.move_to(*pts[0])
    for p in pts[1:]:
        ctx.line_to(*p)


def bezier(p0, p1, p2, p3, s):
    u = 1 - s
    a, b, c, d = u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


def normals(pts):
    out = []
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[max(i - 1, 0)]
        x1, y1 = pts[min(i + 1, n - 1)]
        tx, ty = x1 - x0, y1 - y0
        length = math.hypot(tx, ty) or 1.0
        out.append((-ty / length, tx / length))
    return out


def offset_pts(pts, widths, k, i0=0, i1=None):
    """Points shifted sideways by k * local width (k=0 is the centre line)."""
    nrm = normals(pts)
    i1 = len(pts) if i1 is None else i1
    return [(pts[i][0] + nrm[i][0] * widths[i] * k, pts[i][1] + nrm[i][1] * widths[i] * k)
            for i in range(i0, i1)]


def strand_path(ctx, pts, widths, i0=0, i1=None):
    """A tapered ribbon around a centre line: hair locks, tails, light trails."""
    i1 = len(pts) if i1 is None else i1
    left = offset_pts(pts, widths, 1, i0, i1)
    right = offset_pts(pts, widths, -1, i0, i1)
    polyline(ctx, left + right[::-1])
    ctx.close_path()


# ------------------------------------------------------------------------- painting

def paint(ctx, fill, line=None, width=3.5, alpha=1.0):
    """Fill the current path, then optionally ink its outline (anime cel style)."""
    if fill is not None:
        ctx.set_source_rgba(*fill, alpha)
        if line is None:
            ctx.fill()
            return
        ctx.fill_preserve()
    if line is not None:
        ctx.set_source_rgba(*line, alpha)
        ctx.set_line_width(width)
        ctx.stroke()


def stroke(ctx, color, width, alpha=1.0):
    ctx.set_source_rgba(*color, alpha)
    ctx.set_line_width(width)
    ctx.stroke()


def sparkle(ctx, x, y, r, color, alpha=1.0, k=0.14):
    """Four-pointed twinkle star."""
    ctx.move_to(x, y - r)
    ctx.curve_to(x + r * k, y - r * k, x + r * k, y - r * k, x + r, y)
    ctx.curve_to(x + r * k, y + r * k, x + r * k, y + r * k, x, y + r)
    ctx.curve_to(x - r * k, y + r * k, x - r * k, y + r * k, x - r, y)
    ctx.curve_to(x - r * k, y - r * k, x - r * k, y - r * k, x, y - r)
    ctx.close_path()
    ctx.set_source_rgba(*color, alpha)
    ctx.fill()


def glow(ctx, x, y, r, color, alpha=1.0, additive=True):
    """Soft radial light; additive blending makes overlapping glows bloom."""
    if r <= 0 or alpha <= 0:
        return
    ctx.save()
    if additive:
        ctx.set_operator(cairo.OPERATOR_ADD)
    g = cairo.RadialGradient(x, y, 0, x, y, r)
    g.add_color_stop_rgba(0, *color, alpha)
    g.add_color_stop_rgba(0.35, *color, alpha * 0.4)
    g.add_color_stop_rgba(1, *color, 0)
    ctx.set_source(g)
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
    ctx.restore()


def bow(ctx, x, y, size, color, line, angle=0.0):
    """Ribbon bow: two loops, two tails and a knot."""
    s = size
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    for d in (-1, 1):
        ctx.move_to(d * 0.2 * s, 0.35 * s)
        ctx.line_to(d * 0.55 * s, 1.15 * s)
        ctx.line_to(d * 0.4 * s, 1.0 * s)
        ctx.line_to(d * 0.25 * s, 1.2 * s)
        ctx.line_to(d * 0.02 * s, 0.4 * s)
        ctx.close_path()
        paint(ctx, darker(color, 0.85), line, 2.5)
    for d in (-1, 1):
        ctx.move_to(0, 0)
        ctx.curve_to(d * 0.5 * s, -0.75 * s, d * 1.25 * s, -0.55 * s, d * 1.1 * s, 0.05 * s)
        ctx.curve_to(d * 1.0 * s, 0.55 * s, d * 0.45 * s, 0.4 * s, 0, 0)
        ctx.close_path()
        paint(ctx, color, line, 2.5)
        ctx.move_to(d * 0.25 * s, -0.08 * s)
        ctx.curve_to(d * 0.55 * s, -0.3 * s, d * 0.8 * s, -0.2 * s, d * 0.85 * s, 0)
        stroke(ctx, darker(color, 0.7), 2)
    ellipse(ctx, 0, 0, 0.26 * s, 0.3 * s)
    paint(ctx, color, line, 2.5)
    ctx.restore()
