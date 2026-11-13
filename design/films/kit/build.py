#!/usr/bin/env python3
"""REPI · Cinematic Motion Studio — generador de films HyperFrames (Experience 3.0).

Cada film es un proyecto HyperFrames (design/films/<film>/) armado desde un guion declarativo (FILMS, abajo) con escenas
reutilizables: títulos cinéticos, la sala vista desde arriba (fragmentos que se conectan, red de personas, convergencia),
el teléfono con la grabación real de la demo, el número de la serie que se transforma y la placa final con el wordmark.

Uso:   python3 design/films/kit/build.py [film ...]
Medios: los videos y la música NO van a Git (assets/media/). `--media` los copia desde MEDIA_SRC (grabaciones de la demo
        guiada local y pistas con licencia; ver LICENCIAS.md y docs/comercial/EXPERIENCE_3.md).
"""
import json, os, re, shutil, sys, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))
MEDIA_SRC = os.environ.get("REPI_MEDIA_SRC", "")
W, H = 1920, 1080
C = dict(navy="#0B0F14", floor="#0F1620", grid="#1F2B3B", surface="#1A2433", steel="#2D3B4F", line="#4A5D78",
         cyan="#00D1FF", teal="#5DE6D8", white="#F8FAFC", muted="#9AA8BA", cream="#F4F1EA")

FONTS = """
@font-face { font-family: "Barlow"; font-weight: 400; src: url("assets/fonts/barlow-400.woff2") format("woff2"); }
@font-face { font-family: "Barlow"; font-weight: 600; src: url("assets/fonts/barlow-600.woff2") format("woff2"); }
@font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url("assets/fonts/barlowcondensed-700.woff2") format("woff2"); }
"""
BASE_CSS = FONTS + f"""
#root {{ position: absolute; inset: 0; overflow: hidden; background: {C['floor']}; color: {C['white']}; font-family: "Barlow", sans-serif; }}
.h {{ font: 700 116px/0.9 "Barlow Condensed"; text-transform: uppercase; letter-spacing: -0.02em; margin: 0; }}
.h .w {{ display: inline-block; }}
.h .m {{ color: {C['muted']}; }}
.h .a {{ color: {C['cyan']}; }}
.s {{ font: 600 44px/1.2 "Barlow"; color: {C['muted']}; margin: 0; }}
.s b {{ color: {C['white']}; font-weight: 600; }}
"""

# ── La sala (mismo modelo que la web: apps/web/src/components/conoce/sala/model.ts) ───────────────────────────────────
ZONES = [("recepcion", -14.5, 8.5, 8, 6), ("racks", -2, -2.5, 12, 9), ("maquinas", 11.5, -3.5, 13, 11), ("box", -14.5, -5.5, 8, 8), ("oficina", 14, 8.5, 8, 6), ("cardio", 0, 8.5, 14, 5)]
GEAR = [(-6, -5, 2.2, 1.4), (-2, -5, 2.2, 1.4), (2, -5, 2.2, 1.4), (-6, 0, 2.2, 1.4), (-2, 0, 2.2, 1.4), (2, 0, 2.2, 1.4), (7, -7, 2.4, 1.6), (11, -7, 2.4, 1.6), (15, -7, 2.4, 1.6), (7, -3, 2.4, 1.6), (11, -3, 2.4, 1.6), (15, -3, 2.4, 1.6), (7, 1, 2.4, 1.6), (11, 1, 2.4, 1.6),
        (-5, 8.5, 1.2, 2.4), (-2.5, 8.5, 1.2, 2.4), (0, 8.5, 1.2, 2.4), (2.5, 8.5, 1.2, 2.4), (5, 8.5, 1.2, 2.4), (-14.5, 9.5, 4.5, 1), (-14.5, -5.5, 3, 1.2), (14, 8.5, 3.2, 1.4)]
M = 44  # px por metro (en vertical, la sala llena el alto: más cerca)
KIND, HINTS, KEYS = {}, [], []  # tipo de cada escena, momentos con «pop» y teclas tocadas (para el sonido automático)

def canvas(w, h):
    global W, H, M
    W, H = w, h
    M = 44 if w >= h else h / 26

PX = lambda x: W / 2 + x * M
PZ = lambda z: H / 2 + z * M

def floor_svg(pid, draw=True):
    """Plano de la sala en SVG; con `draw`, las líneas tienen pathLength para dibujarse."""
    pl = ' pathLength="1"' if draw else ""
    g = [f'<rect x="0" y="0" width="{W}" height="{H}" fill="{C["floor"]}"/>']
    lines = []
    for x in range(-20, 21, 2): lines.append(f'<line class="{pid}-gl" x1="{PX(x)}" y1="{PZ(-13)}" x2="{PX(x)}" y2="{PZ(13)}"{pl}/>')
    for z in range(-12, 13, 2): lines.append(f'<line class="{pid}-gl" x1="{PX(-20)}" y1="{PZ(z)}" x2="{PX(20)}" y2="{PZ(z)}"{pl}/>')
    g.append(f'<g stroke="{C["grid"]}" stroke-width="1.5">' + "".join(lines) + "</g>")
    zs = "".join(f'<rect class="{pid}-zn" data-z="{i}" x="{PX(x - w / 2)}" y="{PZ(z - d / 2)}" width="{w * M}" height="{d * M}" rx="10"{pl}/>' for i, x, z, w, d in ZONES)
    g.append(f'<g fill="{C["surface"]}" fill-opacity="0.55" stroke="{C["line"]}" stroke-width="2">{zs}</g>')
    gs = "".join(f'<rect class="{pid}-gr" x="{PX(x - w / 2)}" y="{PZ(z - d / 2)}" width="{w * M}" height="{d * M}" rx="5"/>' for x, z, w, d in GEAR)
    g.append(f'<g fill="#1E2A3A" stroke="#5A6E8A" stroke-width="1.5">{gs}</g>')
    return f'<svg id="{pid}-floor" class="floor" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(g)}</svg>'

FLOOR_CSS = f".floor {{ position: absolute; inset: 0; }}"

def scene(sid, dur, css, body, js, w=None, h=None):
    """Sub-composición: plantilla con #root, timeline pausada registrada con la id de la escena."""
    w, h = w or W, h or H
    return f"""<template>
<style>{BASE_CSS}{FLOOR_CSS}{css}</style>
<div id="root" data-composition-id="{sid}" data-width="{w}" data-height="{h}">
{body}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{js}
window.__timelines["{sid}"] = tl;
</script>
</template>
"""

def words(text, cls="w"):
    """«Cada *dato* en otro lado» → spans por palabra; *x* resalta en cian, _x_ en gris."""
    import re
    out = []
    for t in text.split(" "):
        k = cls
        m = re.fullmatch(r"([*_])(.+)\1([.,;:!?]*)", t)  # «*propone*,» → resaltado con la coma
        if m: t, k = m.group(2) + m.group(3), cls + (" a" if m.group(1) == "*" else " m")
        out.append(f'<span class="{k}">{html.escape(t)}</span>')
    return " ".join(out)

# ── Escenas ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def s_dot(sid, dur, line):
    """Plano oscuro: el punto cian late en el centro y la sala se dibuja desde él. Una línea tranquila."""
    KIND[sid] = "dot"
    css = f"""#{sid}-dot {{ position: absolute; left: {W/2-22}px; top: {H/2-22}px; width: 44px; height: 44px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-ring {{ position: absolute; left: {W/2-60}px; top: {H/2-60}px; width: 120px; height: 120px; border-radius: 50%; border: 3px solid {C['cyan']}; }}
#{sid}-t {{ position: absolute; left: 60px; right: 60px; top: {H/2+110}px; text-align: center; font-size: 56px; color: {C['white']}; }}
#{sid}-floor {{ transform-origin: 50% 50%; }}"""
    body = f"""{floor_svg(sid)}
<div id="{sid}-ring" class="clip" data-start="0" data-duration="{dur}"></div>
<div id="{sid}-dot" class="clip" data-start="0" data-duration="{dur}"></div>
<p id="{sid}-t" class="s clip" data-start="0" data-duration="{dur}">{line}</p>"""
    js = f"""tl.fromTo("#{sid}-floor", {{ scale: 1 }}, {{ scale: 1.03, duration: {dur}, ease: "none" }}, 0);
tl.fromTo(".{sid}-gl, .{sid}-zn", {{ strokeDasharray: 1, strokeDashoffset: 1 }}, {{ strokeDashoffset: 0, duration: 1.6, ease: "power2.out", stagger: 0.004 }}, 0.55);
tl.fromTo(".{sid}-zn", {{ fillOpacity: 0 }}, {{ fillOpacity: 0.55, duration: 0.8 }}, 1.4);
tl.fromTo(".{sid}-gr", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.6, stagger: 0.02 }}, 1.6);
tl.fromTo("#{sid}-dot", {{ scale: 1 }}, {{ scale: 1.4, duration: 0.3, ease: "power2.out" }}, 0.25);
tl.to("#{sid}-dot", {{ scale: 1, duration: 0.35, ease: "back.out(1.6)" }}, 0.55);
tl.fromTo("#{sid}-ring", {{ scale: 0.2, opacity: 0 }}, {{ scale: 9, opacity: 0, duration: 1.4, ease: "expo.out", keyframes: {{ opacity: [0, 0.9, 0] }} }}, 0.55);
tl.to("#{sid}-t", {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {dur - 0.25});"""
    return scene(sid, dur, css, body, js)

FRAG_CSS = f""".frag {{ position: absolute; padding: 22px 28px; border-radius: 18px; background: {C['surface']}; border: 2px solid {C['steel']}; font: 600 40px/1.2 "Barlow"; color: {C['white']}; box-shadow: 0 30px 60px -20px rgba(0,0,0,.55); display: flex; flex-direction: column; gap: 6px; }}
.frag small {{ font: 600 32px "Barlow"; color: {C['muted']}; }}
.frag.paper {{ background: {C['cream']}; color: {C['navy']}; border-color: #DCD5C6; font-style: italic; }}
.frag.paper small {{ color: #6B6152; font-style: normal; }}
.frag.chat {{ border-radius: 22px 22px 22px 6px; background: #1F2D3F; }}
.frag.alert small {{ color: #FFB4A8; }}"""
FRAGS_SALA = [("paper", 130, 90, -5, "<small>Rutina</small>Sentadilla 4×8<br>Prensa 3×12<br><s>Remo ¿?</s>"),
         ("chat", 1330, 120, 3, "<small>Socio · 19:42</small>Profe, ¿qué me toca hoy?"),
         ("", 1300, 790, -2, "<small>planilla_socios_v3.xlsx</small>Sin actualizar"),
         ("alert", 200, 800, 4, "<small>Pedido de ayuda</small>Nadie lo vio"),
         ("", 760, 60, -3, "<small>Progreso</small>— sin datos —")]
FRAG_C = (210, 95)  # centro aproximado de cada tarjeta, para los trazos

def s_scatter(sid, dur, t1, t2, connect_at, frags_def=None, calls=5.0, appear=1.05, waves=3, fly_lead=1.5, appear0=0.3, t1_at=0.6, wave_at=0.9):
    """Fragmentos sueltos sobre la sala; después, trazos que los conectan con el punto cian.
    `calls`: cuándo empieza cada fragmento a «llamar» (None: no llaman); `appear`: separación entre fragmentos que aparecen;
    `fly_lead`: cuánto antes del final vuelan al punto. El punto ya no inunda el cuadro de cian (era un fogonazo de 0,4–0,6 s):
    late y la escena corta en el golpe. En vertical, las
    posiciones (pensadas para 1920×1080) se reparten en dos columnas arriba y abajo del título."""
    FRAGS = frags_def or FRAGS_SALA
    if H > W:
        pos = [(60, 170), (560, 360), (580, 1400), (70, 1600), (300, 640)]
        FRAGS = [(k, pos[i][0], pos[i][1], r, t) for i, (k, x, y, r, t) in enumerate(FRAGS)]
    KIND[sid] = ("scatter", dur - fly_lead)
    css = FRAG_CSS + f"""#{sid}-dot {{ position: absolute; left: {W/2-22}px; top: {H/2-22}px; width: 44px; height: 44px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-lines {{ position: absolute; inset: 0; }}
#{sid}-floor {{ transform-origin: 50% 50%; }}
.{sid}-pk {{ position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: {C['cyan']}; opacity: 0; }}
#{sid}-lines line {{ stroke: {C['cyan']}; stroke-width: 3; stroke-linecap: round; }}
.{sid}-tt {{ position: absolute; left: 50px; right: 50px; top: {H/2+70}px; text-align: center;{" font-size: 104px;" if H > W else ""} }}
#{sid}-shade {{ position: absolute; inset: 0; background: radial-gradient(ellipse 60% 45% at 50% 62%, rgba(11,15,20,.85), rgba(11,15,20,0) 70%); }}"""
    frags, lines = [], []
    for i, (k, x, y, r, txt) in enumerate(FRAGS):
        frags.append(f'<div id="{sid}-f{i}" class="frag {k} clip" data-start="0" data-duration="{dur}" style="left:{x}px;top:{y}px;rotate:{r}deg">{txt}</div>')
        cx, cy = x + FRAG_C[0], y + FRAG_C[1]
        lines.append(f'<line id="{sid}-l{i}" x1="{cx}" y1="{cy}" x2="{W/2}" y2="{H/2}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>')
    body = f"""{floor_svg(sid, draw=False)}
<div id="{sid}-shade"></div>
<svg id="{sid}-lines" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(lines)}</svg>
{"".join(frags)}
<div id="{sid}-dot" class="clip" data-start="0" data-duration="{dur}"></div>
<h2 id="{sid}-t1" class="h {sid}-tt clip" data-start="0" data-duration="{connect_at + 0.4}">{words(t1)}</h2>
<h2 id="{sid}-t2" class="h {sid}-tt clip" data-start="{connect_at}" data-duration="{dur - connect_at}">{words(t2)}</h2>"""
    pk = []
    for w in range(waves):
        for i, (k, x, y, r, txt) in enumerate(FRAGS):
            pk.append(f'<div id="{sid}-k{w}{i}" class="{sid}-pk" style="left:{x + FRAG_C[0]}px;top:{y + FRAG_C[1]}px"></div>')
    body = body.replace(f'<div id="{sid}-dot"', "".join(pk) + f'\n<div id="{sid}-dot"')
    js = [f'tl.fromTo("#{sid}-floor", {{ scale: 1 }}, {{ scale: 1.06, duration: {dur}, ease: "none" }}, 0);']
    # Antes de conectarse, cada fragmento «llama» y nadie responde.
    for i in range(len(FRAGS) if calls is not None else 0):
        at = calls + i * 0.68
        js.append(f'tl.to("#{sid}-f{i}", {{ y: -14, duration: 0.16, ease: "power2.out" }}, {at:.2f});')
        js.append(f'tl.to("#{sid}-f{i}", {{ y: 0, duration: 0.4, ease: "back.out(2.4)" }}, {at + 0.16:.2f});')
    # Ya conectados, los datos viajan por los trazos al punto, en tres oleadas.
    for w in range(waves):
        at = connect_at + wave_at + w * 1.1
        for i, (k, x, y, r, txt) in enumerate(FRAGS):
            js.append(f'tl.fromTo("#{sid}-k{w}{i}", {{ x: 0, y: 0, opacity: 0 }}, {{ x: {W/2 - x - FRAG_C[0]}, y: {H/2 - y - FRAG_C[1]}, opacity: 1, duration: 0.7, ease: "power2.in" }}, {at + i * 0.05:.2f});')
            js.append(f'tl.set("#{sid}-k{w}{i}", {{ opacity: 0 }}, {at + i * 0.05 + 0.7:.2f});')
        js.append(f'tl.to("#{sid}-dot", {{ scale: 1.35, duration: 0.12, ease: "power2.out" }}, {at + 0.72:.2f});')
        js.append(f'tl.to("#{sid}-dot", {{ scale: 1, duration: 0.35, ease: "back.out(1.6)" }}, {at + 0.84:.2f});')
    for i in range(len(FRAGS)):
        js.append(f'tl.fromTo("#{sid}-f{i}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }}, {appear0 + i * appear:.2f});')
        js.append(f'tl.to("#{sid}-l{i}", {{ strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }}, {connect_at + 0.15 + i * 0.12:.2f});')
    js.append(f'tl.fromTo("#{sid}-t1 .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.07 }}, {t1_at});')
    js.append(f'tl.to("#{sid}-t1 .w", {{ opacity: 0, filter: "blur(8px)", duration: 0.18, stagger: 0.03 }}, {connect_at - 0.2});')
    js.append(f'tl.fromTo("#{sid}-t2 .w", {{ color: "{C["muted"]}" }}, {{ color: "{C["white"]}", duration: 0.1, stagger: 0.09 }}, {connect_at + 0.1});')
    js.append(f'tl.fromTo("#{sid}-t2", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.12 }}, {connect_at + 0.05});')
    # Los fragmentos vuelan al punto y el punto crece hasta volverse el suelo de la escena siguiente.
    fly = dur - fly_lead
    for i, (k, x, y, r, txt) in enumerate(FRAGS):
        js.append(f'tl.to("#{sid}-f{i}", {{ x: {W/2 - x - FRAG_C[0]}, y: {H/2 - y - FRAG_C[1]}, scale: 0.1, opacity: 0, rotate: 0, duration: 0.45, ease: "power3.in" }}, {fly + i * 0.06:.2f});')
    js.append(f'tl.to("#{sid}-lines", {{ opacity: 0, duration: 0.3 }}, {fly});')
    js.append(f'tl.to("#{sid}-t2", {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {max(fly + 0.2, dur - 0.5):.2f});')
    js.append(f'tl.to("#{sid}-dot", {{ scale: 2.6, duration: 0.3, ease: "power3.in" }}, {dur - 0.32});')
    js.append(f'tl.to("#{sid}-floor", {{ opacity: 0.25, duration: 0.25 }}, {dur - 0.27});')
    return scene(sid, dur, css, body, "\n".join(js))

