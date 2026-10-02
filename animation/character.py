"""Puppet-style 2D characters drawn with vector paths.

Each character is a stack of layers (back hair, body, face, bangs, ...) whose
shapes are driven by a Pose. Animating a character means changing the pose
over time; the renderer never stores bitmaps.
"""
import math
from dataclasses import dataclass

import cairo

from .util import (TAU, bezier, bow, clamp, darker, ellipse, glow, hrand, lerp, lerp2, mix,
                   offset_pts, paint, polyline, rgb, rounded_rect, smooth, span, sparkle,
                   strand_path, stroke)

SCHOOL = dict(
    skin='#ffe9dc', skin_shade='#f3bfb1', blush='#ff8fa3', mouth='#8a2f45', tongue='#ff8a9a',
    hair='#34407a', hair_shade='#222a57', hair_light='#7d8fd6',
    iris_top='#1c2766', iris_bot='#78b2ff', eye_glow='#9fd0ff',
    top='#f8f8ff', top_shade='#d5d8ec', collar='#2f3f74', trim='#ffffff',
    skirt='#2f3f74', skirt_shade='#212d57', frill='#ffffff', bow='#e8475f', gem='#e8475f',
    sock='#f4f4fa', shoe='#4a3436', ribbon='#e8475f', clip='#ffd75e',
    line='#3b2440',
)

POSSESSED = dict(
    skin='#fff0e8', skin_shade='#f4c6bd', blush='#ff8fb8', mouth='#8a2f45', tongue='#ff8a9a',
    hair='#f8e2f2', hair_shade='#d9a7d8', hair_light='#ffffff',
    iris_top='#9c1f5a', iris_bot='#ffd25e', eye_glow='#ffd25e',
    top='#ffffff', top_shade='#ead6f2', collar='#ff8cc6', trim='#ffd76a',
    skirt='#ff7ab8', skirt_shade='#dd5597', frill='#ffffff', bow='#ffcf4a', gem='#7ef0ff',
    sock='#ffffff', shoe='#ff8cc6', ribbon='#ffcf4a', clip='#ffd76a',
    line='#5a2a55',
)


def palette(possessed):
    return {k: mix(rgb(SCHOOL[k]), rgb(POSSESSED[k]), clamp(possessed)) for k in SCHOOL}


def auto_blink(t, period=3.3, seed=0):
    """Blink at a slightly random moment in every period; returns 0 (open) .. 1 (shut)."""
    k = math.floor(t / period)
    start = k * period + 0.4 + hrand(k, seed) * (period - 0.8)
    d = t - start
    if 0 <= d < 0.25:
        return 1.0 - abs(d / 0.125 - 1.0)
    return 0.0


@dataclass
class Pose:
    t: float = 0.0            # animation clock (already quantised on twos)
    blink: float = 0.0        # 0 = open, 1 = shut
    mouth: float = 0.0        # 0 = closed, 1 = wide open
    face: str = 'neutral'     # neutral | surprised | happy | determined
    look: tuple = (0.0, 0.0)  # pupil direction, each -1..1
    tilt: float = 0.0         # head tilt in radians
    arms_up: float = 0.0
    arms_chest: float = 0.0
    wind: float = 0.0         # 0 = idle sway, 1 = strong updraft
    possessed: float = 0.0    # 0 = schoolgirl, 1 = fox-possessed magical girl
    eye_glow: float = 0.0
    wink: float = 0.0         # closes the right eye in a happy arc


# Bangs: alternating valley / tip points along the fringe, right to left.
FRINGE = [(112, -452), (96, -404), (76, -462), (52, -414), (30, -466), (8, -418),
          (-16, -468), (-40, -412), (-62, -462), (-86, -406), (-106, -452)]


def bangs_path(ctx, dy=0.0):
    ctx.move_to(-134, -398 + dy)
    ctx.curve_to(-152, -505 + dy, -92, -568 + dy, 0, -568 + dy)
    ctx.curve_to(92, -568 + dy, 152, -505 + dy, 134, -398 + dy)
    ctx.curve_to(126, -420 + dy, 118, -440 + dy, FRINGE[0][0], FRINGE[0][1] + dy)
    for i in range(1, len(FRINGE)):
        (ax, ay), (bx, by) = FRINGE[i - 1], FRINGE[i]
        if i % 2:  # valley -> tip
            ctx.curve_to(ax - 2, ay + 20 + dy, bx + 4, by - 18 + dy, bx, by + dy)
        else:      # tip -> valley
            ctx.curve_to(ax - 3, ay - 20 + dy, bx + 3, by + 22 + dy, bx, by + dy)
    ctx.curve_to(-110, -436 + dy, -122, -414 + dy, -134, -398 + dy)
    ctx.close_path()


