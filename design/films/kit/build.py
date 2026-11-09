#!/usr/bin/env python3
"""REPI · Cinematic Motion Studio — generador de films HyperFrames (Experience 3.0).

Cada film es un proyecto HyperFrames (design/films/<film>/) armado desde un guion declarativo (FILMS, abajo) con escenas
reutilizables: títulos cinéticos, la sala vista desde arriba (fragmentos que se conectan, red de personas, convergencia),
el teléfono con la grabación real de la demo, el número de la serie que se transforma y la placa final con el wordmark.

Uso:   python3 design/films/kit/build.py [film ...]
Medios: los videos y la música NO van a Git (assets/media/). `--media` los copia desde MEDIA_SRC (grabaciones de la demo
        guiada local y pistas con licencia; ver LICENCIAS.md y docs/comercial/EXPERIENCE_3.md).
"""
import json, os, shutil, sys, html

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
#{sid}-t {{ position: absolute; left: 0; right: 0; top: {H/2+110}px; text-align: center; }}
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

FRAG_CSS = f""".frag {{ position: absolute; padding: 22px 26px; border-radius: 18px; background: {C['surface']}; border: 2px solid {C['steel']}; font: 600 34px/1.25 "Barlow"; color: {C['white']}; box-shadow: 0 30px 60px -20px rgba(0,0,0,.55); display: flex; flex-direction: column; gap: 6px; }}
.frag small {{ font: 600 28px "Barlow"; color: {C['muted']}; }}
.frag.paper {{ background: {C['cream']}; color: {C['navy']}; border-color: #DCD5C6; font-style: italic; }}
.frag.paper small {{ color: #6B6152; font-style: normal; }}
.frag.chat {{ border-radius: 22px 22px 22px 6px; background: #1F2D3F; }}
.frag.alert small {{ color: #FFB4A8; }}"""
FRAGS_SALA = [("paper", 130, 90, -5, "<small>Rutina</small>Sentadilla 4×8<br>Prensa 3×12<br><s>Remo ¿?</s>"),
         ("chat", 1330, 120, 3, "<small>Socio · 19:42</small>Profe, ¿qué me toca hoy?"),
         ("", 1300, 790, -2, "<small>planilla_socios_v3.xlsx</small>412 filas · sin actualizar"),
         ("alert", 200, 800, 4, "<small>Pedido de ayuda</small>Nadie lo vio"),
         ("", 760, 60, -3, "<small>Progreso</small>— sin datos —")]
FRAG_C = (200, 85)  # centro aproximado de cada tarjeta, para los trazos

def s_scatter(sid, dur, t1, t2, connect_at, frags_def=None, calls=5.0, appear=1.05, waves=3):
    """Fragmentos sueltos sobre la sala; después, trazos que los conectan con el punto cian.
    `calls`: cuándo empieza cada fragmento a «llamar»; `appear`: separación entre fragmentos que aparecen. En vertical, las
    posiciones (pensadas para 1920×1080) se reparten en dos columnas arriba y abajo del título."""
    FRAGS = frags_def or FRAGS_SALA
    if H > W:
        pos = [(60, 170), (560, 360), (580, 1400), (70, 1600), (300, 640)]
        FRAGS = [(k, pos[i][0], pos[i][1], r, t) for i, (k, x, y, r, t) in enumerate(FRAGS)]
    KIND[sid] = ("scatter", dur - 1.5)
    css = FRAG_CSS + f"""#{sid}-dot {{ position: absolute; left: {W/2-22}px; top: {H/2-22}px; width: 44px; height: 44px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-lines {{ position: absolute; inset: 0; }}
#{sid}-floor {{ transform-origin: 50% 50%; }}
.{sid}-pk {{ position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: {C['cyan']}; opacity: 0; }}
#{sid}-lines line {{ stroke: {C['cyan']}; stroke-width: 3; stroke-linecap: round; }}
.{sid}-tt {{ position: absolute; left: 0; right: 0; top: {H/2+70}px; text-align: center; }}
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
    for i in range(len(FRAGS)):
        at = calls + i * 0.68
        js.append(f'tl.to("#{sid}-f{i}", {{ y: -14, duration: 0.16, ease: "power2.out" }}, {at:.2f});')
        js.append(f'tl.to("#{sid}-f{i}", {{ y: 0, duration: 0.4, ease: "back.out(2.4)" }}, {at + 0.16:.2f});')
    # Ya conectados, los datos viajan por los trazos al punto, en tres oleadas.
    for w in range(waves):
        at = connect_at + 0.9 + w * 1.1
        for i, (k, x, y, r, txt) in enumerate(FRAGS):
            js.append(f'tl.fromTo("#{sid}-k{w}{i}", {{ x: 0, y: 0, opacity: 0 }}, {{ x: {W/2 - x - FRAG_C[0]}, y: {H/2 - y - FRAG_C[1]}, opacity: 1, duration: 0.7, ease: "power2.in" }}, {at + i * 0.05:.2f});')
            js.append(f'tl.set("#{sid}-k{w}{i}", {{ opacity: 0 }}, {at + i * 0.05 + 0.7:.2f});')
        js.append(f'tl.to("#{sid}-dot", {{ scale: 1.35, duration: 0.12, ease: "power2.out" }}, {at + 0.72:.2f});')
        js.append(f'tl.to("#{sid}-dot", {{ scale: 1, duration: 0.35, ease: "back.out(1.6)" }}, {at + 0.84:.2f});')
    for i in range(len(FRAGS)):
        js.append(f'tl.fromTo("#{sid}-f{i}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }}, {0.3 + i * appear:.2f});')
        js.append(f'tl.to("#{sid}-l{i}", {{ strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }}, {connect_at + 0.15 + i * 0.12:.2f});')
    js.append(f'tl.fromTo("#{sid}-t1 .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.07 }}, 0.6);')
    js.append(f'tl.to("#{sid}-t1 .w", {{ opacity: 0, filter: "blur(8px)", duration: 0.18, stagger: 0.03 }}, {connect_at - 0.2});')
    js.append(f'tl.fromTo("#{sid}-t2 .w", {{ color: "{C["muted"]}" }}, {{ color: "{C["white"]}", duration: 0.1, stagger: 0.09 }}, {connect_at + 0.1});')
    js.append(f'tl.fromTo("#{sid}-t2", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.12 }}, {connect_at + 0.05});')
    # Los fragmentos vuelan al punto y el punto crece hasta volverse el suelo de la escena siguiente.
    fly = dur - 1.5
    for i, (k, x, y, r, txt) in enumerate(FRAGS):
        js.append(f'tl.to("#{sid}-f{i}", {{ x: {W/2 - x - FRAG_C[0]}, y: {H/2 - y - FRAG_C[1]}, scale: 0.1, opacity: 0, rotate: 0, duration: 0.45, ease: "power3.in" }}, {fly + i * 0.06:.2f});')
    js.append(f'tl.to("#{sid}-lines", {{ opacity: 0, duration: 0.3 }}, {fly});')
    js.append(f'tl.to("#{sid}-t2", {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {fly + 0.2});')
    js.append(f'tl.to("#{sid}-dot", {{ scale: 70, duration: 0.75, ease: "power3.in" }}, {dur - 0.8});')
    return scene(sid, dur, css, body, "\n".join(js))

def wordmark(sid, width, extra=""):
    return f'<span id="{sid}-wm" class="wm" style="width:{width}px{extra}"><img src="assets/brand/wm_full.png" alt=""><i id="{sid}-wmdot"></i></span>'
WM_CSS = f""".wm {{ position: absolute; display: block; }}
.wm img {{ width: 100%; display: block; }}
.wm i {{ position: absolute; left: 88.92%; top: 1.58%; width: 10.12%; aspect-ratio: 1; border-radius: 50%; background: {C['cyan']}; }}"""

def s_logo(sid, dur, claim):
    """En el golpe: el cian del punto se retira como un iris y aparece el wordmark grande con la frase."""
    KIND[sid] = "logo"
    css = WM_CSS + f"""#{sid}-flood {{ position: absolute; inset: 0; background: {C['cyan']}; }}