WM_W = 400  # el original mide 315×154: nunca más de ~1,3× (400 px). Se remuestrea una vez con Lanczos (build → wm_400.png).
def wordmark(sid, width=WM_W, extra=""):
    return f'<span id="{sid}-wm" class="wm" style="width:{width}px{extra}"><img src="assets/brand/wm_{WM_W}.png" alt=""><i id="{sid}-wmdot"></i></span>'
WM_CSS = f""".wm {{ position: absolute; display: block; }}
.wm img {{ width: 100%; display: block; }}
.wm i {{ position: absolute; left: 88.92%; top: 1.58%; width: 10.12%; aspect-ratio: 1; border-radius: 50%; background: {C['cyan']}; }}"""
KT_CSS = """.kt .mw { display: inline-block; overflow: hidden; vertical-align: top; padding: 0.16em 0.02em 0.04em; margin: -0.16em -0.02em -0.04em; }
.kt .w { display: inline-block; }"""

def kwords(text):
    """Título cinético: cada palabra sube desde su propia máscara. *x* resalta en cian, _x_ en gris (como `words`)."""
    import re
    out = []
    for t in text.split(" "):
        k = "w"
        m = re.fullmatch(r"([*_])(.+)\1([.,;:!?]*)", t)
        if m: t, k = m.group(2) + m.group(3), "w " + ("a" if m.group(1) == "*" else "m")
        out.append(f'<span class="mw"><span class="{k}">{html.escape(t)}</span></span>')
    return " ".join(out)

def kin(sel, at, stagger=0.06):
    return f'tl.fromTo("{sel} .w", {{ yPercent: 118 }}, {{ yPercent: 0, duration: 0.5, ease: "expo.out", stagger: {stagger} }}, {at:.3f});'
def kout(sel, at):
    return f'tl.to("{sel} .w", {{ yPercent: -118, duration: 0.2, ease: "power3.in", stagger: 0.02 }}, {at:.3f});'

def s_logo(sid, dur, claim):
    """En el golpe: el wordmark original a su tamaño (400 px, nítido) y la frase grande debajo, palabra por palabra.
    Sin fogonazo cian: corte directo sobre el suelo oscurecido."""
    KIND[sid] = "logo"
    vertical = H > W
    wt = H / 2 - (330 if vertical else 270)
    css = WM_CSS + KT_CSS + f"""#{sid}-floor {{ transform-origin: 50% 50%; }}
#{sid}-wm {{ left: {W/2-WM_W/2}px; top: {wt}px; }}
#{sid}-t {{ position: absolute; left: 60px; right: 60px; top: {wt + 250}px; text-align: center; font-size: {150 if not vertical else 156}px; }}"""
    body = f"""{floor_svg(sid, draw=False)}
<div id="{sid}-bg" style="position:absolute;inset:0;background:radial-gradient(ellipse 80% 70% at 50% 50%, rgba(11,15,20,.97), rgba(11,15,20,.86))"></div>
{wordmark(sid)}
<h2 id="{sid}-t" class="h kt clip" data-start="0" data-duration="{dur}">{kwords(claim)}</h2>"""
    js = f"""tl.fromTo("#{sid}-floor", {{ scale: 1.14 }}, {{ scale: 1.0, duration: {dur}, ease: "power1.out" }}, 0);
tl.fromTo("#{sid}-wm img", {{ clipPath: "inset(0 100% 0 0)" }}, {{ clipPath: "inset(0 0% 0 0)", duration: 0.45, ease: "power3.out" }}, 0.04);
tl.fromTo("#{sid}-wmdot", {{ scale: 0 }}, {{ scale: 1, duration: 0.4, ease: "back.out(2.2)" }}, 0.28);
{kin(f"#{sid}-t", 0.3, 0.09)}
tl.to("#{sid}-wm, #{sid}-t", {{ y: {-H * 0.5:.0f}, filter: "blur(14px)", opacity: 0, duration: 0.24, ease: "power3.in" }}, {dur - 0.25});"""
    return scene(sid, dur, css, body, js)

PHONE_CSS = f""".phone {{ position: absolute; width: 470px; height: 1017px; border-radius: 54px; padding: 14px; background: #05080C; border: 2px solid {C['steel']}; box-shadow: 0 30px 60px -10px rgba(0,0,0,.55); overflow: hidden; }}
.phone .scr {{ position: relative; width: 100%; height: 100%; border-radius: 42px; overflow: hidden; background: #fff; }}
.phone video, .phone img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }}
.panel {{ position: absolute; padding: 30px 36px; border-radius: 26px; background: {C['surface']}; border: 2px solid {C['steel']}; box-shadow: 0 30px 60px -20px rgba(0,0,0,.6); }}
.panel small {{ display: block; font: 600 34px "Barlow"; color: {C['muted']}; margin-bottom: 6px; }}
.panel b {{ display: block; font: 700 76px/1 "Barlow Condensed"; letter-spacing: -0.01em; }}
.panel b.a {{ color: {C['cyan']}; }}
.panel b.t {{ color: {C['teal']}; }}
.panel p {{ margin: 14px 0 0; font: 600 34px/1.3 "Barlow"; color: {C['muted']}; max-width: 620px; }}"""

# ── Plano de producto 4.0: teléfono grande con cámara ────────────────────────────────────────────────────────────────────
SRC_HD = (936, 2026)  # precorte de las grabaciones HD (1170×2532, tools/rec-hd.mjs) al tamaño máximo en pantalla
def shot_geo():
    """Geometría del teléfono según el lienzo: ancho de pantalla, alto, escala «entero en cuadro» y centro vertical."""
    vertical = H > W
    sw = 860 if vertical else 700
    sh = round(sw * 2532 / 1170)
    fit = (H - 640) / (sh + 28) if vertical else (H - 80) / (sh + 28)
    yc = 640 + (H - 640) / 2 - 20 if vertical else H / 2
    return sw, sh, fit, yc