def face_path(ctx):
    ctx.move_to(-102, -440)
    ctx.curve_to(-104, -380, -80, -332, 0, -316)
    ctx.curve_to(80, -332, 104, -380, 102, -440)
    ctx.curve_to(100, -520, -100, -520, -102, -440)
    ctx.close_path()


class Girl:
    """Chibi magical girl. Local origin is between her feet; she is ~570 units tall."""

    def draw(self, ctx, x, y, scale, pose):
        P = palette(pose.possessed)
        t = pose.t
        breathe = math.sin(t * TAU / 3.2)
        sway = math.sin(t * TAU / 2.8)
        fox = smooth(span(pose.possessed, 0.5, 1.0))
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(scale, scale)
        ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)

        if fox > 0:
            self._fox_tail(ctx, P, t, pose, fox)

        self._head_space(ctx, pose, breathe)
        self._twin_tails(ctx, P, t, pose)
        self._back_hair(ctx, pose, P, sway)
        ctx.restore()

        self._legs(ctx, P, pose)
        ctx.save()
        ctx.translate(0, breathe * 1.5)
        self._skirt(ctx, P, t, pose)
        self._torso(ctx, P, pose)
        self._arms(ctx, P, t, pose)
        ctx.restore()

        self._head_space(ctx, pose, breathe)
        self._face(ctx, P, pose)
        if fox > 0:
            self._fox_ears(ctx, P, t, fox)
        self._front_hair(ctx, P, pose, sway)
        self._accessories(ctx, P, pose)
        self._brows(ctx, P, pose)
        ctx.restore()

        ctx.restore()

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _head_space(ctx, pose, breathe):
        ctx.save()
        ctx.translate(0, breathe * 3.0)
        ctx.translate(0, -320)
        ctx.rotate(pose.tilt)
        ctx.translate(0, 320)

    # -------------------------------------------------------------------- hair
    def _twin_tails(self, ctx, P, t, pose):
        w = pose.wind
        for d in (-1, 1):
            root = (d * 112, -478)
            p1 = (d * 172, -472 - 20 * w)
            p2 = (d * (196 + 60 * w), -360 - 120 * w)
            p3 = (d * (166 + 120 * w), -150 - 190 * w)
            pts, widths = [], []
            n = 40
            for i in range(n + 1):
                s = i / n
                bx, by = bezier(root, p1, p2, p3, s)
                idle = math.sin(t * TAU / 2.8 - s * 2.2 + 0.5 * d) * 18 * s ** 1.4
                flutter = math.sin(t * TAU * 2.5 - s * 5 + d) * 34 * w * s ** 1.2
                pts.append((bx + idle + flutter, by + flutter * 0.35 * w))
                widths.append((1 - s) ** 0.8 * (13 + 26 * math.sin(math.pi * min(s, 0.5))))
            strand_path(ctx, pts, widths)
            paint(ctx, P['hair'], P['line'], 3.5)
            for k, lw in ((0.38, 2.4), (-0.42, 2.0)):
                polyline(ctx, offset_pts(pts, widths, k, 5, 36))
                stroke(ctx, P['hair_shade'], lw)
            polyline(ctx, offset_pts(pts, widths, -0.1, 3, 15))
            stroke(ctx, P['hair_light'], 5, 0.55)

    def _back_hair(self, ctx, pose, P, sway):
        w = pose.wind
        sx = sway * 4
        lift = -28 * w
        ctx.move_to(0, -562)
        ctx.curve_to(-122, -562, -152, -482, -146, -400)
        ctx.curve_to(-142, -340, -150 - 10 * w, -300 + lift, -140 - 15 * w + sx, -262 + lift)
        ctx.curve_to(-125 + sx, -282, -112, -296, -100, -304)
        ctx.curve_to(-96, -290, -92 + sx, -276, -84 + sx, -258 + lift)
        ctx.curve_to(-70, -282, -55, -298, -40, -304)
        ctx.line_to(40, -304)
        ctx.curve_to(55, -298, 70, -282, 84 + sx, -258 + lift)
        ctx.curve_to(92 + sx, -276, 96, -290, 100, -304)
        ctx.curve_to(112, -296, 125 + sx, -282, 140 + 15 * w + sx, -262 + lift)
        ctx.curve_to(150 + 10 * w, -300 + lift, 142, -340, 146, -400)
        ctx.curve_to(152, -482, 122, -562, 0, -562)
        ctx.close_path()
        paint(ctx, P['hair_shade'], P['line'], 3.5)

    def _front_hair(self, ctx, P, pose, sway):
        # Side locks framing the face.
        for d in (-1, 1):
            pts, widths = [], []
            for i in range(21):
                s = i / 20
                bx, by = bezier((d * 116, -486), (d * 126, -430), (d * 118, -370),
                                (d * 104 + sway * 3 * s, -312 - 10 * pose.wind), s)
                pts.append((bx, by))
                widths.append(17 * (1 - s) ** 0.9)
            strand_path(ctx, pts, widths)
            paint(ctx, P['hair'], P['line'], 3)
            polyline(ctx, offset_pts(pts, widths, -0.2, 3, 14))
            stroke(ctx, P['hair_shade'], 2)

        bangs_path(ctx)
        paint(ctx, P['hair'], P['line'], 3.5)

        ctx.save()
        bangs_path(ctx)
        ctx.clip()
        # Strand separation lines from the crown down to each valley.
        for i in range(0, len(FRINGE), 2):
            vx, vy = FRINGE[i]
            ctx.move_to(vx * 0.3, -552)
            ctx.curve_to(vx * 0.6, -522, vx, -494, vx, vy - 4)
            stroke(ctx, P['hair_shade'], 2.2)
        # Shine band ("angel ring").
        ctx.arc(0, -430, 116, math.pi * 1.13, math.pi * 1.87)
        stroke(ctx, P['hair_light'], 13, 0.5)
        for i in range(-4, 5):
            a = math.pi * 1.5 + i * 0.16
            x0, y0 = math.cos(a) * 110, -430 + math.sin(a) * 110
            ctx.move_to(x0, y0 + 9)
            ctx.line_to(x0 + 2, y0 + 20)
            stroke(ctx, P['hair_light'], 4, 0.6)
        ctx.restore()

    def _fox_ears(self, ctx, P, t, fox):
        for d in (-1, 1):
            twitch = 0.18 * max(0.0, math.sin(t * TAU / 2.3 + d)) ** 10
            ctx.save()
            ctx.translate(d * 74, -530)
            ctx.rotate(d * (0.38 + twitch))
            ctx.scale(fox, fox)
            ctx.move_to(-32, 10)
            ctx.curve_to(-28, -40, -8, -80, 0, -92)
            ctx.curve_to(8, -80, 28, -40, 32, 10)
            ctx.close_path()
            paint(ctx, P['hair'], P['line'], 3.5)
            ctx.move_to(-18, 4)
            ctx.curve_to(-15, -30, -5, -58, 0, -68)
            ctx.curve_to(5, -58, 15, -30, 18, 4)
            ctx.close_path()
            paint(ctx, rgb('#ffc6dc'))
            for k in (-1, 0, 1):
                ctx.move_to(k * 7, 6)
                ctx.line_to(k * 10, -16)
                stroke(ctx, rgb('#ffffff'), 2.5, 0.9)
            ctx.restore()

    def _fox_tail(self, ctx, P, t, pose, fox):
        ctx.save()
        ctx.translate(26, -196)
        ctx.scale(fox, fox)
        sway = math.sin(t * TAU / 2.2)
        pts, widths = [], []
        n = 40
        for i in range(n + 1):
            s = i / n
            bx, by = bezier((0, 0), (110, 30), (220, -60), (190 + sway * 30, -230), s)
            bx += math.sin(t * TAU * 2.0 - s * 4) * 18 * pose.wind * s
            pts.append((bx, by))
            widths.append(10 + 48 * math.sin(math.pi * min(s * 1.15, 1.0)) ** 0.8)
        widths[-1] = 0
        strand_path(ctx, pts, widths)
        paint(ctx, P['hair'], P['line'], 3.5)
        strand_path(ctx, pts, widths, 29)
        paint(ctx, rgb('#ffffff'), P['line'], 3.5)
        for k in (-0.4, 0.15):
            polyline(ctx, offset_pts(pts, widths, k, 6, 27))
            stroke(ctx, P['hair_shade'], 2.2)
        ctx.restore()

    # -------------------------------------------------------------------- body
    def _legs(self, ctx, P, pose):
        boots = pose.possessed >= 0.5
        for d in (-1, 1):
            lx = d * 24
            rounded_rect(ctx, lx - 12, -118, 24, 104, 10)
            paint(ctx, P['skin'], P['line'], 3)
            if boots:
                rounded_rect(ctx, lx - 14, -66, 28, 52, 9)
                paint(ctx, P['shoe'], P['line'], 3)
                rounded_rect(ctx, lx - 16, -72, 32, 12, 5)
                paint(ctx, P['trim'], P['line'], 2.5)
            else:
                rounded_rect(ctx, lx - 12.5, -74, 25, 60, 8)
                paint(ctx, P['sock'], P['line'], 3)
            rounded_rect(ctx, lx - 15 + d * 3, -26, 32, 27, 12)
            paint(ctx, P['shoe'], P['line'], 3)
            ellipse(ctx, lx + d * 8, -16, 5, 3)
            paint(ctx, rgb('#ffffff'), alpha=0.5)
            if not boots:
                ctx.move_to(lx - 13 + d * 3, -18)
                ctx.line_to(lx + 13 + d * 3, -18)
                stroke(ctx, P['line'], 2.5)

    def _hem(self, t, pose, flare, hem_y, pleats, drop=0.0, scallop=3.0):
        pts = []
        n = pleats * 6
        for i in range(n + 1):
            u = i / n
            x = lerp(-flare, flare, u)
            y = hem_y + drop + 11 * math.sin(u * math.pi)
            y += 6 * pose.wind * math.sin(u * 18 + t * 15)
            y += scallop * abs(math.sin(u * pleats * math.pi))
            pts.append((x, y))
        return pts

    def _skirt(self, ctx, P, t, pose):
        w = pose.wind
        flare = 112 + 26 * w
        hem_y = -98 - 18 * w
        magical = pose.possessed >= 0.5

        def outline(pts):
            ctx.move_to(-50, -214)
            ctx.curve_to(-62, -180, -flare + 22, -134, *pts[0])
            for p in pts[1:]:
                ctx.line_to(*p)
            ctx.curve_to(flare - 22, -134, 62, -180, 50, -214)
            ctx.close_path()

        if magical:
            outline(self._hem(t, pose, flare + 6, hem_y, 12, drop=16, scallop=7))
            paint(ctx, P['frill'], P['line'], 3)
        hem = self._hem(t, pose, flare, hem_y, 8)
        outline(hem)
        paint(ctx, P['skirt'], P['line'], 3.5)
        for i in range(1, 8):
            u = i / 8
            ctx.move_to(lerp(-46, 46, u), -208)
            ctx.line_to(*hem[i * 6])
            stroke(ctx, P['skirt_shade'], 2.5)
        polyline(ctx, [(x, y - 9) for x, y in hem[2:-2]])
        stroke(ctx, P['trim'], 3, 0.9)

    def _torso(self, ctx, P, pose):
        magical = pose.possessed >= 0.5
        rounded_rect(ctx, -16, -344, 32, 52, 8)
        paint(ctx, P['skin'], P['line'], 3)
        ctx.save()
        rounded_rect(ctx, -16, -344, 32, 52, 8)
        ctx.clip()
        ellipse(ctx, 0, -334, 24, 13)
        paint(ctx, P['skin_shade'])
        ctx.restore()

        ctx.move_to(-48, -302)
        ctx.curve_to(-62, -300, -67, -286, -64, -270)
        ctx.line_to(-52, -206)
        ctx.line_to(52, -206)
        ctx.line_to(64, -270)
        ctx.curve_to(67, -286, 62, -300, 48, -302)
        ctx.close_path()
        paint(ctx, P['top'], P['line'], 3.5)
        ctx.move_to(38, -260)
        ctx.line_to(48, -210)
        stroke(ctx, P['top_shade'], 6)

        if magical:
            for d in (-1, 1):
                ellipse(ctx, d * 62, -290, 22, 17)
                paint(ctx, P['top'], P['line'], 3)
                ctx.arc(d * 62, -290, 15, 0.2 * math.pi, 0.8 * math.pi)
                stroke(ctx, P['trim'], 2.5)
            rounded_rect(ctx, -54, -218, 108, 14, 6)
            paint(ctx, P['bow'], P['line'], 2.5)

        # Sailor collar.
        ctx.move_to(-58, -302)
        ctx.line_to(-68, -270)
        ctx.line_to(0, -232)
        ctx.line_to(68, -270)
        ctx.line_to(58, -302)
        ctx.line_to(18, -303)
        ctx.line_to(0, -262)
        ctx.line_to(-18, -303)
        ctx.close_path()
        paint(ctx, P['collar'], P['line'], 3)
        polyline(ctx, [(-60, -276), (0, -243), (60, -276)])
        stroke(ctx, P['trim'], 2.5)

        bow(ctx, 0, -246, 26 if magical else 20, P['bow'], P['line'])
        if magical:
            ellipse(ctx, 0, -246, 9, 10)
            paint(ctx, P['gem'], P['line'], 2.5)
            ellipse(ctx, -3, -250, 3, 3.5)
            paint(ctx, rgb('#ffffff'))

    def _arms(self, ctx, P, t, pose):
        magical = pose.possessed >= 0.5
        for d in (-1, 1):
            sh = (d * 58, -286)
            e = lerp2((d * 74, -238), (d * 78, -250), pose.arms_chest)
            h = lerp2((d * 74, -192), (d * 24, -258), pose.arms_chest)
            e = lerp2(e, (d * 110, -336), pose.arms_up)
            h = lerp2(h, (d * 132, -410), pose.arms_up)
            h = (h[0] + math.sin(t * TAU / 3.2 + d) * 1.5, h[1])
            mid = lerp2(sh, e, 0.75)
            polyline(ctx, [sh, e, h])
            stroke(ctx, P['line'], 24)
            polyline(ctx, [sh, e, h])
            stroke(ctx, P['skin'], 17)
            if magical:
                polyline(ctx, [lerp2(e, h, 0.25), h])
                stroke(ctx, P['frill'], 17)
                cuff = lerp2(e, h, 0.25)
                ellipse(ctx, cuff[0], cuff[1], 11, 11)
                paint(ctx, P['trim'], P['line'], 2.5)
            polyline(ctx, [sh, mid])
            stroke(ctx, P['top'], 18)
            ellipse(ctx, mid[0], mid[1], 9.5, 9.5)
            stroke(ctx, P['line'], 2.5)

    # -------------------------------------------------------------------- face
    def _face(self, ctx, P, pose):
        face_path(ctx)
        paint(ctx, P['skin'], P['line'], 3.5)
        ctx.save()
        face_path(ctx)
        ctx.clip()
        bangs_path(ctx, dy=15)
        paint(ctx, P['skin_shade'])
        ctx.restore()

        for d in (-1, 1):
            ellipse(ctx, d * 64, -362, 19, 8)
            paint(ctx, P['blush'], alpha=0.45)
            for k in (-1, 0, 1):
                ctx.move_to(d * 64 + k * 8 + 2, -366)
                ctx.line_to(d * 64 + k * 8 - 3, -358)
                stroke(ctx, darker(P['blush'], 0.85), 1.8, 0.6)

        self._eye(ctx, P, -46, -392, -1, pose, 0.0)
        self._eye(ctx, P, 46, -392, 1, pose, pose.wink)

        ctx.move_to(1, -369)
        ctx.line_to(3, -364)
        stroke(ctx, P['line'], 2, 0.45)
        self._mouth(ctx, P, pose)

    def _eye(self, ctx, P, cx, cy, m, pose, wink):
        line = P['line']

        def X(dx):
            return cx + m * dx

        if pose.face == 'happy' or wink > 0.5:
            ctx.move_to(X(-24), cy + 6)
            ctx.curve_to(X(-12), cy - 16, X(12), cy - 16, X(24), cy + 6)
            stroke(ctx, line, 5)
            return
        openness = 1 - pose.blink
        if openness < 0.3:
            ctx.move_to(X(-26), cy + 8)
            ctx.curve_to(X(-10), cy + 18, X(10), cy + 18, X(28), cy + 6)
            ctx.line_to(X(34), cy + 2)
            stroke(ctx, line, 5)
            return

        big = 1.12 if pose.face == 'surprised' else 1.0
        if pose.face == 'determined':
            openness *= 0.85

        def shape():
            ctx.move_to(X(-25), cy - 14)
            ctx.curve_to(X(-18), cy - 36, X(18), cy - 38, X(27), cy - 18)
            ctx.curve_to(X(31), cy + 10, X(16), cy + 31, X(0), cy + 31)
            ctx.curve_to(X(-16), cy + 31, X(-29), cy + 10, X(-25), cy - 14)
            ctx.close_path()

        ctx.save()
        ctx.translate(cx, cy + 22)
        ctx.scale(big, openness * big)
        ctx.translate(-cx, -(cy + 22))

        shape()
        paint(ctx, rgb('#ffffff'))
        ix = cx + pose.look[0] * 6
        iy = cy + 5 + pose.look[1] * 4
        rx, ry = (13, 19) if pose.face == 'surprised' else (17, 24)
        ctx.save()
        shape()
        ctx.clip()
        g = cairo.LinearGradient(0, iy - ry, 0, iy + ry)
        g.add_color_stop_rgb(0, *P['iris_top'])
        g.add_color_stop_rgb(0.55, *mix(P['iris_top'], P['iris_bot'], 0.55))
        g.add_color_stop_rgb(1, *P['iris_bot'])
        ellipse(ctx, ix, iy, rx, ry)
        ctx.set_source(g)
        ctx.fill()
        ellipse(ctx, ix, iy, rx, ry)
        stroke(ctx, darker(P['iris_top'], 0.7), 2.5)
        ellipse(ctx, ix, iy - 2, rx * 0.45, ry * 0.52)
        paint(ctx, darker(P['iris_top'], 0.45))
        ellipse(ctx, ix, iy + ry * 0.5, rx * 0.7, ry * 0.32)
        paint(ctx, mix(P['iris_bot'], rgb('#ffffff'), 0.4), alpha=0.6)
        ellipse(ctx, cx, cy - 32, 36, 14)
        paint(ctx, line, alpha=0.22)
        ctx.restore()
        ellipse(ctx, ix - 6, iy - 10, 6.5, 7.5)
        paint(ctx, rgb('#ffffff'))
        ellipse(ctx, ix + 7, iy + 10, 3, 3)
        paint(ctx, rgb('#ffffff'), alpha=0.9)

        ctx.move_to(X(-27), cy - 12)
        ctx.curve_to(X(-18), cy - 37, X(18), cy - 39, X(28), cy - 18)
        ctx.line_to(X(37), cy - 25)
        stroke(ctx, line, 6)
        ctx.move_to(X(-6), cy + 31)
        ctx.curve_to(X(4), cy + 33, X(12), cy + 31, X(18), cy + 26)
        stroke(ctx, line, 2.2, 0.8)
        ctx.restore()

        if pose.eye_glow > 0:
            glow(ctx, ix, iy, 34, P['eye_glow'], 0.55 * pose.eye_glow)

    def _brows(self, ctx, P, pose):
        lift = {'surprised': -8, 'happy': -3}.get(pose.face, 0)
        for d in (-1, 1):
            if pose.face == 'determined':
                ctx.move_to(d * 68, -446)
                ctx.line_to(d * 26, -436)
            else:
                ctx.move_to(d * 66, -440 + lift)
                ctx.curve_to(d * 54, -449 + lift, d * 38, -449 + lift, d * 26, -444 + lift)
            stroke(ctx, P['line'], 3, 0.55)

    def _mouth(self, ctx, P, pose):
        my = -343
        line = P['line']
        o = pose.mouth
        if pose.face == 'surprised' and o < 0.15:
            ellipse(ctx, 0, my + 2, 6, 8)
            paint(ctx, P['mouth'], line, 2.4)
            return
        if o < 0.15:
            if pose.face == 'happy' or pose.wink > 0.5:
                ctx.move_to(-11, my - 3)
                ctx.curve_to(-4, my + 6, 4, my + 6, 11, my - 3)
            else:
                ctx.move_to(-8, my - 1)
                ctx.curve_to(-3, my + 3, 3, my + 3, 8, my - 1)
            stroke(ctx, line, 2.6)
            return
        h = 4 + 12 * o
        w = 10 + 2 * o

        def shape():
            ctx.move_to(-w, my - 2)
            ctx.curve_to(-w * 0.4, my, w * 0.4, my, w, my - 2)
            ctx.curve_to(w * 0.9, my + h * 0.95, -w * 0.9, my + h * 0.95, -w, my - 2)
            ctx.close_path()

        shape()
        paint(ctx, P['mouth'])
        ctx.save()
        shape()
        ctx.clip()
        ellipse(ctx, 0, my + h * 0.75, w * 0.6, h * 0.4)
        paint(ctx, P['tongue'])
        ctx.restore()
        shape()
        stroke(ctx, line, 2.4)

    def _accessories(self, ctx, P, pose):
        for d in (-1, 1):
            bow(ctx, d * 112, -486, 20, P['ribbon'], P['line'], angle=d * 0.5)
        if pose.possessed >= 0.5:
            ctx.save()
            ctx.translate(58, -520)
            ctx.arc(0, 0, 13, 0, TAU)
            ctx.arc_negative(5, -4, 11, TAU, 0)
            paint(ctx, P['clip'], P['line'], 2.5)
            ctx.restore()
        else:
            sparkle(ctx, 58, -518, 15, P['line'], k=0.3)
            sparkle(ctx, 58, -518, 11, P['clip'], k=0.3)