#{sid}-wm {{ left: {W/2-330}px; top: {H/2-290}px; }}
#{sid}-t {{ position: absolute; left: 40px; right: 40px; top: {H/2+80}px; text-align: center; }}"""
    body = f"""<div id="{sid}-bg" style="position:absolute;inset:0;background:{C['navy']}"></div>
{wordmark(sid, 660)}
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(claim)}</h2>
<div id="{sid}-flood" class="clip" data-start="0" data-duration="{dur}"></div>"""
    js = f"""tl.fromTo("#{sid}-flood", {{ clipPath: "circle(150% at 50% 50%)" }}, {{ clipPath: "circle(0% at 82% 26%)", duration: 0.7, ease: "expo.inOut" }}, 0);
tl.fromTo("#{sid}-wm img", {{ clipPath: "inset(0 100% 0 0)" }}, {{ clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power3.out" }}, 0.25);
tl.fromTo("#{sid}-wmdot", {{ scale: 0 }}, {{ scale: 1, duration: 0.4, ease: "back.out(2.2)" }}, 0.55);
tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 0.75);
tl.to("#{sid}-root, #{sid}-wm, #{sid}-t", {{ x: -W_EXIT, filter: "blur(16px)", duration: 0.28, ease: "power3.in" }}, {dur - 0.3});""".replace("W_EXIT", str(W)).replace(f"#{sid}-root, ", "")
    return scene(sid, dur, css, body, js)

PHONE_CSS = f""".phone {{ position: absolute; width: 470px; height: 1017px; border-radius: 54px; padding: 14px; background: #05080C; border: 2px solid {C['steel']}; box-shadow: 0 30px 60px -10px rgba(0,0,0,.55); overflow: hidden; }}
.phone .scr {{ position: relative; width: 100%; height: 100%; border-radius: 42px; overflow: hidden; background: #fff; }}
.phone video, .phone img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }}
.panel {{ position: absolute; padding: 30px 36px; border-radius: 26px; background: {C['surface']}; border: 2px solid {C['steel']}; box-shadow: 0 30px 60px -20px rgba(0,0,0,.6); }}
.panel small {{ display: block; font: 600 28px "Barlow"; color: {C['muted']}; margin-bottom: 6px; }}
.panel b {{ display: block; font: 700 76px/1 "Barlow Condensed"; letter-spacing: -0.01em; }}
.panel b.a {{ color: {C['cyan']}; }}
.panel b.t {{ color: {C['teal']}; }}
.panel p {{ margin: 14px 0 0; font: 600 28px/1.3 "Barlow"; color: {C['muted']}; max-width: 560px; }}"""

def s_device(sid, dur, clips, title, sub=None, panels=(), side="left", still=None, exit_panels=False):
    """La app real: grabación (o captura) en el teléfono, con título al costado y paneles con los valores reales
    de la acción a tamaño grande. `clips`: [(archivo, media_start, inicio, duración)] cortados dentro del teléfono."""
    KIND[sid] = "device"
    vertical = H > W
    if vertical:  # título arriba, panel en el medio, teléfono abajo
        css = PHONE_CSS + f"""#{sid}-ph {{ left: {(W-470)/2}px; top: {H-1017-90}px; }}
#{sid}-t {{ position: absolute; left: 70px; top: 170px; width: {W-140}px; }}
#{sid}-sub {{ position: absolute; left: 70px; top: 430px; width: {W-140}px; }}"""
        panels = [dict(p, x=70, y=440) for p in panels]
    else:
        px = 1260 if side == "left" else 190
        tx = 150 if side == "left" else 760
        css = PHONE_CSS + f"""#{sid}-ph {{ left: {px}px; top: 32px; }}
#{sid}-t {{ position: absolute; left: {tx}px; top: 300px; width: 980px; }}
#{sid}-sub {{ position: absolute; left: {tx}px; top: 560px; width: 900px; }}"""
    for p in panels: HINTS.append((sid, p["at"]))
    # Un único video por escena, precortado con ffmpeg (build → precut): con varios <video> o clips que arrancan a mitad
    # de escena, el render deja el teléfono en blanco unos cuadros. El póster (primer cuadro) queda debajo.
    PRECUTS.append((sid, clips, dur, (780, 1688)))
    vids = [f'<img src="assets/media/cut-{sid}.jpg" alt="">',
            f'<video id="{sid}-v" class="clip" src="assets/media/cut-{sid}.mp4" muted playsinline data-start="0" data-duration="{dur}" data-track-index="2"></video>']
    if still: vids = [f'<img src="assets/media/{still}" alt="">']
    pnl = []
    for j, p in enumerate(panels):
        cls = p.get("cls", "")
        pnl.append(f'<div id="{sid}-p{j}" class="panel" style="left:{p["x"]}px;top:{p["y"]}px"><small>{p["k"]}</small><b class="{cls}">{p["v"]}</b>{f"<p>{p["why"]}</p>" if p.get("why") else ""}</div>')
    body = f"""{floor_svg(sid, draw=False)}
<div style="position:absolute;inset:0;background:linear-gradient(90deg, rgba(11,15,20,.92) 0%, rgba(11,15,20,.6) 55%, rgba(11,15,20,.35) 100%)"></div>
<div id="{sid}-ph" class="phone"><div class="scr">{"".join(vids)}</div></div>
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(title)}</h2>
{f'<p id="{sid}-sub" class="s clip" data-start="0" data-duration="{dur}">{sub}</p>' if sub else ""}
{"".join(pnl)}"""
    js = [f'tl.fromTo("#{sid}-ph", {{ x: 900, filter: "blur(14px)" }}, {{ x: 0, filter: "blur(0px)", duration: 0.55, ease: "expo.out" }}, 0);',
          f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 0.25);']
    if sub: js.append(f'tl.fromTo("#{sid}-sub", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.2 }}, 0.9);')
    for j, p in enumerate(panels):
        js.append(f'tl.fromTo("#{sid}-p{j}", {{ opacity: 0, x: {"-80" if side == "left" or vertical else "80"}, scale: 0.9 }}, {{ opacity: 1, x: 0, scale: 1, duration: 0.55, ease: "expo.out" }}, {p["at"]});')
        if p.get("out"): js.append(f'tl.to("#{sid}-p{j}", {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {p["out"]});')
    out = "".join(f", #{sid}-p{j}" for j in range(len(panels))) if exit_panels else ""  # con exit_panels, los paneles salen con el teléfono
    js.append(f'tl.to("#{sid}-ph, #{sid}-t, #{sid}-sub{out}", {{ x: {-W if side == "left" or vertical else W}, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }}, {dur - 0.32});')
    return scene(sid, dur, css, body, "\n".join(js))