def s_shot(sid, dur, clips, title, cam, panels=(), rings=(), side="right", sub=None, desc=None, tsize=None, enter=True, leave=True, drift=True):
    """La app real en un teléfono grande con cámara: entra inclinado en 3D y se asienta, y la cámara se acerca a la fila de
    la que habla el plano (`cam`), con el plano de la sala moviéndose más lento detrás (paralaje) y las tarjetas delante.
    `clips`: [(archivo, media_start, inicio, duración[, velocidad])], precortados en un solo video.
    `cam`: [(en_s, zoom, fy, duración)]; zoom 1 = teléfono entero en cuadro; `fy` = fracción del alto de la pantalla del
           teléfono que queda centrada (0 arriba, 1 abajo). El primero es el encuadre de entrada.
    `rings`: [(en_s, sale_s, y0, y1[, x0, x1])] recuadro cian sobre la fila exacta (fracciones de la pantalla).
    `panels`: tarjetas con el valor real de esa fila, a tamaño grande (k, v, cls, why, at, out). En vertical van abajo, sobre el teléfono.
    `enter=False` / `leave=False`: el teléfono ya está en cuadro al empezar / sigue en cuadro al terminar, para encadenar varias
    escenas sobre la misma grabación como un solo plano (cambian el título, el recuadro y la tarjeta; el corte no se ve).
    `drift`: en los tramos quietos la cámara sigue acercándose muy despacio (apagarlo en planos encadenados).
    `desc`: qué pasa en la grabación, para la pista de descripción (tools/describe.py); no se ve."""
    KIND[sid] = "shot" if enter else "shot-cont"
    vertical = H > W
    sw, sh, fit, yc = shot_geo()
    pwt, pht = sw + 28, sh + 28
    cx = W / 2 if vertical else (1390 if side == "right" else 530)
    tx = 70 if vertical else (120 if side == "right" else 1010)
    twid = W - 140 if vertical else 800
    sgn = -1 if side == "right" else 1
    def st(z, fy):
        # En vertical el acercamiento se modera (el teléfono casi a sangre, sin salirse del ancho) y el centro sube, porque
        # la tarjeta ocupa el pie del cuadro.
        if vertical: z = min(1 + (z - 1) * 0.75, 1.8)
        c = yc - (130 * min(1, (z - 1) / 0.4) if vertical else 0)
        return round(fit * z, 4), round(c - fit * z * (14 + fy * sh), 1)
    fs = tsize or (132 if vertical else 124)
    css = f""".dv {{ position: absolute; left: {cx - pwt / 2:.0f}px; top: 0; width: {pwt}px; height: {pht}px; border-radius: 84px; padding: 14px; background: #05080C; border: 2px solid {C['steel']}; box-shadow: 0 70px 140px -30px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.04); }}
.dv .scr {{ position: relative; width: 100%; height: 100%; border-radius: 70px; overflow: hidden; background: #F4F1EA; }}
.dv video, .dv img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }}
.ring {{ position: absolute; border: 5px solid {C['cyan']}; border-radius: 18px; box-shadow: 0 0 0 3000px rgba(11,15,20,.38); }}
.panel {{ position: absolute; padding: 28px 36px 30px; border-radius: 26px; background: {C['surface']}; border: 2px solid {C['steel']}; box-shadow: 0 40px 80px -20px rgba(0,0,0,.7); }}
.panel small {{ display: block; font: 600 38px "Barlow"; color: {C['muted']}; margin-bottom: 6px; white-space: nowrap; }}
.panel b {{ display: block; font: 700 {96 if not vertical else 104}px/1 "Barlow Condensed"; letter-spacing: -0.01em; white-space: nowrap; }}
.panel b.a {{ color: {C['cyan']}; }}
.panel b.t {{ color: {C['teal']}; }}
.panel p {{ margin: 14px 0 0; font: 600 36px/1.25 "Barlow"; color: {C['muted']}; max-width: {W - 220 if vertical else 700}px; }}
#{sid}-floor {{ transform-origin: 50% 50%; }}
#{sid}-t {{ position: absolute; left: {tx}px; top: {150 if vertical else 130}px; width: {twid}px; font-size: {fs}px; }}
#{sid}-sub {{ position: absolute; left: {tx}px; width: {twid}px; {"top: 470px" if vertical else "top: 600px"}; }}""" + KT_CSS
    if vertical:
        css += f"\n#{sid}-top {{ position: absolute; left: 0; right: 0; top: 0; height: 760px; background: linear-gradient(180deg, {C['navy']} 0%, {C['navy']} 66%, rgba(11,15,20,0) 100%); }}"
        css += f"\n#{sid}-bot {{ position: absolute; left: 0; right: 0; bottom: 0; height: 560px; background: linear-gradient(0deg, rgba(11,15,20,.92) 0%, rgba(11,15,20,0) 100%); }}"
    for p in panels: HINTS.append((sid, p["at"]))
    PRECUTS.append((sid, clips, dur, SRC_HD))
    rg = "".join(f'<div id="{sid}-r{j}" class="ring" style="left:{(r[4] if len(r) > 4 else 0.025) * 100:.2f}%;right:{(1 - (r[5] if len(r) > 5 else 0.975)) * 100:.2f}%;top:{r[2] * 100:.2f}%;height:{(r[3] - r[2]) * 100:.2f}%"></div>' for j, r in enumerate(rings))
    pnl = []
    for j, p in enumerate(panels):
        pos = f"left:60px;bottom:{p.get('vb', 110)}px" if vertical else f"left:{p.get('x', tx)}px;top:{p.get('y', 600)}px"
        pnl.append(f'<div id="{sid}-p{j}" class="panel" style="{pos}"><small>{p["k"]}</small><b class="{p.get("cls", "")}">{p["v"]}</b>{f"<p>{p["why"]}</p>" if p.get("why") else ""}</div>')
    body = f"""<div id="{sid}-bgw" data-layout-allow-overflow style="position:absolute;inset:0">{floor_svg(sid, draw=False)}</div>
<div style="position:absolute;inset:0;background:{"linear-gradient(180deg, rgba(11,15,20,.9) 0%, rgba(11,15,20,.55) 100%)" if vertical else f"linear-gradient({90 if side == 'right' else 270}deg, rgba(11,15,20,.94) 0%, rgba(11,15,20,.7) 50%, rgba(11,15,20,.3) 100%)"}"></div>
<div id="{sid}-ph" class="dv" data-layout-allow-overflow><div class="scr"><img src="assets/media/cut-{sid}.jpg" alt=""><video id="{sid}-v" class="clip" src="assets/media/cut-{sid}.mp4" muted playsinline data-start="0" data-duration="{dur}" data-track-index="2"></video>{rg}</div></div>
{f'<div id="{sid}-top"></div><div id="{sid}-bot"></div>' if vertical else ""}
<h2 id="{sid}-t" class="h kt clip" data-start="0" data-duration="{dur}">{kwords(title)}</h2>
{f'<p id="{sid}-sub" class="s clip" data-start="0" data-duration="{dur}">{sub}</p>' if sub else ""}
{"".join(pnl)}"""
    (s0, y0) = st(cam[0][1], cam[0][2])
    ein = cam[0][3] if len(cam[0]) > 3 else 0.9
    js = [f'tl.set("#{sid}-ph", {{ transformOrigin: "50% 0%", transformPerspective: 1700 }}, 0);']
    if enter:
        js += [f'tl.fromTo("#{sid}-ph", {{ y: {y0 + H * 0.62:.0f}, scale: {s0 * 0.86:.4f}, rotationY: {sgn * 34}, rotationX: 16, rotationZ: {sgn * -5} }}, {{ y: {y0}, scale: {s0}, rotationY: {sgn * 11}, rotationX: 4, rotationZ: 0, duration: {ein}, ease: "expo.out" }}, 0);',
               f'tl.fromTo("#{sid}-floor", {{ scale: 1.04, y: 60 }}, {{ scale: 1.1, y: 0, duration: {ein}, ease: "expo.out" }}, 0);']
    else:
        ein = 0
        js += [f'tl.set("#{sid}-ph", {{ y: {y0}, scale: {s0}, rotationY: 0, rotationX: 0, rotationZ: 0 }}, 0);',
               f'tl.set("#{sid}-floor", {{ scale: {1.1 + 0.07 * (cam[0][1] - 1):.3f}, y: {(0.5 - cam[0][2]) * 150:.0f} }}, 0);']
    js.append(kin(f"#{sid}-t", 0.12, 0.07))
    if sub: js.append(f'tl.fromTo("#{sid}-sub", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }}, 0.7);')
    for i, c in enumerate(cam[1:]):
        at, z, fy = c[0], c[1], c[2]; d = c[3] if len(c) > 3 else 0.8
        sc, y = st(z, fy)
        js.append(f'tl.to("#{sid}-ph", {{ y: {y}, scale: {sc}, rotationY: 0, rotationX: 0, duration: {d}, ease: "power2.inOut" }}, {at});')
        js.append(f'tl.to("#{sid}-floor", {{ scale: {1.1 + 0.07 * (z - 1):.3f}, y: {(0.5 - fy) * 150:.0f}, duration: {d}, ease: "power2.inOut" }}, {at});')
    # Tramos quietos: la cámara sigue acercándose muy despacio (3 %) hasta el próximo movimiento o la salida.
    keys = [(ein, cam[0][1], cam[0][2])] + [(c[0] + (c[3] if len(c) > 3 else 0.8), c[1], c[2]) for c in cam[1:]]
    y_end = st(cam[-1][1], cam[-1][2])[1]
    for i, (t0, z, fy) in enumerate(keys):
        t1 = cam[i + 1][0] if i + 1 < len(cam) else dur - 0.32
        if drift and t1 - t0 > 1.0 and i > 0:
            sc, y = st(z * 1.03, fy)
            if i == len(keys) - 1: y_end = y
            js.append(f'tl.to("#{sid}-ph", {{ y: {y}, scale: {sc}, duration: {t1 - t0:.2f}, ease: "none" }}, {t0:.2f});')
    for j, r in enumerate(rings):
        js.append(f'tl.fromTo("#{sid}-r{j}", {{ opacity: 0, scale: 1.08 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "expo.out" }}, {r[0]});')
        js.append(f'tl.to("#{sid}-r{j}", {{ opacity: 0, duration: 0.2 }}, {r[1]});')
    for j, p in enumerate(panels):
        frm = "y: 90" if vertical else f"x: {-90 if side == 'right' else 90}"
        to = "y: 0" if vertical else "x: 0"
        js.append(f'tl.fromTo("#{sid}-p{j}", {{ opacity: 0, {frm}, scale: 0.92 }}, {{ opacity: 1, {to}, scale: 1, duration: 0.55, ease: "expo.out" }}, {p["at"]});')
        if p.get("out"): js.append(f'tl.to("#{sid}-p{j}", {{ opacity: 0, scale: 0.96, duration: 0.18, ease: "power2.in" }}, {p["out"]});')
    # Salida: el teléfono sigue de largo hacia arriba y el corte cae en su cuadro más rápido; el título sale por su máscara.
    ex = dur - 0.3
    if leave: js.append(f'tl.to("#{sid}-ph", {{ y: {y_end - H * 0.9:.0f}, rotationX: -10, duration: 0.3, ease: "power3.in" }}, {ex:.3f});')
    js.append(kout(f"#{sid}-t", ex))
    outs = "".join(f", #{sid}-p{j}" for j in range(len(panels)))
    js.append(f'tl.to("#{sid}-sub{outs}", {{ opacity: 0, duration: 0.16, ease: "power2.in" }}, {ex:.3f});')
    return scene(sid, dur, css, body, "\n".join(js))

TABLET_CSS = f""".tablet {{ position: absolute; padding: 16px; border-radius: 36px; background: #05080C; border: 2px solid {C['steel']}; box-shadow: 0 30px 60px -10px rgba(0,0,0,.55); }}
.tablet .scr {{ position: relative; width: 100%; height: 100%; border-radius: 20px; overflow: hidden; background: #0A0F1A; }}
.tablet .zoom {{ position: absolute; inset: 0; }}
.tablet video, .tablet img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}"""

def s_tablet(sid, dur, clips, title, sub=None, panels=(), focus=None, keys=(), still=None, desc=None):
    """La pantalla de rutinas real (tablet apaisada, 1280×800 grabada a 2×) con el título arriba y los paneles al costado.
    `desc`: qué pasa en la grabación, para la pista de descripción (tools/describe.py); no se ve.
    `focus`: acercamiento de cámara dentro de la pantalla, dict(x=%, y=%, s=escala, at=s, d=duración[, out=s][, drift=factor]).
    `keys`: momentos (s) en que se toca una tecla del teclado en pantalla (sonido de tecla)."""
    KIND[sid] = "tablet"
    vertical = H > W
    if vertical:
        tw, tl_, tt = 1000, 40, 700
        css_t = f"""#{sid}-t {{ position: absolute; left: 70px; top: 170px; width: {W-140}px; }}
#{sid}-sub {{ position: absolute; left: 70px; top: {1400 if panels else 560}px; width: {W-140}px; }}"""
        panels = [dict(p, x=70, y=1390) for p in panels]
    else:
        tw, tl_, tt = 1120, 110, 290
        css_t = f"""#{sid}-t {{ position: absolute; left: 110px; top: 76px; width: 1700px; font-size: 104px; }}
#{sid}-sub {{ position: absolute; left: 1290px; top: {720 if panels else 360}px; width: 530px; }}"""
        panels = [dict(p, x=1290, y=360) for p in panels]
    th = (tw - 36) * 800 / 1280 + 36
    css = TABLET_CSS + PHONE_CSS + css_t + f"""
#{sid}-tab {{ left: {tl_}px; top: {tt}px; width: {tw}px; height: {th:.0f}px; }}
.{sid}-pn {{ max-width: {W - 140 if vertical else 600}px; }}"""
    for p in panels: HINTS.append((sid, p["at"]))
    for k in keys: KEYS.append((sid, k))
    PRECUTS.append((sid, clips, dur, (1920, 1200)))
    vids = [f'<img src="assets/media/cut-{sid}.jpg" alt="">',
            f'<video id="{sid}-v" class="clip" src="assets/media/cut-{sid}.mp4" muted playsinline data-start="0" data-duration="{dur}" data-track-index="2"></video>']
    if still: vids = [f'<img src="assets/media/{still}" alt="">']
    pnl = []
    for j, p in enumerate(panels):
        pnl.append(f'<div id="{sid}-p{j}" class="panel {sid}-pn" style="left:{p["x"]}px;top:{p["y"]}px"><small>{p["k"]}</small><b class="{p.get("cls", "")}">{p["v"]}</b>{f"<p>{p["why"]}</p>" if p.get("why") else ""}</div>')
    body = f"""{floor_svg(sid, draw=False)}
<div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(11,15,20,.92) 0%, rgba(11,15,20,.7) 45%, rgba(11,15,20,.5) 100%)"></div>
<div id="{sid}-tab" class="tablet"><div class="scr"><div id="{sid}-zoom" class="zoom" data-layout-allow-overflow>{"".join(vids)}</div></div></div>
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(title)}</h2>
{f'<p id="{sid}-sub" class="s clip" data-start="0" data-duration="{dur}">{sub}</p>' if sub else ""}
{"".join(pnl)}"""
    js = [f'tl.fromTo("#{sid}-tab", {{ y: 160, filter: "blur(14px)" }}, {{ y: 0, filter: "blur(0px)", duration: 0.6, ease: "expo.out" }}, 0);',
          f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 0.2);']
    if sub: js.append(f'tl.fromTo("#{sid}-sub", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.2 }}, 0.9);')
    if focus:
        js.append(f'tl.set("#{sid}-zoom", {{ transformOrigin: "{focus["x"]}% {focus["y"]}%" }}, 0);')
        js.append(f'tl.fromTo("#{sid}-zoom", {{ scale: 1 }}, {{ scale: {focus["s"]}, duration: {focus.get("d", 0.9)}, ease: "power2.inOut" }}, {focus["at"]});')
        if focus.get("out"): js.append(f'tl.to("#{sid}-zoom", {{ scale: 1, duration: 0.7, ease: "power2.inOut" }}, {focus["out"]});')
        elif focus.get("drift"):  # tramo quieto después del acercamiento: sigue acercándose muy despacio hasta la salida
            t0 = focus["at"] + focus.get("d", 0.9)
            js.append(f'tl.to("#{sid}-zoom", {{ scale: {focus["s"] * focus["drift"]:.3f}, duration: {dur - 0.32 - t0:.2f}, ease: "none" }}, {t0:.2f});')
    for j, p in enumerate(panels):
        js.append(f'tl.fromTo("#{sid}-p{j}", {{ opacity: 0, x: {-80 if vertical else 80}, scale: 0.9 }}, {{ opacity: 1, x: 0, scale: 1, duration: 0.55, ease: "expo.out" }}, {p["at"]});')
        if p.get("out"): js.append(f'tl.to("#{sid}-p{j}", {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {p["out"]});')
    js.append(f'tl.to("#{sid}-tab, #{sid}-t, #{sid}-sub, .{sid}-pn", {{ x: {-W}, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }}, {dur - 0.32});')
    return scene(sid, dur, css, body, "\n".join(js))

def s_arrive(sid, dur, title):
    """La sala desde arriba: el socio (punto cian) entra por recepción y camina hasta la pantalla de rutinas del gimnasio,
    que se enciende cuando llega. El equipo (turquesa) en su lugar."""
    KIND[sid] = "arrive"; HINTS.append((sid, 2.3))
    vertical = H > W
    a = (0.2 * W, 0.80 * H) if vertical else (0.17 * W, 0.86 * H)
    m = (0.2 * W, 0.56 * H) if vertical else (0.17 * W, 0.58 * H)
    s = (0.62 * W, 0.40 * H) if vertical else (0.44 * W, 0.40 * H)
    css = f""".pd {{ position: absolute; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; background: {C['cyan']}; }}
.pd.st {{ background: {C['teal']}; }}
#{sid}-scr {{ position: absolute; left: {s[0] - 70}px; top: {s[1] - 110}px; width: 140px; height: 90px; border-radius: 12px; border: 4px solid {C['white']}; background: {C['steel']}; }}
#{sid}-on {{ position: absolute; inset: 8px; border-radius: 6px; background: {C['white']}; opacity: 0; }}
#{sid}-tag {{ position: absolute; left: {s[0] + 90}px; top: {s[1] - 104}px; padding: 14px 20px; border-radius: 16px; background: {C['surface']}; border: 2px solid {C['teal']}; font: 700 34px "Barlow Condensed"; text-transform: uppercase; white-space: nowrap; }}
#{sid}-ring {{ position: absolute; left: {s[0] - 50}px; top: {s[1] - 50}px; width: 100px; height: 100px; border-radius: 50%; border: 3px solid {C['cyan']}; opacity: 0; }}
#{sid}-t {{ position: absolute; left: 60px; right: 60px; bottom: {150 if vertical else 90}px; text-align: center; }}
#{sid}-shade {{ position: absolute; inset: 0; background: linear-gradient(0deg, rgba(11,15,20,.95) 0%, rgba(11,15,20,0) 40%); }}"""
    if vertical: css += f"\n#{sid}-tag {{ left: {s[0] - 200}px; top: {s[1] - 220}px; }}"
    staff = [(0.78 * W, 0.30 * H), (0.30 * W, 0.22 * H)] if vertical else [(0.70 * W, 0.28 * H), (0.30 * W, 0.24 * H)]
    dots = "".join(f'<div id="{sid}-s{i}" class="pd st" style="left:{x:.0f}px;top:{y:.0f}px"></div>' for i, (x, y) in enumerate(staff))
    body = f"""{floor_svg(sid, draw=False)}
{dots}
<div id="{sid}-scr"><div id="{sid}-on"></div></div>
<div id="{sid}-tag" class="clip" data-start="0" data-duration="{dur}">Pantalla de rutinas</div>
<div id="{sid}-ring" class="clip" data-start="0" data-duration="{dur}"></div>
<div id="{sid}-me" class="pd clip" data-start="0" data-duration="{dur}" style="left:{a[0]:.0f}px;top:{a[1]:.0f}px"></div>
<div id="{sid}-shade"></div>
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(title)}</h2>"""
    js = [f'tl.fromTo("#{sid}-s0, #{sid}-s1", {{ scale: 0 }}, {{ scale: 1, duration: 0.4, ease: "back.out(2)", stagger: 0.08 }}, 0.1);',
          f'tl.fromTo("#{sid}-scr", {{ opacity: 0, scale: 0.8 }}, {{ opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }}, 0.15);',
          f'tl.fromTo("#{sid}-tag", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }}, 0.35);',
          f'tl.fromTo("#{sid}-me", {{ scale: 0 }}, {{ scale: 1, duration: 0.35, ease: "back.out(2)" }}, 0.3);',
          f'tl.to("#{sid}-me", {{ x: {m[0] - a[0]:.0f}, y: {m[1] - a[1]:.0f}, duration: 0.8, ease: "power1.inOut" }}, 0.6);',
          f'tl.to("#{sid}-me", {{ x: {s[0] - a[0]:.0f}, y: {s[1] - a[1]:.0f}, duration: 0.85, ease: "power2.inOut" }}, 1.4);',
          f'tl.fromTo("#{sid}-ring", {{ scale: 0.4, opacity: 0 }}, {{ scale: 2.4, duration: 0.9, ease: "expo.out", keyframes: {{ opacity: [0, 0.9, 0] }} }}, 2.25);',
          f'tl.fromTo("#{sid}-on", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.25 }}, 2.3);',
          f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 0.3);',
          f'tl.to("#{sid}-t", {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {dur - 0.25});']
    return scene(sid, dur, css, body, "\n".join(js))