class FoxSpirit:
    """Floating kitsune spirit — the creature that possesses the girl."""

    def draw(self, ctx, x, y, scale, t, mouth=0.0, mood='happy', alpha=1.0):
        line = rgb('#4a3a6a')
        cream = rgb('#fff8ec')
        red = rgb('#e8475f')
        ctx.save()
        ctx.translate(x, y + math.sin(t * 2.2) * 8)
        ctx.scale(scale, scale)
        ctx.set_line_join(cairo.LINE_JOIN_ROUND)
        ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        ctx.push_group()

        glow(ctx, 0, 0, 130, rgb('#8fe0ff'), 0.6)
        for i, a in enumerate((-0.6, 0.0, 0.6)):
            pts, widths = [], []
            for j in range(31):
                s = j / 30
                bx, by = bezier((-10, 18), (-60, 30 + a * 30), (-105, 20 + a * 70),
                                (-150, -20 + a * 90 + math.sin(t * 4 + i) * 14), s)
                by += math.sin(t * 5 - s * 4 + i) * 6 * s
                pts.append((bx, by))
                widths.append(17 * (1 - s) ** 0.7 * (0.6 + 0.4 * math.sin(math.pi * s)))
            strand_path(ctx, pts, widths)
            g = cairo.LinearGradient(-10, 0, -150, 0)
            g.add_color_stop_rgba(0, *cream, 1)
            g.add_color_stop_rgba(1, *rgb('#8fe0ff'), 0.3)
            ctx.set_source(g)
            ctx.fill_preserve()
            stroke(ctx, line, 2.5, 0.6)

        for d in (-1, 1):
            ctx.move_to(d * 12, -22)
            ctx.line_to(d * 36, -66)
            ctx.line_to(d * 40, -18)
            ctx.close_path()
            paint(ctx, cream, line, 3)
            ctx.move_to(d * 20, -24)
            ctx.line_to(d * 34, -52)
            ctx.line_to(d * 35, -24)
            ctx.close_path()
            paint(ctx, rgb('#ffc6dc'))
        ellipse(ctx, 0, 4, 46, 36)
        paint(ctx, cream, line, 3)

        ctx.move_to(0, -30)
        ctx.curve_to(6, -22, 4, -16, 0, -13)
        ctx.curve_to(-4, -16, -6, -22, 0, -30)
        paint(ctx, red)
        for d in (-1, 1):
            ctx.move_to(d * 30, 6)
            ctx.line_to(d * 42, 2)
            stroke(ctx, red, 3)
            ex = d * 16
            if mood == 'happy':
                ctx.move_to(ex - 8, 2)
                ctx.curve_to(ex - 4, -7, ex + 4, -7, ex + 8, 2)
                stroke(ctx, line, 3.5)
            else:
                ellipse(ctx, ex, -1, 7, 9)
                paint(ctx, rgb('#ffcf4a'), line, 2.5)
                ellipse(ctx, ex, -1, 2, 7)
                paint(ctx, line)
                ellipse(ctx, ex - 2, -4, 2, 2)
                paint(ctx, rgb('#ffffff'))
        if mouth > 0.15:
            ellipse(ctx, 0, 17, 5, 3 + 4 * mouth)
            paint(ctx, rgb('#8a2f45'), line, 2)
        else:
            for d in (-1, 1):
                ctx.arc(d * 4, 13, 4, 0.1 * math.pi, 0.9 * math.pi)
                stroke(ctx, line, 2.2)
        ellipse(ctx, 0, 10, 3, 2)
        paint(ctx, line)

        ctx.pop_group_to_source()
        ctx.paint_with_alpha(alpha)
        ctx.restore()