TABLET_CSS = f""".tablet {{ position: absolute; padding: 16px; border-radius: 36px; background: #05080C; border: 2px solid {C['steel']}; box-shadow: 0 30px 60px -10px rgba(0,0,0,.55); }}
.tablet .scr {{ position: relative; width: 100%; height: 100%; border-radius: 20px; overflow: hidden; background: #0A0F1A; }}
.tablet .zoom {{ position: absolute; inset: 0; }}
.tablet video, .tablet img {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }}"""

def s_tablet(sid, dur, clips, title, sub=None, panels=(), focus=None, keys=(), still=None):
    """La pantalla de rutinas real (tablet apaisada, 1280×800 grabada a 2×) con el título arriba y los paneles al costado.
    `focus`: acercamiento de cámara dentro de la pantalla, dict(x=%, y=%, s=escala, at=s, d=duración[, out=s]).
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

def s_network(sid, dur, title):
    """La sala entera: socios y equipo moviéndose, un pedido que viaja del socio al entrenador y vuelve «Voy»."""
    KIND[sid] = "network"; HINTS.append((sid, 1.0)); HINTS.append((sid, 2.45))
    import random
    rnd = random.Random(7)
    dots = []
    css = f""".pd {{ position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: {C['cyan']}; }}
.pd.st {{ background: {C['teal']}; width: 30px; height: 30px; margin: -15px 0 0 -15px; }}
#{sid}-t {{ position: absolute; left: 0; right: 0; bottom: 90px; text-align: center; }}
#{sid}-tag1, #{sid}-tag2 {{ position: absolute; padding: 14px 20px; border-radius: 16px; background: {C['surface']}; font: 700 34px "Barlow Condensed"; text-transform: uppercase; }}
#{sid}-tag1 {{ border: 2px solid {C['cyan']}; }}
#{sid}-tag2 {{ border: 2px solid {C['teal']}; }}
#{sid}-pulse {{ position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-shade {{ position: absolute; inset: 0; background: linear-gradient(0deg, rgba(11,15,20,.95) 0%, rgba(11,15,20,0) 40%); }}"""
    js = []
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
    body = f"""{floor_svg(sid, draw=False)}
{"".join(dots)}
<div id="{sid}-pulse" class="clip" data-start="0" data-duration="{dur}" style="left:{a[0]}px;top:{a[1]}px"></div>
<div id="{sid}-tag1" class="clip" data-start="0" data-duration="{dur}" style="left:{a[0] + 30}px;top:{a[1] - 90}px">Que venga alguien</div>
<div id="{sid}-tag2" class="clip" data-start="0" data-duration="{dur}" style="left:{b[0] - 40}px;top:{b[1] - 100}px">Voy</div>
<div id="{sid}-shade"></div>
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(title)}</h2>"""
    js += [f'tl.fromTo("#{sid}-tag1", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }}, 1.0);',
           f'tl.fromTo("#{sid}-pulse", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.1 }}, 1.2);',
           f'tl.to("#{sid}-pulse", {{ x: {b[0] - a[0]}, y: {b[1] - a[1]}, duration: 1.1, ease: "power2.inOut" }}, 1.3);',
           f'tl.fromTo("#{sid}-tag2", {{ opacity: 0, y: 20 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "expo.out" }}, 2.45);',
           f'tl.to("#{sid}-pulse", {{ backgroundColor: "{C["teal"]}", x: 0, y: 0, duration: 1.0, ease: "power2.inOut" }}, 2.6);',
           f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 0.4);']
    return scene(sid, dur, css, body, "\n".join(js))

KICK_CSS = "\n#{sid}-k {{ position: absolute; left: 0; right: 0; top: {top}px; text-align: center; font: 700 52px/1 \"Barlow Condensed\"; text-transform: uppercase; letter-spacing: 0.1em; color: " + C["white"] + "; margin: 0; }}"