def s_network(sid, dur, title, t1=1.0, t2=2.45):
    """La sala entera: socios y equipo moviéndose, un pedido que viaja del socio al entrenador y vuelve «Voy»."""
    KIND[sid] = "network"; HINTS.append((sid, t1)); HINTS.append((sid, t2))
    import random
    rnd = random.Random(7)
    dots = []
    css = f""".pd {{ position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: {C['cyan']}; }}
.pd.st {{ background: {C['teal']}; width: 30px; height: 30px; margin: -15px 0 0 -15px; }}
#{sid}-t {{ position: absolute; left: 0; right: 0; bottom: 90px; text-align: center; }}
#{sid}-tag1, #{sid}-tag2 {{ position: absolute; padding: 14px 20px; border-radius: 16px; background: {C['surface']}; font: 700 46px "Barlow Condensed"; text-transform: uppercase; white-space: nowrap; }}
#{sid}-tag1 {{ border: 2px solid {C['cyan']}; }}
#{sid}-tag2 {{ border: 2px solid {C['teal']}; }}
#{sid}-pulse {{ position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-world {{ position: absolute; inset: 0; transform-origin: 40% 45%; }}
#{sid}-shade {{ position: absolute; inset: 0; background: linear-gradient(0deg, rgba(11,15,20,.97) 0%, rgba(11,15,20,.97) 24%, rgba(11,15,20,0) 46%); }}"""
    js = [f'tl.fromTo("#{sid}-world", {{ scale: 1.5 }}, {{ scale: 1.08, duration: 1.3, ease: "expo.out" }}, 0);',
          f'tl.to("#{sid}-world", {{ scale: 1.0, duration: {dur - 1.3:.2f}, ease: "none" }}, 1.3);']
    pts = [(-6, 1.2), (-2, 1.2), (2, -3.6), (7, -5.6), (11, -1.6), (15, -5.6), (-5, 6.8), (2.5, 6.8), (-9, 4), (11, 2.2), (-2, -3.6), (7, 2)]
    for i, (x, z) in enumerate(pts):
        dots.append(f'<div id="{sid}-d{i}" class="pd" style="left:{PX(x)}px;top:{PZ(z)}px"></div>')
        dx, dz = rnd.uniform(-2.5, 2.5) * M, rnd.uniform(-1.5, 1.5) * M
        js.append(f'tl.fromTo("#{sid}-d{i}", {{ scale: 0 }}, {{ scale: 1, duration: 0.4, ease: "back.out(2)" }}, {0.1 + i * 0.05:.2f});')
        js.append(f'tl.to("#{sid}-d{i}", {{ x: {dx:.0f}, y: {dz:.0f}, duration: {dur - 1:.2f}, ease: "sine.inOut" }}, 0.6);')
    staff = [(-14, -3), (-12, 9.5), (13, 8)]
    for i, (x, z) in enumerate(staff):
        dots.append(f'<div id="{sid}-s{i}" class="pd st" style="left:{PX(x)}px;top:{PZ(z)}px"></div>')
        js.append(f'tl.fromTo("#{sid}-s{i}", {{ scale: 0 }}, {{ scale: 1, duration: 0.4, ease: "back.out(2)" }}, {0.5 + i * 0.08:.2f});')
    a, b = (PX(-2), PZ(1.2)), (PX(-14), PZ(-3))
    body = f"""<div id="{sid}-world" data-layout-allow-overflow>{floor_svg(sid, draw=False)}
{"".join(dots)}
<div id="{sid}-pulse" class="clip" data-start="0" data-duration="{dur}" style="left:{a[0]}px;top:{a[1]}px"></div>
<div id="{sid}-tag1" class="clip" data-start="0" data-duration="{dur}" style="left:{a[0] + 30}px;top:{a[1] - 100}px">Que venga alguien</div>
<div id="{sid}-tag2" class="clip" data-start="0" data-duration="{dur}" style="left:{b[0] - 40}px;top:{b[1] - 110}px">Voy</div>
</div>
<div id="{sid}-shade"></div>
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(title)}</h2>"""
    js += [f'tl.fromTo("#{sid}-tag1", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }}, {t1});',
           f'tl.fromTo("#{sid}-pulse", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.1 }}, {t1 + 0.2:.2f});',
           f'tl.to("#{sid}-pulse", {{ x: {b[0] - a[0]}, y: {b[1] - a[1]}, duration: {t2 - t1 - 0.35:.2f}, ease: "power2.inOut" }}, {t1 + 0.3:.2f});',
           f'tl.fromTo("#{sid}-tag2", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }}, {t2});',
           f'tl.to("#{sid}-pulse", {{ backgroundColor: "{C["teal"]}", x: 0, y: 0, duration: 1.0, ease: "power2.inOut" }}, {t2 + 0.15:.2f});',
           f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 0.4);']
    return scene(sid, dur, css, body, "\n".join(js))

KICK_CSS = "\n#{sid}-k {{ position: absolute; left: 0; right: 0; top: {top}px; text-align: center; font: 700 60px/1 \"Barlow Condensed\"; text-transform: uppercase; letter-spacing: 0.1em; color: " + C["white"] + "; margin: 0; }}"

def s_end(sid, dur, claim, url, kicker=None):
    """Los puntos de la sala convergen en uno, que sube a su lugar sobre la «ı» del wordmark (a su tamaño nítido, 400 px,
    con aire alrededor). Debajo, la frase grande palabra por palabra y la dirección.
    Con `kicker` (p. ej. «REPI Control»), el nombre del modo va entre el wordmark y la frase."""
    KIND[sid] = "end"
    vertical = H > W
    ww = WM_W
    long = len(re.sub(r"[*_]", "", claim)) > 30
    fs = (96 if long else 150) if not vertical else (104 if long else 150)
    lines = 1 if not long and not vertical else (2 if not vertical or not long else 4)
    block = 196 + (110 if kicker else 0) + 70 + lines * fs * 0.9 + 70 + 70
    wt = H / 2 - block / 2 - (40 if vertical else 10)
    kt_ = wt + 196 + 56
    tt = wt + 196 + (110 if kicker else 0) + 70
    ut = tt + lines * fs * 0.9 + 70
    ufs = 60 if (not vertical or len(url) <= 28) else 46
    css = WM_CSS + KT_CSS + f""".cd {{ position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-wm {{ left: {W/2-ww/2}px; top: {wt}px; }}{KICK_CSS.format(sid=sid, top=kt_) if kicker else ""}
#{sid}-t {{ position: absolute; left: {160 if not vertical else 70}px; right: {160 if not vertical else 70}px; top: {tt}px; text-align: center; font-size: {fs}px; }}
#{sid}-u {{ position: absolute; left: 0; right: 0; top: {ut}px; text-align: center; font: 600 {ufs}px "Barlow"; color: {C['white']}; }}
#{sid}-u span {{ border-bottom: 4px solid {C['cyan']}; padding-bottom: 8px; }}"""
    import random
    rnd = random.Random(3)
    dots, js = [], []
    dot_x, dot_y = W / 2 - ww / 2 + ww * 0.8892 + ww * 0.1012 / 2, wt + (ww * 154 / 315) * 0.0158 + ww * 0.1012 / 2
    for i in range(14):
        x, y = rnd.uniform(160, W - 160), rnd.uniform(120, H - 120)
        dots.append(f'<div id="{sid}-c{i}" class="cd" style="left:{x:.0f}px;top:{y:.0f}px"></div>')
        js.append(f'tl.fromTo("#{sid}-c{i}", {{ x: 0, y: 0, opacity: 1 }}, {{ x: {W/2 - x:.0f}, y: {H/2 - y:.0f}, duration: 0.5, ease: "power3.inOut" }}, {0.02 * i:.2f});')
        js.append(f'tl.to("#{sid}-c{i}", {{ opacity: 0, duration: 0.05 }}, {0.5 + 0.02 * i:.2f});')
    body = f"""{floor_svg(sid, draw=False)}
<div id="{sid}-shade" style="position:absolute;inset:0;background:{C['navy']}"></div>
{"".join(dots)}
<div id="{sid}-hero" class="cd" style="left:{W/2}px;top:{H/2}px;width:56px;height:56px;margin:-28px 0 0 -28px"></div>
{wordmark(sid, ww)}{f'{chr(10)}<p id="{sid}-k" class="clip" data-start="0" data-duration="{dur}">{html.escape(kicker)}</p>' if kicker else ""}
<h2 id="{sid}-t" class="h kt clip" data-start="0" data-duration="{dur}">{kwords(claim)}</h2>
<p id="{sid}-u" class="clip" data-start="0" data-duration="{dur}"><span>{url}</span></p>"""
    if kicker: js.append(f'tl.fromTo("#{sid}-k", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }}, 1.2);')
    js += [f'tl.fromTo("#{sid}-shade", {{ opacity: 0.2 }}, {{ opacity: 1, duration: 0.6 }}, 0);',
           f'tl.fromTo("#{sid}-hero", {{ scale: 0 }}, {{ scale: 1, duration: 0.22, ease: "back.out(2)" }}, 0.45);',
           f'tl.to("#{sid}-hero", {{ x: {dot_x - W/2:.0f}, y: {dot_y - H/2:.0f}, scale: {ww*0.1012/56:.3f}, duration: 0.5, ease: "power3.inOut" }}, 0.68);',
           f'tl.fromTo("#{sid}-wm img", {{ clipPath: "inset(0 100% 0 0)" }}, {{ clipPath: "inset(0 0% 0 0)", duration: 0.5, ease: "power3.out" }}, 0.85);',
           f'tl.set("#{sid}-wmdot", {{ opacity: 0 }}, 0);',
           f'tl.set("#{sid}-wmdot", {{ opacity: 1 }}, 1.18);',
           f'tl.set("#{sid}-hero", {{ opacity: 0 }}, 1.18);',
           kin(f"#{sid}-t", 1.15, 0.07),
           f'tl.fromTo("#{sid}-u", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }}, 1.75);']
    return scene(sid, dur, css, body, "\n".join(js))

def s_statement(sid, dur, title, sub=None, img=None):
    """Un enunciado grande sobre la sala (oscurecida), con frase y, opcionalmente, una placa clara con un logo real."""
    KIND[sid] = "statement"
    if img: HINTS.append((sid, 0.6))
    css = f"""#{sid}-floor {{ transform-origin: 50% 50%; }}
#{sid}-c {{ position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 40px; padding: 0 {120 if W > H else 70}px; text-align: center; }}
#{sid}-shade {{ position: absolute; inset: 0; background: radial-gradient(ellipse 70% 60% at 50% 50%, rgba(11,15,20,.9), rgba(11,15,20,.45) 80%); }}
#{sid}-img {{ padding: 30px 50px; border-radius: 26px; background: {C['navy']}; border: 2px solid {C['steel']}; box-shadow: 0 30px 60px -20px rgba(0,0,0,.55); }}
#{sid}-img img {{ display: block; width: 420px; }}"""
    body = f"""{floor_svg(sid, draw=False)}
<div id="{sid}-shade"></div>
<div id="{sid}-c">
{f'<div id="{sid}-img"><img src="assets/brand/{img}" alt=""></div>' if img else ""}
<h2 id="{sid}-t" class="h">{words(title)}</h2>
{f'<p id="{sid}-sub" class="s">{sub}</p>' if sub else ""}
</div>"""
    js = [f'tl.fromTo("#{sid}-floor", {{ scale: 1.08 }}, {{ scale: 1.0, duration: {dur}, ease: "none" }}, 0);',
          f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, y: 30, filter: "blur(6px)" }}, {{ opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: "expo.out", stagger: 0.08 }}, 0.15);']
    if img: js.append(f'tl.fromTo("#{sid}-img", {{ opacity: 0, scale: 0.85 }}, {{ opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.6)" }}, 0.6);')
    if sub: js.append(f'tl.fromTo("#{sid}-sub", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.25 }}, 1.0);')
    js.append(f'tl.to("#{sid}-c", {{ x: {-W}, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }}, {dur - 0.32});')
    return scene(sid, dur, css, body, "\n".join(js))

# ── Guiones ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def beats(b, counts, tail=0.0):
    """Duración de cada escena para que cada corte caiga en un pulso de la música: `counts` pulsos por escena, pulso `b` s
    (tools/beats.py). Cada inicio se calcula desde su índice (no se acumula el redondeo); `tail` alarga la última."""
    out, k = [], 0
    for c in counts:
        a = round(k * b, 2); k += c; out.append(round(round(k * b, 2) - a, 2))
    out[-1] = round(out[-1] + tail, 2)
    return out

# Grabaciones HD (tools/rec-hd.mjs, demo local con datos ficticios, 1170×2532): m-serie (Press de banca: REPI recomienda
# 53 kg × 8, anterior 53 kg × 9; el socio hace 5 y la próxima pasa a 50 kg × 8–10), f-turno (la profesora de sala toca «Voy» en el
# pedido de Julián), o-sala (Seguimiento de sala del dueño: 16 pedidos, 12 resueltos, pedidos y resueltos por semana).
# Fracciones de pantalla (cam, rings) medidas sobre esas grabaciones: si se regraban, se vuelven a medir.
M_SERIE = [("m-serie.mp4", 6.6, 0, 3.3), ("m-serie.mp4", 10.3, 3.3, 6.0)]  # baja las repeticiones a 5 (≈1,0–2,3 s) y completa (≈3,75 s)
ROW_REC = (0.276, 0.321, 0.06, 0.94)  # fila «REPI recomienda»
CARD_REC = dict(at=1.4, k="REPI recomienda", v="53 kg × 8", cls="a", out=3.55)
CARD_ADJ = dict(at=4.4, k="Hizo 5 de 8. La próxima", v="50 kg × 8–10", cls="t", why="Bajá un poco la carga y priorizá completar el rango.")

