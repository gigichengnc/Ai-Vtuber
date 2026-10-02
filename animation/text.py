"""Outlined text for subtitles, title cards and end cards (CJK-capable)."""
import cairo

FONT = 'WenQuanYi Zen Hei'


def _font(ctx, size, font=FONT, bold=True):
    ctx.select_font_face(font, cairo.FONT_SLANT_NORMAL,
                         cairo.FONT_WEIGHT_BOLD if bold else cairo.FONT_WEIGHT_NORMAL)
    ctx.set_font_size(size)


def _advance(ctx, text, spacing):
    if not spacing:
        return ctx.text_extents(text).x_advance
    return sum(ctx.text_extents(ch).x_advance + spacing for ch in text) - spacing


def draw_runs(ctx, runs, x, y, size, outline=None, outline_w=6.0, alpha=1.0,
              align='center', spacing=0.0, glow=None, font=FONT, bold=True):
    """Draw [(text, rgb), ...] as one line. Returns the line width."""
    if alpha <= 0:
        return 0.0
    _font(ctx, size, font, bold)
    width = sum(_advance(ctx, text, spacing) for text, _ in runs)
    if align == 'center':
        x -= width / 2
    elif align == 'right':
        x -= width

    def trace(text, cx):
        for ch in (text if spacing else [text]):
            ctx.move_to(cx, y)
            ctx.text_path(ch)
            cx += ctx.text_extents(ch).x_advance + spacing
        return cx

    ctx.save()
    ctx.set_line_join(cairo.LINE_JOIN_ROUND)
    if glow is not None:
        ctx.set_operator(cairo.OPERATOR_ADD)
        for w in (30, 18, 9):
            ctx.new_path()
            cx = x
            for text, _ in runs:
                cx = trace(text, cx)
            ctx.set_source_rgba(*glow, 0.12 * alpha)
            ctx.set_line_width(w)
            ctx.stroke()
        ctx.set_operator(cairo.OPERATOR_OVER)
    if outline is not None:
        ctx.new_path()
        cx = x
        for text, _ in runs:
            cx = trace(text, cx)
        ctx.set_source_rgba(*outline, alpha)
        ctx.set_line_width(outline_w)
        ctx.stroke()
    cx = x
    for text, color in runs:
        ctx.new_path()
        cx = trace(text, cx)
        ctx.set_source_rgba(*color, alpha)
        ctx.fill()
    ctx.restore()
    return width


def draw_text(ctx, text, x, y, size, color, **kw):
    return draw_runs(ctx, [(text, color)], x, y, size, **kw)