def s_end(sid, dur, claim, url, kicker=None):
    """Los puntos de la sala convergen en uno, que sube a su lugar sobre la «ı» del wordmark. Frase y dirección.
    Con `kicker` (p. ej. «REPI Control»), el wordmark se achica y el nombre del modo va entre el wordmark y la frase."""
    KIND[sid] = "end"
    ww = 460 if kicker else 560
    wt = H / 2 - (350 if kicker else 290)
    tt = H / 2 + (10 if kicker else 50)
    ut = H / 2 + ((280 if W > H else 470) if kicker else (280 if W > H else 360))
    css = WM_CSS + f""".cd {{ position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-wm {{ left: {W/2-ww/2}px; top: {wt}px; }}{KICK_CSS.format(sid=sid, top=H/2-92) if kicker else ""}
#{sid}-t {{ position: absolute; left: 40px; right: 40px; top: {tt}px; text-align: center; }}
#{sid}-u {{ position: absolute; left: 0; right: 0; top: {ut}px; text-align: center; font: 600 46px "Barlow"; color: {C['white']}; }}
#{sid}-u span {{ border-bottom: 3px solid {C['cyan']}; padding-bottom: 6px; }}"""
    import random
    rnd = random.Random(3)
    dots, js = [], []
    dot_x, dot_y = W / 2 - ww / 2 + ww * 0.8892 + ww * 0.1012 / 2, wt + (ww * 154 / 315) * 0.0158 + ww * 0.1012 / 2
    for i in range(14):
        x, y = rnd.uniform(160, W - 160), rnd.uniform(120, H - 120)
        dots.append(f'<div id="{sid}-c{i}" class="cd" style="left:{x:.0f}px;top:{y:.0f}px"></div>')
        js.append(f'tl.fromTo("#{sid}-c{i}", {{ x: 0, y: 0, opacity: 1 }}, {{ x: {W/2 - x:.0f}, y: {H/2 - y:.0f}, duration: 0.6, ease: "power3.inOut" }}, {0.03 * i:.2f});')
        js.append(f'tl.to("#{sid}-c{i}", {{ opacity: 0, duration: 0.05 }}, {0.62 + 0.03 * i:.2f});')
    body = f"""{floor_svg(sid, draw=False)}
<div id="{sid}-shade" style="position:absolute;inset:0;background:{C['navy']}"></div>
{"".join(dots)}
<div id="{sid}-hero" class="cd" style="left:{W/2}px;top:{H/2}px;width:56px;height:56px;margin:-28px 0 0 -28px"></div>
{wordmark(sid, ww)}{f'{chr(10)}<p id="{sid}-k" class="clip" data-start="0" data-duration="{dur}">{html.escape(kicker)}</p>' if kicker else ""}
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(claim)}</h2>
<p id="{sid}-u" class="clip" data-start="0" data-duration="{dur}"><span>{url}</span></p>"""
    if kicker: js.append(f'tl.fromTo("#{sid}-k", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: "expo.out" }}, 1.3);')
    js += [f'tl.fromTo("#{sid}-shade", {{ opacity: 0.2 }}, {{ opacity: 1, duration: 0.8 }}, 0);',
           f'tl.fromTo("#{sid}-hero", {{ scale: 0 }}, {{ scale: 1, duration: 0.25, ease: "back.out(2)" }}, 0.6);',
           f'tl.to("#{sid}-hero", {{ x: {dot_x - W/2:.0f}, y: {dot_y - H/2:.0f}, scale: {ww*0.1012/56:.3f}, duration: 0.55, ease: "power3.inOut" }}, 0.85);',
           f'tl.fromTo("#{sid}-wm img", {{ clipPath: "inset(0 100% 0 0)" }}, {{ clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power3.out" }}, 1.1);',
           f'tl.set("#{sid}-wmdot", {{ opacity: 0 }}, 0);',
           f'tl.set("#{sid}-wmdot", {{ opacity: 1 }}, 1.4);',
           f'tl.set("#{sid}-hero", {{ opacity: 0 }}, 1.4);',
           f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 1.45);',
           f'tl.fromTo("#{sid}-u", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.25 }}, 1.85);']
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
FILMS = {
    "brand": dict(
        title="REPI · Cada repetición cuenta", dur=48.0,
        music=("heroic-age.mp3", 30.0), sfx=[("whoosh-cinematic", 13.6, 3.2), ("impact-bass-1", 18.0), ("pop", 19.3), ("whoosh", 21.9), ("pop", 23.4), ("pop", 25.6), ("whoosh-short", 27.9), ("whoosh", 33.4), ("whoosh-short", 38.4), ("riser", 41.6, 3.4), ("impact-bass-2", 44.8)], poster=46.5,
        media=["f-intelligence.mp4", "perfil-entrenadores.mp4", "gym-floor.mp4", "gym-owner.mp4"],
        scenes=[
            ("dot", 3.6, lambda s, d: s_dot(s, d, "En la sala de un gimnasio, todos los días.")),
            ("scatter", 14.4, lambda s, d: s_scatter(s, d, "Cada dato, _en_ _otro_ _lado._", "Hasta que *todo* se conecta.", 8.4)),
            ("logo", 4.0, lambda s, d: s_logo(s, d, "_Cada_ _repetición_ cuenta.")),
            ("member", 6.0, lambda s, d: s_device(s, d, [("f-intelligence.mp4", 5.8, 0, 3.0), ("f-intelligence.mp4", 16.2, 3.0, 3.0)], "Un objetivo para *cada* serie.", panels=[
                dict(at=0.9, x=150, y=620, k="REPI recomienda", v="53 kg × 8", cls="a", out=3.0),
                dict(at=3.2, x=150, y=620, k="Serie difícil: 5 de 8. La próxima", v="50 kg × 8–10", cls="t", why="Baja un poco la carga y prioriza completar el rango.")])),
            ("coach", 5.5, lambda s, d: s_device(s, d, [("perfil-entrenadores.mp4", 4.0, 0, 3.0), ("gym-floor.mp4", 2.6, 3.0, 2.5)], "Cada entrenador sabe *a* *quién* atender.", side="right", panels=[
                dict(at=3.2, x=1380, y=650, k="Julián · en su serie", v="Voy", cls="t")])),
            ("owner", 5.5, lambda s, d: s_device(s, d, [("gym-owner.mp4", 5.6, 0, 5.5)], "El dueño *ve* su sala.", sub="Altas por QR, equipo y comunidad, por sede.")),
            ("network", 5.0, lambda s, d: s_network(s, d, "Socios, entrenadores y gimnasio. *Conectados.*")),
            ("end", 4.0, lambda s, d: s_end(s, d, "_Cada_ _repetición_ cuenta.", "repiclub.com/conoce")),
        ]),
}

# Fragmentos de la sala para cada público (texto ilustrativo de cómo se trabaja hoy; ninguna cifra).
FRAGS_GYM = [("paper", 130, 90, -5, "<small>Recepción</small>Alta: Camila R.<br>Rutina: ¿?<br><s>Pagó ¿?</s>"),
             ("chat", 1330, 120, 3, "<small>Grupo socios · 07:10</small>¿Quién me arma la rutina?"),
             ("", 1300, 790, -2, "<small>planilla_altas.xlsx</small>Sin actualizar"),
             ("alert", 200, 800, 4, "<small>Pedido de ayuda</small>Nadie lo vio"),
             ("", 760, 60, -3, "<small>Seguimiento de sala</small>— sin datos —")]
FRAGS_COACH = [("paper", 130, 90, -5, "<small>Rutina_Julian_v4.pdf</small>Sentadilla 4×8<br>Press 3×10<br><s>Remo ¿?</s>"),
               ("chat", 1330, 120, 3, "<small>Alumno · 21:15</small>Profe, ¿qué peso pongo?"),
               ("", 1300, 790, -2, "<small>cargas_alumnos.xlsx</small>Semana sin completar"),
               ("alert", 200, 800, 4, "<small>Alumna nueva</small>Sin programa"),
               ("", 760, 60, -3, "<small>Progreso</small>— sin datos —")]