def shot_serie(s, d, title, side="right", leave=True, drift=True):
    return s_shot(s, d, M_SERIE, title, side=side, leave=leave, drift=drift,
        cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.9, 0.33, 0.85), (2.7, 1.75, 0.52, 0.6), (4.0, 1.85, 0.40, 0.7)],
        rings=[(1.6, 2.7, *ROW_REC), (4.6, d - 0.35, *ROW_REC)], panels=[CARD_REC, CARD_ADJ],
        desc="Press de banca, serie 1: la fila «REPI recomienda» dice 53 kg × 8 y «Anterior», 53 kg × 9. El socio baja las repeticiones a 5 y completa la serie; la recomendación pasa a 50 kg × 8–10, con la razón escrita, y arranca el descanso de 2 minutos.")

def shot_voy(s, d, title, side="left"):
    return s_shot(s, d, [("f-turno.mp4", 0.8, 0, d)], title, side=side,
        cam=[(0, 1.0, 0.5, 0.7), (0.75, 2.0, 0.60, 0.85)], rings=[(1.5, 3.6, 0.545, 0.678, 0.085, 0.915)],
        panels=[dict(at=1.0, k="Julián Ortiz · Sentadilla", v="Pide un entrenador", cls="a", out=2.5),
                dict(at=2.65, k="Sofía Ramírez responde", v="Voy", cls="t")],
        desc="Inicio de la profesora de sala: en «En sala ahora», Julián Ortiz, en Sentadilla, pide que venga un entrenador. Ella toca «Voy» y el pedido queda a su nombre.")

def shot_seguimiento(s, d, title, side="right"):
    return s_shot(s, d, [("o-sala.mp4", 0.4, 0, 2.5), ("o-sala.mp4", 2.9, 2.5, 0.5, 2.0), ("o-sala.mp4", 3.9, 3.0, 3.9)], title, side=side,
        cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.9, 0.33, 0.85), (2.5, 1.75, 0.45, 0.6)], rings=[(3.4, d - 0.35, 0.40, 0.63, 0.03, 0.97)],
        panels=[dict(at=1.0, k="Seguimiento de sala · 30 días", v="12 de 16 resueltos", cls="a", out=2.7),
                dict(at=3.2, k="Semana a semana", v="Pedidos y resueltos", cls="t")],
        desc="Vista del dueño «Seguimiento de sala», 30 días: 16 pedidos recibidos y 12 resueltos. Baja hasta los gráficos de pedidos y resueltos por semana y el estado actual.")

def brand(size):
    """Film de marca 4.0: apertura de 7,4 s (el logo cae en el golpe fuerte de la pista), tres planos de producto con cámara
    (socio, profesora de sala, dueño), la sala conectada y el cierre. Cortes en el pulso (65 bpm, tools/beats.py)."""
    vertical = size[1] > size[0]
    D = beats(0.9231, [3, 5, 3, 9, 6, 6, 4, 5], tail=0.6)
    return dict(
        title="REPI · Cada repetición cuenta", dur=round(sum(D), 2), size=size, music=("heroic-age.mp3", 45.23), sfx="auto", poster=16.0,
        scenes=[
            ("dot", D[0], lambda s, d: s_dot(s, d, "En la sala, todos los días.")),
            ("scatter", D[1], lambda s, d: s_scatter(s, d, "Cada dato, _en_ _otro_ _lado._", "Hasta que *todo* se conecta.", 2.5, calls=None, appear=0.16, appear0=0.1, t1_at=0.25, waves=1, fly_lead=0.8, wave_at=0.55)),
            ("logo", D[2], lambda s, d: s_logo(s, d, "_Cada_ _repetición_ cuenta.")),
            ("member", D[3], lambda s, d: shot_serie(s, d, "Un objetivo para *cada* serie.")),
            ("coach", D[4], lambda s, d: shot_voy(s, d, "El equipo sabe *a* *quién* atender.")),
            ("owner", D[5], lambda s, d: shot_seguimiento(s, d, "El dueño *ve* su sala.")),
            ("network", D[6], (lambda s, d: s_statement(s, d, "Socios, equipo y gimnasio. *Conectados.*")) if vertical else (lambda s, d: s_network(s, d, "Socios, equipo y gimnasio. *Conectados.*", t1=0.7, t2=1.9))),
            ("end", D[7], lambda s, d: s_end(s, d, "_Cada_ _repetición_ *cuenta.*", "repiclub.com/conoce")),
        ])

FILMS = {"brand": brand((1920, 1080)), "brand-vertical": brand((1080, 1920))}

# Fragmentos de la sala para cada público (texto ilustrativo de cómo se trabaja hoy; ninguna cifra).
FRAGS_GYM = [("paper", 130, 90, -5, "<small>Recepción</small>Alta: Camila R.<br>Rutina: ¿?<br><s>Acceso ¿?</s>"),
             ("chat", 1330, 120, 3, "<small>Grupo socios · 07:10</small>¿Quién me arma la rutina?"),
             ("", 1300, 790, -2, "<small>planilla_altas.xlsx</small>Sin actualizar"),
             ("alert", 200, 800, 4, "<small>Pedido de ayuda</small>Nadie lo vio"),
             ("", 760, 60, -3, "<small>Seguimiento de sala</small>— sin datos —")]
END = lambda claim, url: (lambda s, d: s_end(s, d, claim, url))
LOGO = lambda s, d: s_logo(s, d, "_Cada_ _repetición_ cuenta.")

# ── Segunda tanda 4.0 (13/11/2026): perfiles y funciones que seguían con el kit 3.0 ─────────────────────────────────────
# Grabaciones HD nuevas (tools/rec-hd.mjs, sesiones `member2` y `owner2`, demo local con datos ficticios):
#   m-checkin  «¿Cómo llegás hoy?»: energía 4, sueño 3, ánimo 4 y «Empezar entrenamiento».
#   m-prog2    Progreso (90 días: 6 sesiones, 82 series, 716 repeticiones) → mejores marcas → Evolución por ejercicio de
#              Press de banca (mayor carga 53 kg, mejor serie 53 kg × 9, 1RM estimado 68,9 kg) → el gráfico.
#   m-cuerpo   Mi cuerpo: 84 kg inicial, 80,4 kg actual, objetivo 76 kg → Evolución del peso.
#   m-ayuda    La socia (Valentina) pide «Ayuda con un ejercicio» al equipo de sala de Gym Norte, con «¿Me miran la técnica?».
#   s-sala     La profesora de sala (Sofía Ramírez) de ESA MISMA demo ve el pedido T-1115 en «Sala › Pendientes» y toca «Tomar».
#   s-mio      El pedido en «Para vos», asignado a Sofía Ramírez.      m-pedido  La socia ve «Tu pedido: asignada · Sofía».
#   o-qr       «Solicitudes de acceso» → «Mostrar QR de la sede» (QR para sumarse · Palermo).
#   o-alta2    En esa misma demo, la aprobación de Camila Ruiz (igual que o-altas, con el mismo código de solicitud que o-qr).
#   j-unirse   Lo que abre ese QR en el teléfono del socio: «Pedí tu acceso a REPI · Gym Norte · Palermo».
# Fracciones de pantalla (cam, rings) y tiempos medidos sobre esas grabaciones: si se regraban, se vuelven a medir.
def shot_cuerpo(s, d, title, side="right"):
    return s_shot(s, d, [("m-cuerpo.mp4", 0.6, 0, d)], title, side=side,
        cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.27, 0.8), (2.45, 1.7, 0.47, 0.9)], rings=[(1.5, 2.4, 0.19, 0.29, 0.03, 0.97)],
        panels=[dict(at=1.0, k="Peso actual · objetivo 76 kg", v="80,4 kg", cls="a", out=3.25),
                dict(at=3.5, k="Privado", v="Sólo lo ves vos", cls="t")],
        desc="Progreso › Mi cuerpo. «Objetivo»: 84 kg inicial, 80,4 kg actual y 76 kg de objetivo. Baja a «Evolución del peso», con la línea del objetivo. Arriba, la pantalla aclara: «Privado: sólo lo ves vos».")

def deportistas(size):
    """Perfil deportistas 4.0 (≈ 38 s, 16:9 y 9:16): abre con el producto en el primer segundo (sin placa previa), seis planos con
    cámara y un solo cierre. Pulso 0,3871 s (155 bpm); el tramo arranca en 24,371 s (pulso 0 en el cuadro 0), la banda entra
    en el corte al check-in (pulso 14) y la pista afloja en el corte al cierre (pulso 84). Frases de 7 pulsos."""
    D = beats(0.3871, [14, 14, 21, 7, 14, 14, 13], tail=0.6)
    return dict(
        title="REPI para deportistas", dur=round(sum(D), 2), size=size, music=("volatile-reaction.mp3", 24.371), sfx="auto", poster=13.4,
        scenes=[
            ("home", D[0], lambda s, d: s_shot(s, d, [("m-home.mp4", 0.2, 0, d, 0.6)], "Tu rutina, *lista.*",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.38, 0.8), (3.75, 1.6, 0.42, 1.3)], rings=[(1.5, 3.6, 0.305, 0.483, 0.045, 0.955)],
                desc="Inicio de la app de Valentina: «Próximo entrenamiento: Torso A, 4 ejercicios, 16 series». Baja hasta lo que REPI le propone.", panels=[
                dict(at=1.2, k="Próximo entrenamiento", v="Torso A", cls="a")])),
            ("checkin", D[1], lambda s, d: s_shot(s, d, [("m-checkin.mp4", 0.9, 0, d, 1.25)], "¿Cómo *llegás* hoy?", side="left",
                cam=[(0, 1.0, 0.5, 0.6), (0.7, 1.7, 0.74, 0.7), (4.3, 1.25, 0.42, 0.7)],
                desc="Toca «Comenzar entrenamiento». Antes de empezar, tres toques: energía 4, sueño 3 y ánimo 4. Toca «Empezar entrenamiento» y se abre Torso A.", panels=[
                dict(at=1.3, k="Antes de empezar, tres toques", v="Energía, sueño y ánimo", cls="t", out=4.35)])),
            ("serie", D[2], lambda s, d: shot_serie(s, d, "Un objetivo para *cada* serie.", leave=False, drift=False)),
            ("rest", D[3], lambda s, d: s_shot(s, d, [("m-serie.mp4", round(10.3 + D[2] - 3.3, 2), 0, d)], "El descanso *corre* *solo.*", enter=False, drift=False,
                cam=[(0, 1.85, 0.40), (0.12, 1.85, 0.62, 0.6)], rings=[(0.75, d - 0.35, 0.565, 0.665, 0.03, 0.97)],
                desc="Al completar la serie, el descanso de 2 minutos ya está corriendo en la misma pantalla.", panels=[
                dict(at=0.6, k="Al completar la serie", v="Descanso en marcha", cls="t")])),
            ("progress", D[4], lambda s, d: s_shot(s, d, [("m-prog2.mp4", 4.2, 0, d)], "Tu progreso, *a* *la* *vista.*", side="left",
                cam=[(0, 1.0, 0.5, 0.7), (0.95, 1.8, 0.27, 0.8), (4.3, 1.7, 0.42, 0.8)], rings=[(1.9, 4.25, 0.175, 0.325, 0.04, 0.97)],
                desc="Progreso › Evolución por ejercicio de Press de banca: mayor carga registrada 53 kg, mejor serie 53 kg × 9 y 1RM estimado 68,9 kg. Baja al gráfico.", panels=[
                dict(at=1.6, k="Press de banca · mejor serie", v="53 kg × 9", cls="a")])),
            ("body", D[5], lambda s, d: shot_cuerpo(s, d, "Tu cuerpo, *con* *tus* *datos.*")),
            ("end", D[6], END("Probá *la* *demo.*", "repiclub.com/conoce/deportistas")),
        ])

def entrenadores():
    """Perfil entrenadores 4.0 (≈ 41 s): abre con la lista de clientes (sin la apertura de tarjetas ni placa de logo), cinco
    planos con cámara sobre la app del entrenador y la serie del alumno. Pulso 0,6667 s (90 bpm, compás de 3: cortes cada
    3 pulsos); el pico de la pista cae en la serie (24–32 s) y afloja en el corte a «REPI propone. Vos decidís»."""
    D = beats(0.6667, [9, 9, 9, 9, 12, 6, 7], tail=0.5)
    return dict(
        title="REPI para entrenadores", dur=round(sum(D), 2), music=("exciting-trailer.mp3", 4.0), sfx="auto", poster=22.6,
        scenes=[
            ("clients", D[0], lambda s, d: s_shot(s, d, [("c-clientes.mp4", 0.2, 0, 2.8, 0.75), ("c-clientes.mp4", 2.3, 2.8, round(d - 2.8, 2), 0.72)], "Todos tus alumnos, *de* *un* *vistazo.*", leave=False, drift=False,
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.52, 0.7), (2.9, 1.7, 0.80, 0.8)], rings=[(1.4, 2.55, 0.405, 0.485, 0.03, 0.97), (3.9, d - 0.3, 0.805, 0.935, 0.03, 0.97)],
                desc="«Clientes»: Julián Ortiz, sin programa; Martina López y Valentina Gómez, con «Hipertrofia · 3 días». Abre la ficha de Valentina: última sesión, hace 3 días.", panels=[
                dict(at=1.1, k="Julián Ortiz", v="Sin programa", cls="a", out=2.75),
                dict(at=3.6, k="Valentina Gómez · última sesión", v="Hace 3 días", cls="t")])),
            ("sesiones", D[1], lambda s, d: s_shot(s, d, [("c-clientes.mp4", 4.6, 0, d)], "Cada sesión, *serie* *por* *serie.*", enter=False, drift=False,
                cam=[(0, 1.7, 0.80), (0.05, 1.6, 0.45, 0.9), (1.9, 1.95, 0.36, 0.8)], rings=[(3.0, d - 0.35, 0.238, 0.433, 0.03, 0.97)],
                desc="En la ficha baja al registro de sesiones: en Torso B, Remo en polea figura con «+2,5 kg vs. la vez anterior», serie por serie.", panels=[
                dict(at=2.9, k="Valentina · Remo en polea", v="+2,5 kg", cls="a", why="Contra la vez anterior.")])),
            ("programs", D[2], lambda s, d: s_shot(s, d, [("c-programa.mp4", 1.7, 0, 1.9), ("c-programa.mp4", 5.9, 1.9, round(d - 1.9, 2))], "Tu programa, *a* *tu* *manera.*", side="left",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.7, 0.33, 0.8), (2.0, 1.9, 0.66, 1.0)], rings=[(3.6, d - 0.35, 0.675, 0.838, 0.03, 0.97)],
                desc="Abre su plantilla «Hipertrofia · 3 días», versión 1, y baja hasta el día Torso A: Press de banca, 4 series de 8 a 10 repeticiones, RIR 2 y 2 minutos de descanso.", panels=[
                dict(at=1.0, k="Programa · versión 1", v="Hipertrofia · 3 días", cls="a", out=3.1),
                dict(at=3.5, k="Torso A · Press de banca", v="4 × 8–10 · RIR 2", cls="t")])),
            ("asigna", D[3], lambda s, d: s_shot(s, d, [("c-asigna.mp4", 2.6, 0, d)], "Y lo *asignás.*",
                cam=[(0, 1.5, 0.5, 0.7), (3.45, 1.7, 0.72, 0.7)], rings=[(4.0, d - 0.35, 0.875, 0.988, 0.03, 0.97)],
                desc="En «Asignar Hipertrofia · 3 días» marca a Valentina Gómez y a Julián Ortiz y confirma. Aviso: «Programa asignado a Valentina, Julián. Lo verá en la app desde hoy».", panels=[
                dict(at=3.7, k="Programa asignado a", v="Valentina y Julián", cls="t")])),
            ("serie", D[4], lambda s, d: shot_serie(s, d, "Cada alumno entrena *con* *objetivo.*", side="left")),
            ("rule", D[5], lambda s, d: s_statement(s, d, "REPI propone. *Vos* *decidís.*", sub="Nada se asigna solo.")),
            ("end", D[6], END("Usalo *con* *tus* *alumnos.*", "repiclub.com/conoce/entrenadores")),
        ])