# Paneles reutilizados: los valores son los que muestra la grabación de la demo (datos ficticios).
P_REC = dict(at=0.9, x=150, y=620, k="REPI recomienda", v="53 kg × 8", cls="a", out=3.4)
P_ADJ = dict(at=3.7, x=150, y=620, k="Serie difícil: 5 de 8. La próxima", v="50 kg × 8–10", cls="t", why="Baja un poco la carga y prioriza completar el rango.")
SERIE = [("f-intelligence.mp4", 5.8, 0, 3.5), ("f-intelligence.mp4", 16.2, 3.5, 3.5)]
END = lambda claim, url: (lambda s, d: s_end(s, d, claim, url))
LOGO = lambda s, d: s_logo(s, d, "_Cada_ _repetición_ cuenta.")

def deportistas(size):
    return dict(
        title="REPI para deportistas", dur=40.0, size=size, music=("volatile-reaction.mp3", 24.0), sfx="auto", poster=16.2,
        scenes=[
            ("dot", 3.0, lambda s, d: s_dot(s, d, "Llegás al gimnasio.")),
            ("home", 4.5, lambda s, d: s_device(s, d, [("perfil-deportistas.mp4", 0.0, 0, 4.5)], "Tu rutina, *lista.*", panels=[
                dict(at=0.9, x=150, y=620, k="Próximo entrenamiento", v="Torso A", cls="a")])),
            ("checkin", 4.0, lambda s, d: s_device(s, d, [("perfil-deportistas.mp4", 4.2, 0, 2.0)], "¿Cómo *llegás* hoy?", side="right", panels=[
                dict(at=0.9, x=760, y=620, k="Antes de empezar", v="Energía, sueño y ánimo", cls="t")])),
            ("serie", 7.0, lambda s, d: s_device(s, d, SERIE, "Un objetivo para *cada* serie.", panels=[P_REC, P_ADJ])),
            ("rest", 4.0, lambda s, d: s_device(s, d, [("perfil-deportistas.mp4", 11.0, 0, 4.0)], "El descanso, *a* *tiempo.*", side="right", panels=[
                dict(at=0.9, x=760, y=620, k="Descanso indicado", v="2:00", cls="t")])),
            ("progress", 5.0, lambda s, d: s_device(s, d, [("perfil-deportistas.mp4", 19.0, 0, 5.0)], "Tu progreso, *a* *la* *vista.*", sub="Fuerza, cargas, repeticiones, volumen y récords.")),
            ("body", 4.0, lambda s, d: s_device(s, d, [("perfil-deportistas.mp4", 24.0, 0, 3.1)], "Tu cuerpo, *con* *tus* *datos.*", side="right", sub="Peso y objetivo, privados.")),
            ("logo", 4.0, LOGO),
            ("end", 4.5, END("Probá *la* *demo.*", "repiclub.com/conoce/deportistas")),
        ])