def aliados():
    """Perfil aliados 4.0 (≈ 48 s, antes 66,5): abre con la marca en el primer segundo, el modelo en una placa y tres planos de
    producto con cámara; el caso real lleva el logo autorizado de Smart Center Gym y la misma frase que /conoce («Ya funciona en
    Mar del Plata»). Pulso 0,531 s (113 bpm); el tramo arranca en 34,425 s y las frases son de 8 pulsos."""
    D = beats(0.531, [6, 10, 16, 12, 12, 8, 8, 8, 9], tail=0.6)
    return dict(
        title="REPI · Tecnología para el entrenamiento", dur=round(sum(D), 2), music=("rising-game.mp3", 34.425), sfx="auto", poster=10.9,
        scenes=[
            ("logo", D[0], lambda s, d: s_logo(s, d, "Tecnología *para* *entrenar.*")),
            ("model", D[1], lambda s, d: s_statement(s, d, "Gimnasios y entrenadores *la* *contratan.*", sub="Sus socios y alumnos la usan cada vez que entrenan.")),
            ("serie", D[2], lambda s, d: shot_serie(s, d, "Recomendaciones *que* *se* *explican.*")),
            ("coach", D[3], lambda s, d: s_shot(s, d, [("c-clientes.mp4", 0.2, 0, 2.8, 0.75), ("c-clientes.mp4", 2.3, 2.8, round(d - 2.8, 2), 0.64)], "Para entrenadores *independientes.*", side="left",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.52, 0.7), (2.9, 1.7, 0.80, 0.8)], rings=[(1.4, 2.55, 0.405, 0.485, 0.03, 0.97), (3.9, d - 0.35, 0.805, 0.935, 0.03, 0.97)],
                desc="App del entrenador, «Clientes»: Julián Ortiz, sin programa; Martina López y Valentina Gómez, con «Hipertrofia · 3 días». Abre la ficha de Valentina: última sesión, hace 3 días.", panels=[
                dict(at=1.1, k="Julián Ortiz", v="Sin programa", cls="a", out=2.75),
                dict(at=3.6, k="Valentina Gómez · última sesión", v="Hace 3 días", cls="t")])),
            ("owner", D[4], lambda s, d: shot_seguimiento(s, d, "Y para gimnasios, *por* *sede.*")),
            ("tech", D[5], lambda s, d: s_statement(s, d, "Registra *sin* *señal.* Se instala *sin* *tiendas.*")),
            ("proof", D[6], lambda s, d: s_statement(s, d, "Ya funciona *en* *Mar* *del* *Plata.*", img="smart-center-gym.webp")),
            ("network", D[7], lambda s, d: s_network(s, d, "Gimnasios, entrenadores y alumnos. *Conectados.*", t1=0.7, t2=1.9)),
            ("end", D[8], END("Proponé *una* *alianza.*", "repiclub.com/conoce/aliados")),
        ])

def progreso():
    """Progreso por ejercicio 4.0 (≈ 23 s): abre con el producto; un plano encadenado sobre Progreso (el resumen, las mejores
    marcas y la evolución de Press de banca) y Mi cuerpo. Pulso 0,3529 s (170 bpm); el tramo arranca en 150,338 s."""
    D = beats(0.3529, [16, 16, 18, 13], tail=0.6)
    return dict(
        title="Progreso por ejercicio", dur=round(sum(D), 2), music=("clash-defiant.mp3", 150.338), sfx="auto", poster=7.6,
        scenes=[
            ("prog", D[0], lambda s, d: s_shot(s, d, [("m-prog2.mp4", 0.2, 0, 2.6, 0.62), ("m-prog2.mp4", 1.81, 2.6, round(d - 2.6, 2))], "Tu progreso, *por* *ejercicio.*", leave=False, drift=False,
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.36, 0.8), (2.7, 1.7, 0.40, 0.7)], rings=[(1.5, 2.6, 0.31, 0.39, 0.04, 0.96), (3.8, 5.1, 0.20, 0.56, 0.03, 0.97)],
                desc="Progreso, últimos 90 días: 6 sesiones, 82 series y 716 repeticiones. Baja a «Tus mejores marcas del período», ejercicio por ejercicio.", panels=[
                dict(at=1.2, k="Últimos 90 días", v="6 sesiones · 82 series", cls="a", out=2.75),
                dict(at=3.7, k="Tus mejores marcas", v="Ejercicio por ejercicio", cls="t")])),
            ("evol", D[1], lambda s, d: s_shot(s, d, [("m-prog2.mp4", round(1.81 + D[0] - 2.6, 2), 0, d)], "Calculado con *lo* *que* registrás.", enter=False, drift=False,
                cam=[(0, 1.7, 0.40), (0.1, 1.8, 0.27, 0.6), (2.5, 1.8, 0.40, 0.6), (3.7, 1.7, 0.42, 0.9)], rings=[(0.9, 2.45, 0.175, 0.325, 0.42, 0.97), (2.9, 3.65, 0.34, 0.52, 0.03, 0.50)],
                desc="«Evolución por ejercicio» de Press de banca: mayor carga registrada 53 kg, mejor serie 53 kg × 9 y 1RM estimado 68,9 kg, con la aclaración «Estimación (Epley), no es una repetición que hiciste». Baja al gráfico.", panels=[
                dict(at=0.8, k="Press de banca · mejor serie", v="53 kg × 9", cls="a", out=2.6),
                dict(at=2.8, k="1RM estimado", v="68,9 kg", cls="t", why="Una estimación, no una repetición que hiciste.")])),
            ("body", D[2], lambda s, d: shot_cuerpo(s, d, "Tu cuerpo, *con* *tus* *datos.*", side="left")),
            ("end", D[3], END("Mirá *tu* *progreso.*", "repiclub.com/conoce/deportistas")),
        ])

def altas():
    """Altas por QR 4.0 (≈ 26 s): ahora se ve el QR de la sede y el lado del socio (lo que abre ese QR), y después la aprobación
    del equipo. Pulso 0,7895 s (76 bpm); el tramo arranca en 120,526 s y los cortes caen en los golpes (pulsos 6, 12, 22, 26)."""
    D = beats(0.7895, [6, 6, 10, 4, 6], tail=0.5)
    return dict(
        title="Altas por QR", dur=round(sum(D), 2), music=("five-armies.mp3", 120.526), sfx="auto", poster=3.9,
        scenes=[
            ("qr", D[0], lambda s, d: s_shot(s, d, [("o-qr.mp4", 0.9, 0, d)], "Un QR *por* *sede.*",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.6, 0.30, 0.6), (1.8, 1.75, 0.47, 0.8)], rings=[(2.8, d - 0.35, 0.325, 0.645, 0.18, 0.82)],
                desc="«Solicitudes de acceso», con el pedido pendiente de Camila Ruiz. Quien atiende toca «Mostrar QR de la sede»: se abre «QR para sumarse · Palermo», con Belgrano al lado. El correo de la solicitud está desenfocado.", panels=[
                dict(at=2.5, k="QR para sumarse", v="Palermo", cls="a")])),
            ("pide", D[1], lambda s, d: s_shot(s, d, [("j-unirse.mp4", 0.2, 0, d, 0.7)], "El socio lo escanea y *pide* *acceso.*", side="left",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.28, 0.8), (3.0, 1.8, 0.40, 0.7)], rings=[(1.6, 2.9, 0.295, 0.395, 0.03, 0.97)],
                desc="Lo que abre el QR en el teléfono del socio: «Pedí tu acceso a REPI», Gym Norte, Palermo, con los botones «Crear mi cuenta» y «Ya tengo cuenta REPI».", panels=[
                dict(at=1.3, k="Pedí tu acceso a REPI", v="Gym Norte · Palermo", cls="a")])),
            ("ok", D[2], lambda s, d: s_shot(s, d, [("o-alta2.mp4", 1.2, 0, d + 0.2)], "El equipo *confirma* quién es socio.",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.40, 0.7), (1.75, 1.6, 0.50, 0.6), (5.1, 1.8, 0.66, 0.8)], rings=[(6.0, d - 0.35, 0.66, 0.768, 0.03, 0.97)],
                desc="«Solicitudes de acceso»: Camila Ruiz pidió el alta con el QR de la sede. Quien atiende toca «Aprobar», elige «Lo conozco: es socio/a» y confirma. La solicitud pasa a «Resueltas», aprobada, en Palermo. El correo de la solicitud está desenfocado.", panels=[
                dict(at=0.9, k="Pedido de acceso", v="Camila Ruiz", cls="a", out=4.9),
                dict(at=5.5, k="El equipo confirmó · Palermo", v="Acceso aprobado", cls="t")])),
            ("rule", D[3], lambda s, d: s_statement(s, d, "Identidad *no* *es* pertenencia.", sub="El acceso siempre lo aprueba una persona.")),
            ("end", D[4], END("Quiero REPI *en* *mi* *gimnasio.*", "repiclub.com/conoce/gimnasios")),
        ])

def sala():
    """Seguimiento de sala 4.0 (≈ 27 s): un solo pedido seguido de punta a punta en la misma demo: la socia lo manda, la
    profesora de sala lo ve en «Pendientes» y lo toma, la socia ve quién lo tomó; y el gimnasio mide la respuesta.
    Pulso 0,3529 s (170 bpm); el tramo arranca en 0,338 s."""
    D = beats(0.3529, [20, 10, 8, 10, 14, 13], tail=0.6)
    return dict(
        title="Seguimiento de sala", dur=round(sum(D), 2), music=("clash-defiant.mp3", 0.338), sfx="auto", poster=9.3,
        scenes=[
            ("pide", D[0], lambda s, d: s_shot(s, d, [("m-ayuda.mp4", 1.3, 0, d, 1.15)], "El socio *pide* *ayuda* desde la app.",
                cam=[(0, 1.0, 0.5, 0.7), (0.8, 1.7, 0.42, 0.7), (3.2, 1.6, 0.78, 0.6), (5.4, 1.7, 0.62, 0.6)], rings=[(6.0, d - 0.35, 0.66, 0.74, 0.03, 0.97)],
                desc="Inicio de la app de Valentina. Toca «Pedir ayuda», elige «Equipo de sala · Gym Norte» y «Ayuda con un ejercicio», escribe «¿Me miran la técnica?» y toca «Enviar pedido». Aviso: «Pedido enviado al equipo de sala de Gym Norte». En su inicio queda «Tu pedido: pendiente».", panels=[
                dict(at=2.0, k="Para el equipo de sala · Gym Norte", v="Ayuda con un ejercicio", cls="a", out=5.2),
                dict(at=5.8, k="Tu pedido", v="Pendiente", cls="t")])),
            ("ve", D[1], lambda s, d: s_shot(s, d, [("s-sala.mp4", 0.0, 0, d, 0.73)], "El equipo *lo* *ve* en la sala.", side="left", leave=False, drift=False,
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.9, 0.52, 0.8)], rings=[(1.45, d - 0.25, 0.44, 0.61, 0.03, 0.97)],
                desc="App del gimnasio, «Sala › Pendientes», en la sesión de la profesora de sala Sofía Ramírez: el pedido T-1115 de Valentina Gómez, «Ayuda con un ejercicio», «¿Me miran la técnica?», sin responsable. Toca «Tomar».", panels=[
                dict(at=0.9, k="Valentina Gómez · Ayuda con un ejercicio", v="Sin responsable", cls="a")])),
            ("toma", D[2], lambda s, d: s_shot(s, d, [("s-mio.mp4", 0.1, 0, d)], "Y lo *toma.*", side="left", enter=False, drift=False,
                cam=[(0, 1.9, 0.52)], rings=[(0.3, d - 0.35, 0.44, 0.60, 0.03, 0.97)],
                desc="El mismo pedido T-1115 en «Para vos»: asignado, a nombre de Sofía Ramírez.", panels=[
                dict(at=0.25, k="Asignado · T-1115", v="Sofía Ramírez", cls="t")])),
            ("sabe", D[3], lambda s, d: s_shot(s, d, [("m-pedido.mp4", 0.2, 0, d, 0.57)], "Y el socio *ve* *quién* lo tomó.",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.9, 0.41, 0.8)], rings=[(1.5, d - 0.35, 0.375, 0.45, 0.03, 0.97)],
                desc="De vuelta en la app de Valentina: «Tu pedido: asignada · Ayuda con un ejercicio · Sofía».", panels=[
                dict(at=1.2, k="Tu pedido: asignada", v="Sofía", cls="t")])),
            ("mide", D[4], lambda s, d: s_shot(s, d, [("o-sala.mp4", 0.4, 0, d, 0.45)], "Y el gimnasio *mide* la respuesta.", side="left",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.9, 0.33, 0.85)], rings=[(1.7, d - 0.35, 0.325, 0.595, 0.03, 0.97)],
                desc="Vista del dueño «Seguimiento de sala», 30 días, todas las sedes: 16 pedidos recibidos y 12 resueltos.", panels=[
                dict(at=1.3, k="Seguimiento de sala · 30 días", v="12 de 16 resueltos", cls="a")])),
            ("end", D[5], END("Quiero REPI *en* *mi* *gimnasio.*", "repiclub.com/conoce/gimnasios")),
        ])