FILMS.update({
    "gimnasios": dict(
        title="REPI para gimnasios", dur=61.6, music=("five-armies.mp3", 68.0), sfx="auto", poster=46.5,
        scenes=[
            ("dot", 3.6, lambda s, d: s_dot(s, d, "En cada gimnasio, todos los días.")),
            ("scatter", 13.0, lambda s, d: s_scatter(s, d, "Cada sala, _a_ _ciegas._", "Hasta que *todo* se conecta.", 7.4, FRAGS_GYM)),
            ("logo", 4.0, LOGO),
            ("altas", 9.0, lambda s, d: s_device(s, d, [("gym-owner.mp4", 6.0, 0, 3.0), ("gym-owner.mp4", 10.0, 3.0, 3.0), ("gym-owner.mp4", 13.0, 6.0, 3.0)], "Altas por QR, *con* *aprobación.*", panels=[
                dict(at=0.9, x=150, y=620, k="Pedido de acceso · Palermo", v="Camila Ruiz", cls="a", out=5.8),
                dict(at=6.2, x=150, y=620, k="El equipo confirmó", v="Acceso aprobado", cls="t")])),
            ("sala", 8.0, lambda s, d: s_device(s, d, [("gym-floor.mp4", 1.0, 0, 4.0), ("gym-floor.mp4", 5.0, 4.0, 4.0)], "El equipo sabe *a* *quién* atender.", side="right", panels=[
                dict(at=0.9, x=760, y=620, k="Julián · Sentadilla", v="Que venga alguien", cls="a", out=3.8),
                dict(at=4.2, x=760, y=620, k="Sofía · equipo de sala", v="Voy", cls="t")])),
            ("serie", 7.0, lambda s, d: s_device(s, d, SERIE, "Cada socio entrena *con* *objetivo.*", panels=[P_REC, P_ADJ])),
            ("owner", 7.0, lambda s, d: s_device(s, d, [("gym-owner.mp4", 0.0, 0, 4.6), ("gym-owner.mp4", 17.9, 4.6, 0.9)], "Tu gimnasio, *de* *un* *vistazo.*", side="right", sub="Por sede: equipo, altas, sala y comunidad.")),
            ("network", 5.5, lambda s, d: s_network(s, d, "Socios, equipo y gerencia. *Conectados.*")),
            ("end", 4.5, END("Quiero REPI *en* *mi* *gimnasio.*", "repiclub.com/conoce/gimnasios")),
        ]),
    "entrenadores": dict(
        title="REPI para entrenadores", dur=49.1, music=("exciting-trailer.mp3", 4.0), sfx="auto", poster=21.0,
        scenes=[
            ("dot", 3.6, lambda s, d: s_dot(s, d, "Un entrenador, muchos alumnos.")),
            ("scatter", 12.0, lambda s, d: s_scatter(s, d, "Cada alumno, _en_ _otro_ _chat._", "Hasta que *tu* *método* se ordena.", 6.8, FRAGS_COACH)),
            ("logo", 4.0, LOGO),
            ("clients", 6.5, lambda s, d: s_device(s, d, [("perfil-entrenadores.mp4", 3.0, 0, 3.0), ("perfil-entrenadores.mp4", 9.0, 3.0, 3.5)], "Todos tus alumnos, *de* *un* *vistazo.*", panels=[
                dict(at=0.9, x=150, y=620, k="Julián Ortiz", v="Sin programa", cls="a", out=3.0),
                dict(at=3.3, x=150, y=620, k="Training Intelligence · Valentina", v="Sin tendencia aún", cls="t", why="Con pocas sesiones comparables, REPI lo dice en lugar de inventar.")])),
            ("programs", 6.5, lambda s, d: s_device(s, d, [("perfil-entrenadores.mp4", 14.0, 0, 4.0), ("perfil-entrenadores.mp4", 18.0, 4.0, 1.3)], "Tu programa, *a* *tu* *manera.*", side="right", panels=[
                dict(at=1.0, x=760, y=620, k="Programa · versión 1", v="Fuerza base · 2 días", cls="a")])),
            ("serie", 7.0, lambda s, d: s_device(s, d, SERIE, "Y cada alumno, *serie* *por* *serie.*", panels=[P_REC, P_ADJ])),
            ("rule", 5.0, lambda s, d: s_statement(s, d, "REPI propone. *Vos* *decidís.*", sub="Nada se asigna solo.")),
            ("end", 4.5, END("Soy *entrenador.*", "repiclub.com/conoce/entrenadores")),
        ]),
    "deportistas": deportistas((1920, 1080)),
    "deportistas-vertical": deportistas((1080, 1920)),
    "aliados": dict(
        title="REPI · Tecnología para el entrenamiento", dur=66.5, music=("rising-game.mp3", 25.0), sfx="auto", poster=31.2,
        scenes=[
            ("dot", 4.0, lambda s, d: s_dot(s, d, "Gimnasios y entrenadores, con papel, planillas y mensajes.")),
            ("scatter", 12.0, lambda s, d: s_scatter(s, d, "La sala, _sin_ _datos._", "REPI la *conecta.*", 6.8, FRAGS_GYM)),
            ("logo", 4.0, LOGO),
            ("model", 6.0, lambda s, d: s_statement(s, d, "Gimnasios y entrenadores *la* *contratan.*", sub="Sus socios y alumnos la usan cada vez que entrenan.")),
            ("serie", 7.0, lambda s, d: s_device(s, d, SERIE, "Recomendaciones *que* *se* *explican.*", panels=[P_REC, P_ADJ])),
            ("coach", 6.5, lambda s, d: s_device(s, d, [("perfil-entrenadores.mp4", 3.0, 0, 3.0), ("perfil-entrenadores.mp4", 14.0, 3.0, 3.5)], "Para entrenadores *independientes.*", side="right")),
            ("owner", 6.5, lambda s, d: s_device(s, d, [("gym-owner.mp4", 0.0, 0, 3.0), ("gym-owner.mp4", 6.0, 3.0, 3.5)], "Y para gimnasios, *por* *sede.*")),
            ("tech", 5.0, lambda s, d: s_statement(s, d, "Funciona *sin* *señal.* Se instala *sin* *tiendas.*")),
            ("proof", 6.0, lambda s, d: s_statement(s, d, "En operación en *gimnasios* *reales.*", sub="Mar del Plata, Argentina.")),
            ("network", 5.0, lambda s, d: s_network(s, d, "Gimnasios, entrenadores y alumnos. *Conectados.*")),
            ("end", 4.5, END("Proponé *una* *alianza.*", "repiclub.com/conoce/aliados")),
        ]),
    "intelligence": dict(
        title="Training Intelligence", dur=33.0, music=("volatile-reaction.mp3", 120.0), sfx="auto", poster=21.5,
        scenes=[
            ("dot", 3.0, lambda s, d: s_dot(s, d, "Cada serie deja un dato.")),
            ("prev", 5.0, lambda s, d: s_device(s, d, [("f-intelligence.mp4", 5.0, 0, 5.0)], "Lo que hiciste *la* *última* *vez.*", panels=[
                dict(at=0.9, x=150, y=620, k="Anterior", v="53 kg × 8")])),
            ("rec", 5.5, lambda s, d: s_device(s, d, [("f-intelligence.mp4", 9.0, 0, 5.5)], "Lo que REPI *propone*, con la razón.", side="right", panels=[
                dict(at=0.9, x=760, y=620, k="REPI recomienda", v="53 kg × 8", cls="a", why="Repetí la carga y buscá llegar a 8 en todas.")])),
            ("real", 5.0, lambda s, d: s_device(s, d, [("f-intelligence.mp4", 12.0, 0, 4.2)], "Lo que *pasó.*", panels=[
                dict(at=0.9, x=150, y=620, k="Real · serie difícil", v="53 kg × 5")])),
            ("next", 6.0, lambda s, d: s_device(s, d, [("f-intelligence.mp4", 16.2, 0, 4.7)], "Y la próxima *se* *ajusta.*", side="right", panels=[
                dict(at=0.9, x=760, y=620, k="Serie difícil: 5 de 8. La próxima", v="50 kg × 8–10", cls="t", why="Baja un poco la carga y prioriza completar el rango.")])),
            ("rule", 4.0, lambda s, d: s_statement(s, d, "*Nunca* sube a mitad de la sesión.")),
            ("end", 4.5, END("Probalo *con* *el* *motor* *real.*", "repiclub.com/conoce")),
        ]),
    "progreso": dict(
        title="Progreso por ejercicio", dur=22.5, music=("clash-defiant.mp3", 150.0), sfx="auto", poster=4.5,
        scenes=[
            ("dot", 3.0, lambda s, d: s_dot(s, d, "Cada serie que registrás, suma.")),
            ("prog", 6.0, lambda s, d: s_device(s, d, [("perfil-deportistas.mp4", 19.0, 0, 5.0)], "Tu progreso, *por* *ejercicio.*", sub="Fuerza, cargas, repeticiones, volumen y récords.")),
            ("calc", 3.5, lambda s, d: s_statement(s, d, "Calculado desde *lo* *que* *registrás.*")),
            ("body", 5.5, lambda s, d: s_device(s, d, [("perfil-deportistas.mp4", 24.0, 0, 3.1)], "Tu cuerpo, *con* *tus* *datos.*", side="right", sub="Peso, objetivo y fotos privadas, sólo para vos.")),
            ("end", 4.5, END("Mirá *tu* *progreso.*", "repiclub.com/conoce/deportistas")),
        ]),
    "altas": dict(
        title="Altas por QR", dur=23.5, music=("five-armies.mp3", 120.0), sfx="auto", poster=12.5,
        scenes=[
            ("dot", 3.0, lambda s, d: s_dot(s, d, "Un QR por sede.")),
            ("req", 7.0, lambda s, d: s_device(s, d, [("gym-owner.mp4", 6.0, 0, 3.5), ("gym-owner.mp4", 10.0, 3.5, 3.5)], "Cada socio *pide* *acceso.*", panels=[
                dict(at=1.0, x=150, y=620, k="Pedido de acceso", v="Camila Ruiz", cls="a", out=3.4),
                dict(at=3.8, x=150, y=620, k="Confirmación del equipo", v="Lo conozco", cls="t")])),
            ("ok", 5.0, lambda s, d: s_device(s, d, [("gym-owner.mp4", 13.0, 0, 3.8)], "El equipo *confirma* quién es socio.", side="right", panels=[
                dict(at=1.0, x=760, y=620, k="Resueltas · 7 días", v="Acceso aprobado", cls="t")])),
            ("rule", 4.0, lambda s, d: s_statement(s, d, "Identidad *no* *es* pertenencia.", sub="El acceso siempre lo aprueba una persona.")),
            ("end", 4.5, END("Quiero REPI *en* *mi* *gimnasio.*", "repiclub.com/conoce/gimnasios")),
        ]),
    "sala": dict(
        title="Seguimiento de sala", dur=23.5, music=("clash-defiant.mp3", 0.0), sfx="auto", poster=13.0,
        scenes=[
            ("dot", 3.0, lambda s, d: s_dot(s, d, "En plena serie.")),
            ("net", 5.0, lambda s, d: s_network(s, d, "El socio *pide* *ayuda* desde su serie.")),
            ("floor", 7.0, lambda s, d: s_device(s, d, [("gym-floor.mp4", 1.0, 0, 4.0), ("gym-floor.mp4", 5.0, 4.0, 3.0)], "El equipo *responde.*", panels=[
                dict(at=0.9, x=150, y=620, k="Julián · Sentadilla", v="Que venga alguien", cls="a", out=3.8),
                dict(at=4.2, x=150, y=620, k="Sofía · equipo de sala", v="Voy", cls="t")])),
            ("rule", 4.0, lambda s, d: s_statement(s, d, "Una señal para acercarse, *no* *un* *diagnóstico.*")),
            ("end", 4.5, END("Quiero REPI *en* *mi* *gimnasio.*", "repiclub.com/conoce/gimnasios")),
        ]),
})

# ── Modos de REPI (D213): Completo y Control, 16:9 y 9:16 ────────────────────────────────────────────────────────────────
# Grabaciones nuevas (tools/rec-raw.mjs, demo local con datos ficticios): ctl-kiosk (pantalla de rutinas 1280×800 de la demo
# «control», Gimnasio Atlas, sin la lista de personas), ctl-staff (profesor de sala de la demo «floor», Gym Norte: crea el
# programa de Martina y ajusta el de Julián a la revisión 2), cmp-coach (coach: ficha de Valentina, diseña y asigna
# «Hipertrofia · 3 días») y cmp-owner (Seguimiento de sala). Del socio se reusan f-intelligence y perfil-deportistas.
# Los valores de los paneles son los que se ven en esas grabaciones.
FRAGS_CONTROL = [("paper", 130, 90, -5, "<small>Rutina · hoja impresa</small>Sentadilla 4×8<br><s>Prensa 3×12</s> 3×10<br>Remo ¿?"),
                 ("paper", 1330, 120, 4, "<small>rutina_final_v3(2).pdf</small>¿Cuál es la vigente?"),
                 ("chat", 1300, 790, -2, "<small>Socio · 07:40</small>Profe, ¿me pasás la rutina?"),
                 ("", 200, 800, 3, "<small>Carpeta de recepción</small>Hoja perdida"),
                 ("", 760, 60, -3, "<small>Cambios del profesor</small>— sin registro —")]
KIOSK = "ctl-kiosk.mp4"
SP = 11.0 / 6.5  # código y PIN, de 5,9 a 16,9 s de la grabación, en 6,5 s de pantalla
ID_KEYS = [round((t - 5.93) / SP, 2) for t in (6.45, 7.25, 8.02, 8.80, 9.59, 10.37, 12.25, 13.15, 14.04, 14.92, 16.35)]

def dev(*a, **k):
    """s_device de los modos: los paneles salen con el teléfono (no quedan solos en el último instante)."""
    return s_device(*a, exit_panels=True, **k)

def modo_completo(size):
    vertical = size[1] > size[0]
    return dict(
        title="REPI Completo · Entrenamiento inteligente", dur=56.0, size=size, music=("volatile-reaction.mp3", 64.0), sfx="auto", poster=26.5,
        scenes=[
            ("dot", 2.5, lambda s, d: s_dot(s, d, "Un profesor, un socio y una sala.")),
            ("logo", 2.5, lambda s, d: s_logo(s, d, "_Entrenamiento_ inteligente.")),
            ("disena", 6.0, lambda s, d: dev(s, d, [("cmp-coach.mp4", 23.8, 0, 1.4), ("cmp-coach.mp4", 25.4, 1.4, 4.6)], "El profesor *diseña* el programa.", panels=[
                dict(at=0.9, x=150, y=620, k="Programa · versión 1", v="Hipertrofia · 3 días", cls="a")])),
            ("asigna", 5.0, lambda s, d: dev(s, d, [("cmp-coach.mp4", 31.6, 0, 5.0)], "Y lo *asigna.*", side="right", panels=[
                dict(at=2.9, x=760, y=620, k="Programa asignado a", v="Valentina y Julián", cls="t")])),
            ("recibe", 4.0, lambda s, d: dev(s, d, [("perfil-deportistas.mp4", 0.0, 0, 4.0)], "El socio *lo* *recibe.*", panels=[
                dict(at=0.9, x=150, y=620, k="Próximo entrenamiento", v="Torso A", cls="a")])),
            ("registra", 4.5, lambda s, d: dev(s, d, [("perfil-deportistas.mp4", 8.7, 0, 4.5)], "Registra *cada* *serie.*", side="right", panels=[
                dict(at=1.6, x=760, y=620, k="Descanso indicado", v="2:00", cls="a")])),
            ("serie", 7.0, lambda s, d: dev(s, d, SERIE, "REPI *recomienda*, con la razón.", panels=[P_REC, P_ADJ])),
            ("progreso", 5.0, lambda s, d: dev(s, d, [("perfil-deportistas.mp4", 19.0, 0, 5.0)], "Su progreso, *por* *ejercicio.*", side="right", sub="Cargas, repeticiones, volumen y récords.")),
            ("consulta", 5.5, lambda s, d: dev(s, d, [("cmp-coach.mp4", 4.0, 0, 1.8), ("cmp-coach.mp4", 8.2, 1.8, 3.7)], "El profesor *ve* *su* *evolución.*", panels=[
                dict(at=2.2, x=150, y=620, k="Remo en polea", v="+2,5 kg", cls="a", why="Contra la vez anterior, en su registro de sesiones.")])),
            ("gimnasio", 5.5, lambda s, d: dev(s, d, [("cmp-owner.mp4", 2.0, 0, 5.5)], "El gimnasio *sigue* su sala.", side="right", sub="Seguimiento de sala y equipo, por sede.")),
            ("red", 4.0, (lambda s, d: s_statement(s, d, "Profesor, socio y gimnasio. *Conectados.*")) if vertical else (lambda s, d: s_network(s, d, "Profesor, socio y gimnasio. *Conectados.*"))),
            ("end", 4.5, lambda s, d: s_end(s, d, "*Entrenamiento* inteligente.", "repiclub.com/conoce", kicker="REPI Completo")),
        ])