def gimnasios():
    """Perfil gimnasios 4.0 (≈ 47 s): apertura de 7,4 s, altas con aprobación (o-altas), el pedido de sala (f-turno), la serie
    con objetivo (m-serie) y el Seguimiento de sala del dueño (o-sala) en lugar de la guía de primeros pasos. Cortes en el pulso
    (114 bpm; el tramo arranca en 68,42 s)."""
    D = beats(0.5263, [5, 9, 5, 15, 11, 16, 11, 7, 9], tail=0.5)
    return dict(
        title="REPI para gimnasios", dur=round(sum(D), 2), music=("five-armies.mp3", 68.42), sfx="auto", poster=34.0,
        scenes=[
            ("dot", D[0], lambda s, d: s_dot(s, d, "En cada gimnasio, todos los días.")),
            ("scatter", D[1], lambda s, d: s_scatter(s, d, "Cada sala, _a_ _ciegas._", "Hasta que *todo* se conecta.", 2.5, FRAGS_GYM, calls=None, appear=0.16, appear0=0.1, t1_at=0.25, waves=1, fly_lead=0.8, wave_at=0.55)),
            ("logo", D[2], LOGO),
            ("altas", D[3], lambda s, d: s_shot(s, d, [("o-altas.mp4", 1.3, 0, d + 0.2)], "Altas por QR, *con* *aprobación.*",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.40, 0.7), (1.75, 1.6, 0.50, 0.6), (5.1, 1.8, 0.66, 0.8)], rings=[(6.0, d - 0.35, 0.66, 0.768, 0.03, 0.97)],
                desc="«Solicitudes de acceso»: Camila Ruiz pidió el alta con el QR de la sede. Quien atiende toca «Aprobar», elige «Lo conozco: es socio/a» y confirma. La solicitud pasa a «Resueltas», aprobada, en Palermo. El correo de la solicitud está desenfocado.", panels=[
                dict(at=0.9, k="Pedido de acceso", v="Camila Ruiz", cls="a", out=4.9),
                dict(at=5.5, k="El equipo confirmó · Palermo", v="Acceso aprobado", cls="t")])),
            ("sala", D[4], lambda s, d: shot_voy(s, d, "El equipo sabe *a* *quién* atender.")),
            ("serie", D[5], lambda s, d: shot_serie(s, d, "Cada socio entrena *con* *objetivo.*")),
            ("owner", D[6], lambda s, d: shot_seguimiento(s, d, "Tu sala, *de* *un* *vistazo.*", side="left")),
            ("network", D[7], lambda s, d: s_network(s, d, "Socios, equipo y gerencia. *Conectados.*", t1=0.7, t2=1.9)),
            ("end", D[8], END("Quiero REPI *en* *mi* *gimnasio.*", "repiclub.com/conoce/gimnasios")),
        ])

def intelligence():
    """Training Intelligence 4.0 (≈ 28 s): un solo teléfono y un solo plano encadenado sobre la fila Anterior / REPI recomienda /
    Real (m-serie): cambia el título, el recuadro y la tarjeta, no el plano. Pulso 0,9677 s (el tramo arranca en 120,57 s)."""
    D = beats(0.48385, [5, 8, 8, 8, 10, 8, 10], tail=0.5)
    return dict(
        title="Training Intelligence", dur=round(sum(D), 2), music=("volatile-reaction.mp3", 120.57), sfx="auto", poster=16.6,
        scenes=[
            ("dot", D[0], lambda s, d: s_dot(s, d, "Cada serie deja un dato.")),
            ("prev", D[1], lambda s, d: s_shot(s, d, [("m-serie.mp4", 0.2, 0, d)], "Lo que hiciste *la* *última* *vez.*", leave=False, drift=False,
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 2.0, 0.33, 0.8)], rings=[(1.6, d - 0.3, 0.322, 0.367, 0.06, 0.94)],
                desc="Press de banca, serie 1. La cámara se acerca a las filas «Tu profe indicó», «REPI recomienda», «Anterior» y «Real (hoy)». «Anterior» dice 53 kg × 9 · RIR 2.", panels=[
                dict(at=1.4, k="Anterior", v="53 kg × 9", why="RIR 2")])),
            ("rec", D[2], lambda s, d: s_shot(s, d, [("m-serie.mp4", round(0.2 + D[1], 2), 0, d, round((6.9 - 0.2 - D[1]) / d, 3))], "Lo que REPI *propone.*", enter=False, leave=False, drift=False,
                cam=[(0, 2.0, 0.33), (0.3, 2.12, 0.31, 3.2)], rings=[(0.5, d - 0.3, *ROW_REC)],
                desc="La fila «REPI recomienda» dice 53 kg × 8 · RIR 2: la misma carga que la vez anterior.", panels=[
                dict(at=0.4, k="REPI recomienda", v="53 kg × 8", cls="a", why="RIR 2")])),
            ("real", D[3], lambda s, d: s_shot(s, d, [("m-serie.mp4", 6.9, 0, d)], "Lo que *pasó.*", enter=False, leave=False, drift=False,
                cam=[(0, 2.12, 0.31), (0.2, 1.8, 0.50, 0.7)], rings=[(2.05, d - 0.3, 0.50, 0.59, 0.5, 0.985)],
                desc="El socio baja las repeticiones de 8 a 5, con 53 kg, y toca «Completar serie 1».", panels=[
                dict(at=2.0, k="Real · serie 1", v="53 kg × 5")])),
            ("next", D[4], lambda s, d: s_shot(s, d, [("m-serie.mp4", round(6.9 + D[3], 2), 0, d)], "Y la próxima *se* *ajusta.*", enter=False, drift=False,
                cam=[(0, 1.8, 0.50), (0.35, 1.85, 0.40, 0.8)], rings=[(1.3, d - 0.35, *ROW_REC)],
                desc="Al completar, «REPI recomienda» pasa a 50 kg × 8–10, con la razón escrita: «La serie fue bastante más exigente de lo esperado (5 de 8). Para la siguiente, bajá un poco la carga y priorizá completar el rango». Arranca el descanso de 2 minutos.", panels=[
                dict(at=1.0, k="Hizo 5 de 8. La próxima", v="50 kg × 8–10", cls="t", why="Bajá un poco la carga y priorizá completar el rango.")])),
            ("rule", D[5], lambda s, d: s_statement(s, d, "*Nunca* sube a mitad de la sesión.")),
            ("end", D[6], END("Probalo *con* *el* *motor* *real.*", "repiclub.com/conoce")),
        ])

FILMS.update({
    "gimnasios": gimnasios(),
    "entrenadores": entrenadores(),
    "deportistas": deportistas((1920, 1080)),
    "deportistas-vertical": deportistas((1080, 1920)),
    "aliados": aliados(),
    "intelligence": intelligence(),
    "progreso": progreso(),
    "altas": altas(),
    "sala": sala(),
})

# ── Modos de REPI (D213): Completo y Control, 16:9 y 9:16 ────────────────────────────────────────────────────────────────
# Grabaciones nuevas (tools/rec-raw.mjs, demo local con datos ficticios): ctl-kiosk-reg (pantalla de rutinas 1280×800 de la demo
# «control», Gimnasio Atlas, sin la lista de personas: Ana consulta y registra Sentadilla), ctl-results (la profesora de sala de la
# misma demo abre la ficha de Ana: el entrenamiento registrado en la pantalla, con el sello «Pantalla del gimnasio»), ctl-staff
# (profesor de sala de la demo «floor», Gym Norte: crea el programa de Martina), cmp-coach (coach: ficha de Valentina, diseña y
# asigna «Hipertrofia · 3 días») y cmp-owner (Seguimiento de sala). Del socio se reusan f-intelligence y perfil-deportistas.
# Los valores de los paneles son los que se ven en esas grabaciones.
FRAGS_CONTROL = [("paper", 130, 90, -5, "<small>Rutina · hoja impresa</small>Sentadilla 4×8<br><s>Prensa 3×12</s> 3×10<br>Remo ¿?"),
                 ("paper", 1330, 120, 4, "<small>rutina_final_v3(2).pdf</small>¿Cuál es la vigente?"),
                 ("chat", 1300, 790, -2, "<small>Socio · 07:40</small>Profe, ¿qué peso pongo?"),
                 ("", 200, 800, 3, "<small>Cargas de la semana</small>— sin anotar —"),
                 ("", 760, 60, -3, "<small>Cambios del profesor</small>— sin registro —")]
KIOSK = "ctl-kiosk-reg.mp4"
SP = 10.3 / 5.5  # código y PIN, de 3,75 a 14,05 s de la grabación, en 5,5 s de pantalla
ID_KEYS = [round((t - 3.75) / SP, 2) for t in (5.75, 6.43, 7.11, 7.80, 8.48, 9.17, 10.55, 11.30, 12.04, 12.80, 14.0)]
REG_SP = 1.1  # registro de Sentadilla, de 29,3 a 37,0 s de la grabación

def modo_completo(size):
    """Modo Completo 4.0: tres actos con cámara (el profesor diseña y asigna → el socio recibe, registra con el objetivo de REPI
    y ve su progreso → el profesor ve la evolución y el equipo responde en la sala). Grabaciones HD (tools/rec-hd.mjs).
    Cortes en el pulso de la pista (155 bpm; el tramo arranca en 64,24 s para que el pulso 0 caiga en el cuadro 0)."""
    vertical = size[1] > size[0]
    D = beats(0.3871, [6, 6, 16, 14, 10, 22, 12, 14, 14, 10, 12], tail=0.5)
    return dict(
        title="REPI Completo · Entrenamiento inteligente", dur=round(sum(D), 2), size=size, music=("volatile-reaction.mp3", 64.24), sfx="auto", poster=37.0,
        scenes=[
            ("dot", D[0], lambda s, d: s_dot(s, d, "Un profesor, un socio y una sala.")),
            ("logo", D[1], lambda s, d: s_logo(s, d, "_Entrenamiento_ inteligente.")),
            ("disena", D[2], lambda s, d: s_shot(s, d, [("c-programa.mp4", 1.7, 0, 1.9), ("c-programa.mp4", 5.9, 1.9, 4.5)], "El profesor *diseña* el programa.",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.7, 0.33, 0.8), (2.0, 1.9, 0.66, 1.0)], rings=[(3.6, d - 0.35, 0.675, 0.838, 0.03, 0.97)],
                desc="El profesor abre su plantilla «Hipertrofia · 3 días», versión 1, y baja hasta el día Torso A: Press de banca, 4 series de 8 a 10 repeticiones, RIR 2 y 2 minutos de descanso.", panels=[
                dict(at=1.0, k="Programa · versión 1", v="Hipertrofia · 3 días", cls="a", out=3.1),
                dict(at=3.5, k="Torso A · Press de banca", v="4 × 8–10 · RIR 2", cls="t")])),
            ("asigna", D[3], lambda s, d: s_shot(s, d, [("c-asigna.mp4", 2.6, 0, d, 1.12)], "Y lo *asigna.*", side="left",
                cam=[(0, 1.5, 0.5, 0.7), (3.1, 1.7, 0.72, 0.7)], rings=[(3.6, d - 0.35, 0.875, 0.988, 0.03, 0.97)],
                desc="En «Asignar Hipertrofia · 3 días» marca a Valentina Gómez y a Julián Ortiz y confirma. Aviso: «Programa asignado a Valentina, Julián. Lo verá en la app desde hoy».", panels=[
                dict(at=3.35, k="Programa asignado a", v="Valentina y Julián", cls="t")])),
            ("recibe", D[4], lambda s, d: s_shot(s, d, [("m-home.mp4", 0.2, 0, d, 0.55)], "El socio *lo* *recibe.*",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.38, 0.8)], rings=[(1.5, d - 0.35, 0.305, 0.483, 0.045, 0.955)],
                desc="Inicio de la app de Valentina: «Próximo entrenamiento: Torso A, 4 ejercicios, 16 series».", panels=[
                dict(at=1.2, k="Próximo entrenamiento", v="Torso A", cls="a")])),
            ("serie", D[5], lambda s, d: shot_serie(s, d, "REPI *recomienda*, con la razón.", side="left")),
            ("progreso", D[6], lambda s, d: s_shot(s, d, [("m-progreso.mp4", 0.2, 0, d, 0.3)], "Su progreso, *a* *la* *vista.*",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.8, 0.45, 0.8), (2.5, 1.8, 0.72, 0.9)], rings=[(1.5, 2.45, 0.40, 0.578, 0.045, 0.955)],
                desc="Progreso de Valentina en 90 días: 6 sesiones, 82 series, 716 repeticiones, la frecuencia por semana y sus mejores marcas por ejercicio.", panels=[
                dict(at=1.3, k="Últimos 90 días", v="6 sesiones · 82 series", cls="a", out=2.6),
                dict(at=2.95, k="Mejores marcas del período", v="Por ejercicio", cls="t")])),
            ("consulta", D[7], lambda s, d: s_shot(s, d, [("c-clientes.mp4", 5.2, 0, d + 0.3)], "El profesor *ve* *su* *evolución.*", side="left",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.6, 0.36, 0.5), (1.3, 1.95, 0.36, 0.8)], rings=[(2.3, d - 0.35, 0.238, 0.433, 0.03, 0.97)],
                desc="El profesor abre la ficha de Valentina Gómez y baja al registro de sesiones: en Torso B, Remo en polea figura con «+2,5 kg vs. la vez anterior».", panels=[
                dict(at=2.2, k="Valentina · Remo en polea", v="+2,5 kg", cls="a", why="Contra la vez anterior.")])),
            ("gimnasio", D[8], lambda s, d: shot_voy(s, d, "Y el equipo *responde* en la sala.", side="right")),
            ("red", D[9], (lambda s, d: s_statement(s, d, "Profesor, socio y gimnasio. *Conectados.*")) if vertical else (lambda s, d: s_network(s, d, "Profesor, socio y gimnasio. *Conectados.*", t1=0.7, t2=1.9))),
            ("end", D[10], lambda s, d: s_end(s, d, "*Entrenamiento* inteligente.", "repiclub.com/conoce", kicker="REPI Completo")),
        ])