def modo_control(size):
    return dict(
        title="REPI Control · Tu equipo planifica. Tus socios consultan.", dur=59.5, size=size, music=("clash-defiant.mp3", 203.0), sfx="auto", poster=39.5,
        scenes=[
            ("dot", 2.5, lambda s, d: s_dot(s, d, "En la sala, cada socio busca su rutina.")),
            ("scatter", 9.0, lambda s, d: s_scatter(s, d, "Rutinas _difíciles_ _de_ _consultar._", "REPI las *centraliza.*", 5.0, FRAGS_CONTROL, calls=2.2, appear=0.85, waves=2)),
            ("logo", 2.5, lambda s, d: s_logo(s, d, "_Tu_ _equipo_ planifica.")),
            ("crea", 6.5, lambda s, d: dev(s, d, [("ctl-staff.mp4", 4.3, 0, 1.4), ("ctl-staff.mp4", 8.4, 1.4, 2.4), ("ctl-staff.mp4", 20.6, 3.8, 2.7)], "El profesor *arma* la rutina.", panels=[
                dict(at=1.4, x=150, y=620, k="Martina López · programa nuevo", v="Fuerza inicial · 2 días", cls="a")])),
            ("asigna", 4.0, lambda s, d: dev(s, d, [("ctl-staff.mp4", 27.4, 0, 4.0)], "Y la *asigna* al socio.", side="right", panels=[
                dict(at=1.3, x=760, y=620, k="Programa institucional", v="Revisión 1", cls="t", why="Queda asignado al socio, con autor y motivo.")])),
            ("llega", 3.0, lambda s, d: s_arrive(s, d, "El socio *llega* al gimnasio.")),
            ("pantalla", 3.5, lambda s, d: s_tablet(s, d, [(KIOSK, 0.2, 0, 3.5)], "Una pantalla *compartida*, en la sala.", sub="La pone el gimnasio, para todos sus socios.")),
            ("id", 6.5, lambda s, d: s_tablet(s, d, [(KIOSK, 5.9, 0, 6.5, SP)], "Se identifica *con* *código* *y* *PIN.*", keys=ID_KEYS, panels=[
                dict(at=0.6, k="Código de socio", v="6 números", cls="a", out=3.4),
                dict(at=3.7, k="PIN", v="• • • •", cls="a", why="Nadie más lo ve: se muestran puntos.")])),
            ("rutina", 5.0, lambda s, d: s_tablet(s, d, [(KIOSK, 16.7, 0, 5.0)], "Y consulta su rutina, *sin* *instalar* *nada.*", panels=[
                dict(at=1.0, k="Hola, Ana P.", v="Fuerza base · 3 días", cls="a", why="Planificado por el equipo de Gimnasio Atlas · versión 2.")])),
            ("terminar", 4.0, lambda s, d: s_tablet(s, d, [(KIOSK, 25.3, 0, 4.0)], "Toca *Terminar.*", sub="La pantalla queda libre para la próxima persona.", focus=dict(x=90, y=14, s=1.5, at=0.0, d=0.6, out=1.2))),
            ("qr", 4.0, lambda s, d: s_tablet(s, d, [(KIOSK, 30.2, 0, 0.6)], "Y si quiere, *REPI* *en* *su* *celular.*", sub="QR opcional. No es el QR de ingreso al gimnasio.", focus=dict(x=94, y=52, s=1.7, at=0.5, d=1.0))),
            ("control", 4.5, lambda s, d: dev(s, d, [("ctl-staff.mp4", 48.0, 0, 4.5)], "Los cambios, *siempre* *del* *equipo.*", panels=[
                dict(at=1.2, x=150, y=620, k="Julián Ortiz · revisiones", v="Versión 2", cls="t", why="Cada cambio con autor y motivo. El socio sólo consulta.")])),
            ("end", 4.5, lambda s, d: s_end(s, d, "Tu equipo planifica. *Tus* *socios* *consultan.*", "repiclub.com/conoce?modo=control", kicker="REPI Control")),
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
<div id="root" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="{w}" data-height="{h}" data-motion-blur="on">
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
    if not all(os.path.exists(x) for x in srcs): return
    args, parts = [], []
    for i, (c, src) in enumerate(zip(clips, srcs)):
        f, ms, st, du = c[:4]; sp = c[4] if len(c) > 4 else 1.0
        args += ["-ss", f"{ms}", "-t", f"{du * sp:.3f}", "-i", src]
        parts.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps=30,scale={size[0]}:{size[1]},setsar=1[v{i}]")
    cover = sum(c[3] for c in clips)
    graph = ";".join(parts) + ";" + "".join(f"[v{i}]" for i in range(len(clips))) + f"concat=n={len(clips)}:v=1:a=0[c];[c]tpad=stop_mode=clone:stop_duration={max(0, dur - cover) + 0.5:.2f}[out]"
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
            out.append(("riser", round(max(0, t + 1.4 - 3.2), 2), 3.4))
            out.append(("impact-bass-2", round(t + 1.4, 2)))
        elif i > 0: out.append(("whoosh" if i % 2 else "whoosh-short", round(max(0, t - 0.12), 2)))
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
    shutil.copy(os.path.join(REPO, "apps", "web", "public", "conoce", "smart-center-gym.webp"), os.path.join(d, "assets", "brand", "smart-center-gym.webp"))
    if MEDIA_SRC:
        for fn in [f["music"][0]]:
            src = next((os.path.join(MEDIA_SRC, sub, fn) for sub in ("footage", "audio") if os.path.exists(os.path.join(MEDIA_SRC, sub, fn))), None)
            if src: shutil.copy(src, os.path.join(d, "assets", "media", fn))
    t, hosts = 0.0, []
    PRECUTS.clear()
    for sid, dur, fn in f["scenes"]:
        open(os.path.join(d, "compositions", f"{sid}.html"), "w").write(fn(sid, dur))
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
    open(os.path.join(d, "index.html"), "w").write(INDEX.format(res="landscape" if W > H else "portrait", w=W, h=H, dur=f["dur"], title=f["title"], hosts="\n".join(hosts), music=f["music"][0], mstart=f["music"][1], sfx=sfx))
    open(os.path.join(d, ".gitignore"), "w").write("assets/media/\nassets/sfx/\nrenders/\nsnapshots/\n.hyperframes/\n")
    print("ok", name, f"{t:.1f}s", len(f["scenes"]), "escenas")

if __name__ == "__main__":
    for n in (sys.argv[1:] or FILMS): build(n)