def modo_control(size):
    """D216: el profesor programa → el socio se identifica en la pantalla → ve ejercicios, peso sugerido, intensidad y descanso →
    registra lo real → el historial se actualiza → el profesor ve los resultados → el celular es opcional."""
    return dict(
        title="REPI Control · Tu equipo planifica. Tus socios consultan y registran.", dur=59.7, size=size, music=("clash-defiant.mp3", 203.0), sfx="auto", poster=38.6,
        # Sin desenfoque de movimiento del render: con él, HyperFrames 0.8.193 dejaba ver el póster de la grabación (otra
        # pantalla) unos 0,3 s cada vez que un panel entraba o la tablet salía (las salidas ya llevan su propio blur).
        motion_blur=False,
        scenes=[
            ("dot", 2.3, lambda s, d: s_dot(s, d, "Cada socio busca su rutina.")),
            ("scatter", 6.5, lambda s, d: s_scatter(s, d, "Rutinas y cargas, _en_ _papel._", "REPI las *centraliza.*", 3.6, FRAGS_CONTROL, calls=1.6, appear=0.6, waves=1)),
            ("logo", 2.5, lambda s, d: s_logo(s, d, "_Tu_ _equipo_ planifica.")),
            ("crea", 5.5, lambda s, d: s_shot(s, d, [("ctl-results.mp4", 0.6, 0, 1.1), ("ctl-results.mp4", 1.7, 1.1, 4.4, 0.45)], "El profesor *programa* el entrenamiento.",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 1.45, 0.34, 0.6), (1.5, 1.7, 0.73, 0.8)], rings=[(2.4, d - 0.35, 0.575, 0.845, 0.03, 0.97)],
                desc="En la app del gimnasio, la profesora de sala abre la ficha de Ana Pérez: su programa institucional «Fuerza base · 3 días», con Sentadilla 4 × 5–6 · RIR 2 en el día 1.", panels=[
                dict(at=2.2, k="Ana Pérez · programa institucional", v="Fuerza base · 3 días", cls="a")])),
            ("asigna", 3.0, lambda s, d: s_shot(s, d, [("ctl-results.mp4", 1.7, 0, 3.0, 0.66)], "Y lo *asigna* al socio.", side="left",
                cam=[(0, 1.5, 0.33, 0.7), (0.8, 1.7, 0.66, 0.7)], rings=[(1.5, d - 0.35, 0.572, 0.655, 0.03, 0.97)],
                desc="La ficha de Ana muestra el programa institucional asignado, en su revisión 2.", panels=[
                dict(at=1.1, k="En la ficha de Ana", v="Revisión 2", cls="t")])),
            ("llega", 2.6, lambda s, d: s_arrive(s, d, "El socio *llega* a la pantalla.")),
            ("id", 5.5, lambda s, d: s_tablet(s, d, [(KIOSK, 3.75, 0, 5.5, SP)], "Se identifica *con* *código* *y* *PIN.*", keys=ID_KEYS, desc="Ana toca Empezar y escribe su código de socio y su PIN, que se ve como puntos.", panels=[
                dict(at=0.6, k="Código de socio", v="6 números", cls="a", out=2.9),
                dict(at=3.1, k="PIN", v="• • • •", cls="a", why="Nadie más lo ve: se muestran puntos.")])),
            ("consulta", 6.5, lambda s, d: s_tablet(s, d, [(KIOSK, 14.3, 0, 1.4), (KIOSK, 18.0, 1.4, 5.1)], "Ejercicios, *peso* *sugerido*, intensidad y descanso.", desc="Entre «Consultar mi rutina» y «Registrar mi entrenamiento», elige consultar. La cámara se acerca a Sentadilla: 4 series de 5 a 6 repeticiones con RIR 2, descanso de 3 minutos y, en cada serie, lo que indicó el profesor, lo que sugiere REPI y la última vez.",
                focus=dict(x=100, y=56, s=2.0, at=2.7, d=0.9), panels=[
                dict(at=3.0, k="Sentadilla · REPI sugiere", v="69,5 kg × 5–6", cls="a", why="Lo que indicó el profesor: 4 × 5–6 · RIR 2, descanso 3:00.")])),
            ("registra", 7.0, lambda s, d: s_tablet(s, d, [(KIOSK, 29.3, 0, 7.0, REG_SP)], "Termina el ejercicio y *registra* *lo* *real.*", desc="En «Registrar mi entrenamiento», abre Sentadilla, sube la serie 1 a 72 kg con 5 repeticiones, marca RIR 2, la copia a las otras series y toca «Confirmar ejercicio».",
                focus=dict(x=93, y=100, s=1.6, at=0.9, d=0.8, out=4.4), panels=[
                dict(at=3.6, k="Real · serie 1", v="72 kg × 5", cls="a", why="RIR 2. Nada se guarda hasta que confirma.")])),
            ("historial", 4.5, lambda s, d: s_tablet(s, d, [(KIOSK, 37.0, 0, 2.0), (KIOSK, 46.4, 2.0, 2.5)], "Su historial *se* *actualiza.*", desc="La lista del día muestra «Guardado: 4 series de Sentadilla». Al terminar, la pantalla dice «Entrenamiento terminado» y queda libre.", panels=[
                dict(at=0.5, k="Guardado", v="4 series", cls="t", out=2.0),
                dict(at=2.3, k="Entrenamiento terminado", v="En su historial", cls="t", why="También en la app.")])),
            ("resultados", 5.5, lambda s, d: s_shot(s, d, [("ctl-results.mp4", 4.6, 0, 5.5)], "El profesor *ve* *los* *resultados.*",
                cam=[(0, 1.0, 0.5, 0.7), (0.75, 2.1, 0.50, 0.9)], rings=[(1.7, d - 0.35, 0.283, 0.425, 0.03, 0.97)],
                desc="En la ficha de Ana, la sesión de hoy lleva el sello «Pantalla del gimnasio» y las cuatro series de Sentadilla de 72 kg por 5, 5 kg más que la vez anterior.", panels=[
                dict(at=1.6, k="Ana · Pantalla del gimnasio", v="72 kg × 5", cls="a", why="Sentadilla: +5 kg vs. la vez anterior.")])),
            ("qr", 3.8, lambda s, d: s_tablet(s, d, [(KIOSK, 0.1, 0, 3.8, 1.0)], "Y el celular, *opcional.*", desc="La cámara se acerca al QR de la bienvenida: «Opcional: tu rutina en el celular».", sub="No es el QR de ingreso.", focus=dict(x=97, y=54, s=2.0, at=0.4, d=1.0))),
            ("end", 4.5, lambda s, d: s_end(s, d, "Tu equipo planifica. *Tus* *socios* *consultan* *y* *registran.*", "repiclub.com/conoce?modo=control", kicker="REPI Control")),
        ])

FILMS.update({
    "modo-completo": modo_completo((1920, 1080)),
    "modo-completo-vertical": modo_completo((1080, 1920)),
    "modo-control": modo_control((1920, 1080)),
    "modo-control-vertical": modo_control((1080, 1920)),
})

INDEX = """<!doctype html>
<html lang="es" data-resolution="{res}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width={w}, height={h}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>* {{ margin: 0; padding: 0; box-sizing: border-box; }} html, body {{ width: {w}px; height: {h}px; overflow: hidden; background: #0B0F14; }}</style>
</head>
<!-- {title}. Generado por design/films/kit/build.py: editar el guion ahí y volver a generar. -->
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="{w}" data-height="{h}" data-motion-blur="{mblur}">
{hosts}
<audio id="bgm" src="assets/media/{music}" data-start="0" data-duration="{dur}" data-media-start="{mstart}" data-volume="0.9" data-fade-in="0.6" data-fade-out="1.6"></audio>
{sfx}
</div>
<script>window.__timelines["main"] = gsap.timeline({{ paused: true }});</script>
</body>
</html>
"""

def sfx_len(path):
    """Duración real del efecto (ffprobe), para que el slot no prometa más de lo que suena."""
    import subprocess
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout
        return f"{min(2.5, float(out.strip())):.2f}"
    except (ValueError, OSError):
        return "2.5"

PRECUTS = []  # (escena, cortes, duración) que s_device pide precortar

def precut(d, sid, clips, dur, size=(780, 1688)):
    """Corta y concatena los tramos de la grabación en un solo MP4 CFR 30 fps (GOP corto) y extrae el póster.
    Un tramo puede llevar un quinto valor, la velocidad (1,6 = 1,6× más rápido: `du` es lo que dura en pantalla)."""
    import subprocess
    srcs = [os.path.join(MEDIA_SRC, "footage", f) for f, *_ in clips]
    missing = [x for x in srcs if not os.path.exists(x)]
    if missing: raise SystemExit(f"falta la grabación {missing[0]} (REPI_MEDIA_SRC)")
    args, parts = [], []
    for i, (c, src) in enumerate(zip(clips, srcs)):
        f, ms, st, du = c[:4]; sp = c[4] if len(c) > 4 else 1.0
        args += ["-ss", f"{ms}", "-t", f"{du * sp:.3f}", "-i", src]
        parts.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps=30,scale={size[0]}:{size[1]}:flags=lanczos,setsar=1[v{i}]")
    graph = ";".join(parts) + ";" + "".join(f"[v{i}]" for i in range(len(clips))) + f"concat=n={len(clips)}:v=1:a=0[c];[c]tpad=stop_mode=clone:stop_duration={dur + 0.5:.2f}[out]"  # -t corta; si un tramo pide más de lo que queda en la grabación, se sostiene su último cuadro
    out = os.path.join(d, "assets", "media", f"cut-{sid}.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", graph, "-map", "[out]", "-t", f"{dur}", "-r", "30", "-c:v", "libx264", "-crf", "16", "-g", "15", "-pix_fmt", "yuv420p", "-an", out], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", out, "-frames:v", "1", "-q:v", "3", out[:-4] + ".jpg"], check=True)

def auto_sfx(scenes):
    """Sonido por evento visible: whoosh en cada corte (dos tomas alternadas), impacto en la marca, pop en cada panel o
    respuesta que aterriza, whoosh cinemático antes de que los fragmentos vuelen, riser que llega al golpe final."""
    out, t, starts = [], 0.0, {}
    for i, (sid, dur, _) in enumerate(scenes):
        starts[sid] = t
        k = KIND.get(sid)
        if k == "logo": out.append(("impact-bass-1", round(t, 2)))
        elif k == "end":
            out.append(("riser", round(max(0, t + 1.18 - 3.2), 2), 3.4))
            out.append(("impact-bass-2", round(t + 1.18, 2)))
        elif i > 0 and k != "shot-cont": out.append(("whoosh" if i % 2 else "whoosh-short", round(max(0, t - 0.12), 2)))
        if isinstance(k, tuple) and k[0] == "scatter": out.append(("whoosh-cinematic", round(t + k[1] - 2.3, 2), 3.2))
        t += dur
    for sid, at in HINTS:
        if sid in starts: out.append(("pop", round(starts[sid] + at, 2)))
    for sid, at in KEYS:  # cada número tocado en el teclado de la pantalla de rutinas
        if sid in starts: out.append(("key-press", round(starts[sid] + at, 2), 0.3))
    return sorted(out, key=lambda x: x[1])

def build(name):
    f = FILMS[name]
    canvas(*f.get("size", (1920, 1080)))
    KIND.clear(); HINTS.clear(); KEYS.clear()
    d = os.path.join(ROOT, name)
    os.makedirs(os.path.join(d, "compositions"), exist_ok=True)
    for sub in ("fonts", "brand", "media", "sfx"): os.makedirs(os.path.join(d, "assets", sub), exist_ok=True)
    mot = os.path.join(REPO, "design", "motion", "assets")
    for fn in ("barlow-400.woff2", "barlow-600.woff2", "barlowcondensed-700.woff2", "barlow-OFL.txt", "barlowcondensed-OFL.txt"):
        shutil.copy(os.path.join(mot, "fonts", fn), os.path.join(d, "assets", "fonts", fn))
    shutil.copy(os.path.join(mot, "brand", "wm_full.png"), os.path.join(d, "assets", "brand", "wm_full.png"))
    wm400 = os.path.join(d, "assets", "brand", f"wm_{WM_W}.png")
    if not os.path.exists(wm400):  # el original (315×154) ampliado una vez a 400 px con Lanczos; no se redibuja
        import subprocess
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(mot, "brand", "wm_full.png"), "-vf", f"scale={WM_W}:-1:flags=lanczos", wm400], check=True)
    shutil.copy(os.path.join(REPO, "apps", "web", "public", "conoce", "smart-center-gym.webp"), os.path.join(d, "assets", "brand", "smart-center-gym.webp"))
    if MEDIA_SRC:
        for fn in [f["music"][0]]:
            src = next((os.path.join(MEDIA_SRC, sub, fn) for sub in ("footage", "audio") if os.path.exists(os.path.join(MEDIA_SRC, sub, fn))), None)
            if not src: raise SystemExit(f"falta la pista {fn} en {MEDIA_SRC}/audio")
            shutil.copy(src, os.path.join(d, "assets", "media", fn))
    t, hosts = 0.0, []
    PRECUTS.clear()
    for sid, dur, fn in f["scenes"]:
        open(os.path.join(d, "compositions", f"{sid}.html"), "w").write(fn(sid, dur))
    keep = {f"{sid}.html" for sid, _, _ in f["scenes"]}
    for fn in os.listdir(os.path.join(d, "compositions")):  # escenas de un guion anterior que ya no existen
        if fn.endswith(".html") and fn not in keep: os.remove(os.path.join(d, "compositions", fn))
    sfx_list = auto_sfx(f["scenes"]) if f["sfx"] == "auto" else f["sfx"]
    if MEDIA_SRC:
        for pc in PRECUTS: precut(d, *pc)
        sfx_dir = os.path.expanduser("~/.agents/skills/media-use/audio/assets/sfx")
        for n in {x[0] for x in sfx_list}:
            if os.path.exists(os.path.join(sfx_dir, n + ".mp3")): shutil.copy(os.path.join(sfx_dir, n + ".mp3"), os.path.join(d, "assets", "sfx", n + ".mp3"))
    for sid, dur, fn in f["scenes"]:
        hosts.append(f'<div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{t:.2f}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>')
        t += dur
    assert abs(t - f["dur"]) < 0.01, f"{name}: escenas suman {t}, film {f['dur']}"
    sfx = "\n".join(f'<audio id="sfx{i}" src="assets/sfx/{x[0]}.mp3" data-start="{x[1]}" data-duration="{x[2] if len(x) > 2 else sfx_len(os.path.join(d, "assets", "sfx", x[0] + ".mp3"))}" data-volume="0.55"></audio>' for i, x in enumerate(sfx_list))
    open(os.path.join(d, "index.html"), "w").write(INDEX.format(res="landscape" if W > H else "portrait", w=W, h=H, dur=f["dur"], title=f["title"], hosts="\n".join(hosts), music=f["music"][0], mstart=f["music"][1], sfx=sfx, mblur="on" if f.get("motion_blur", False) else "off"))
    open(os.path.join(d, ".gitignore"), "w").write("assets/media/\nassets/sfx/\nrenders/\nsnapshots/\n.hyperframes/\n")
    print("ok", name, f"{t:.1f}s", len(f["scenes"]), "escenas")

if __name__ == "__main__":
    for n in (sys.argv[1:] or FILMS): build(n)
