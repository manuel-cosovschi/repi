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
M = 44  # px por metro
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

def scene(sid, dur, css, body, js, w=W, h=H):
    """Sub-composición: plantilla con #root, timeline pausada registrada con la id de la escena."""
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
    out = []
    for t in text.split(" "):
        k = cls
        if t.startswith("*") and t.endswith("*"): t, k = t[1:-1], cls + " a"
        elif t.startswith("_") and t.endswith("_"): t, k = t[1:-1], cls + " m"
        out.append(f'<span class="{k}">{html.escape(t)}</span>')
    return " ".join(out)

# ── Escenas ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def s_dot(sid, dur, line):
    """Plano oscuro: el punto cian cae al centro y la sala se dibuja desde él. Una línea tranquila."""
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
FRAGS = [("paper", 130, 90, -5, "<small>Rutina</small>Sentadilla 4×8<br>Prensa 3×12<br><s>Remo ¿?</s>"),
         ("chat", 1330, 120, 3, "<small>Socio · 19:42</small>Profe, ¿qué me toca hoy?"),
         ("", 1300, 790, -2, "<small>planilla_socios_v3.xlsx</small>412 filas · sin actualizar"),
         ("alert", 200, 800, 4, "<small>Pedido de ayuda</small>Nadie lo vio"),
         ("", 760, 60, -3, "<small>Progreso</small>— sin datos —")]
FRAG_C = (200, 85)  # centro aproximado de cada tarjeta, para los trazos

def s_scatter(sid, dur, t1, t2, connect_at):
    """Fragmentos sueltos sobre la sala; después, trazos que los conectan con el punto cian."""
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
    for w in range(3):
        for i, (k, x, y, r, txt) in enumerate(FRAGS):
            pk.append(f'<div id="{sid}-k{w}{i}" class="{sid}-pk" style="left:{x + FRAG_C[0]}px;top:{y + FRAG_C[1]}px"></div>')
    body = body.replace(f'<div id="{sid}-dot"', "".join(pk) + f'\n<div id="{sid}-dot"')
    js = [f'tl.fromTo("#{sid}-floor", {{ scale: 1 }}, {{ scale: 1.06, duration: {dur}, ease: "none" }}, 0);']
    # Antes de conectarse, cada fragmento «llama» y nadie responde.
    for i in range(len(FRAGS)):
        at = 5.0 + i * 0.68
        js.append(f'tl.to("#{sid}-f{i}", {{ y: -14, duration: 0.16, ease: "power2.out" }}, {at:.2f});')
        js.append(f'tl.to("#{sid}-f{i}", {{ y: 0, duration: 0.4, ease: "back.out(2.4)" }}, {at + 0.16:.2f});')
    # Ya conectados, los datos viajan por los trazos al punto, en tres oleadas.
    for w in range(3):
        at = connect_at + 0.9 + w * 1.1
        for i, (k, x, y, r, txt) in enumerate(FRAGS):
            js.append(f'tl.fromTo("#{sid}-k{w}{i}", {{ x: 0, y: 0, opacity: 0 }}, {{ x: {W/2 - x - FRAG_C[0]}, y: {H/2 - y - FRAG_C[1]}, opacity: 1, duration: 0.7, ease: "power2.in" }}, {at + i * 0.05:.2f});')
            js.append(f'tl.set("#{sid}-k{w}{i}", {{ opacity: 0 }}, {at + i * 0.05 + 0.7:.2f});')
        js.append(f'tl.to("#{sid}-dot", {{ scale: 1.35, duration: 0.12, ease: "power2.out" }}, {at + 0.72:.2f});')
        js.append(f'tl.to("#{sid}-dot", {{ scale: 1, duration: 0.35, ease: "back.out(1.6)" }}, {at + 0.84:.2f});')
    for i in range(len(FRAGS)):
        js.append(f'tl.fromTo("#{sid}-f{i}", {{ opacity: 0, scale: 0.6 }}, {{ opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }}, {0.3 + i * 1.05:.2f});')
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
    css = WM_CSS + f"""#{sid}-flood {{ position: absolute; inset: 0; background: {C['cyan']}; }}
#{sid}-wm {{ left: {W/2-330}px; top: 250px; }}
#{sid}-t {{ position: absolute; left: 0; right: 0; top: 620px; text-align: center; }}"""
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

def s_device(sid, dur, clips, title, sub=None, panels=(), side="left", still=None):
    """La app real: grabación (o captura) en el teléfono, con título al costado y paneles con los valores reales
    de la acción a tamaño grande. `clips`: [(archivo, media_start, inicio, duración)] cortados dentro del teléfono."""
    px = 1260 if side == "left" else 190
    tx = 150 if side == "left" else 760
    css = PHONE_CSS + f"""#{sid}-ph {{ left: {px}px; top: 32px; }}
#{sid}-t {{ position: absolute; left: {tx}px; top: 300px; width: 980px; }}
#{sid}-sub {{ position: absolute; left: {tx}px; top: 560px; width: 900px; }}"""
    vids = []
    for i, (f, ms, st, du) in enumerate(clips):
        vids.append(f'<video id="{sid}-v{i}" class="clip" src="assets/media/{f}" muted playsinline data-start="{st}" data-duration="{du}" data-media-start="{ms}" data-track-index="{2 + i}"></video>')
    if still: vids.append(f'<img src="assets/media/{still}" alt="">')
    pnl = []
    for j, p in enumerate(panels):
        cls = p.get("cls", "")
        pnl.append(f'<div id="{sid}-p{j}" class="panel clip" data-start="{p["at"]}" data-duration="{p.get("dur", dur - p["at"])}" style="left:{p["x"]}px;top:{p["y"]}px"><small>{p["k"]}</small><b class="{cls}">{p["v"]}</b>{f"<p>{p["why"]}</p>" if p.get("why") else ""}</div>')
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
        js.append(f'tl.fromTo("#{sid}-p{j}", {{ opacity: 0, x: {"-80" if side == "left" else "80"}, scale: 0.9 }}, {{ opacity: 1, x: 0, scale: 1, duration: 0.55, ease: "expo.out" }}, {p["at"]});')
        if p.get("out"): js.append(f'tl.to("#{sid}-p{j}", {{ opacity: 0, filter: "blur(8px)", duration: 0.2 }}, {p["out"]});')
    js.append(f'tl.to("#{sid}-ph, #{sid}-t, #{sid}-sub", {{ x: {-W if side == "left" else W}, filter: "blur(14px)", duration: 0.3, ease: "power3.in" }}, {dur - 0.32});')
    return scene(sid, dur, css, body, "\n".join(js))

def s_network(sid, dur, title):
    """La sala entera: socios y equipo moviéndose, un pedido que viaja del socio al entrenador y vuelve «Voy»."""
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

def s_end(sid, dur, claim, url):
    """Los puntos de la sala convergen en uno, que sube a su lugar sobre la «ı» del wordmark. Frase y dirección."""
    css = WM_CSS + f""".cd {{ position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: {C['cyan']}; }}
#{sid}-wm {{ left: {W/2-280}px; top: 250px; }}
#{sid}-t {{ position: absolute; left: 0; right: 0; top: 590px; text-align: center; }}
#{sid}-u {{ position: absolute; left: 0; right: 0; top: 820px; text-align: center; font: 600 46px "Barlow"; color: {C['white']}; }}
#{sid}-u span {{ border-bottom: 3px solid {C['cyan']}; padding-bottom: 6px; }}"""
    import random
    rnd = random.Random(3)
    dots, js = [], []
    dot_x, dot_y = W / 2 - 280 + 560 * 0.8892 + 560 * 0.1012 / 2, 250 + (560 * 154 / 315) * 0.0158 + 560 * 0.1012 / 2
    for i in range(14):
        x, y = rnd.uniform(160, W - 160), rnd.uniform(120, H - 120)
        dots.append(f'<div id="{sid}-c{i}" class="cd" style="left:{x:.0f}px;top:{y:.0f}px"></div>')
        js.append(f'tl.fromTo("#{sid}-c{i}", {{ x: 0, y: 0, opacity: 1 }}, {{ x: {W/2 - x:.0f}, y: {H/2 - y:.0f}, duration: 0.6, ease: "power3.inOut" }}, {0.03 * i:.2f});')
        js.append(f'tl.to("#{sid}-c{i}", {{ opacity: 0, duration: 0.05 }}, {0.62 + 0.03 * i:.2f});')
    body = f"""{floor_svg(sid, draw=False)}
<div id="{sid}-shade" style="position:absolute;inset:0;background:{C['navy']}"></div>
{"".join(dots)}
<div id="{sid}-hero" class="cd" style="left:{W/2}px;top:{H/2}px;width:56px;height:56px;margin:-28px 0 0 -28px"></div>
{wordmark(sid, 560)}
<h2 id="{sid}-t" class="h clip" data-start="0" data-duration="{dur}">{words(claim)}</h2>
<p id="{sid}-u" class="clip" data-start="0" data-duration="{dur}"><span>{url}</span></p>"""
    js += [f'tl.fromTo("#{sid}-shade", {{ opacity: 0.2 }}, {{ opacity: 1, duration: 0.8 }}, 0);',
           f'tl.fromTo("#{sid}-hero", {{ scale: 0 }}, {{ scale: 1, duration: 0.25, ease: "back.out(2)" }}, 0.6);',
           f'tl.to("#{sid}-hero", {{ x: {dot_x - W/2:.0f}, y: {dot_y - H/2:.0f}, scale: {560*0.1012/56:.3f}, duration: 0.55, ease: "power3.inOut" }}, 0.85);',
           f'tl.fromTo("#{sid}-wm img", {{ clipPath: "inset(0 100% 0 0)" }}, {{ clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power3.out" }}, 1.1);',
           f'tl.set("#{sid}-wmdot", {{ opacity: 0 }}, 0);',
           f'tl.set("#{sid}-wmdot", {{ opacity: 1 }}, 1.4);',
           f'tl.set("#{sid}-hero", {{ opacity: 0 }}, 1.4);',
           f'tl.fromTo("#{sid}-t .w", {{ opacity: 0, filter: "blur(6px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.14, stagger: 0.08 }}, 1.45);',
           f'tl.fromTo("#{sid}-u", {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.25 }}, 1.85);']
    return scene(sid, dur, css, body, "\n".join(js))

# ── Guiones ─────────────────────────────────────────────────────────────────────────────────────────────────────────
FILMS = {
    "brand": dict(
        title="REPI · Cada repetición cuenta", dur=48.0,
        music=("heroic-age.mp3", 30.0), sfx=[("whoosh-cinematic", 13.9), ("impact-bass-1", 18.0), ("pop", 19.3), ("whoosh", 21.9), ("pop", 23.4), ("pop", 25.6), ("whoosh-short", 27.9), ("whoosh", 33.4), ("whoosh-short", 38.4), ("riser", 41.0), ("impact-bass-2", 44.8)],
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

INDEX = """<!doctype html>
<html lang="es" data-resolution="landscape">
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

def build(name):
    f = FILMS[name]
    d = os.path.join(ROOT, name)
    os.makedirs(os.path.join(d, "compositions"), exist_ok=True)
    for sub in ("fonts", "brand", "media", "sfx"): os.makedirs(os.path.join(d, "assets", sub), exist_ok=True)
    mot = os.path.join(REPO, "design", "motion", "assets")
    for fn in ("barlow-400.woff2", "barlow-600.woff2", "barlowcondensed-700.woff2", "barlow-OFL.txt", "barlowcondensed-OFL.txt"):
        shutil.copy(os.path.join(mot, "fonts", fn), os.path.join(d, "assets", "fonts", fn))
    shutil.copy(os.path.join(mot, "brand", "wm_full.png"), os.path.join(d, "assets", "brand", "wm_full.png"))
    if MEDIA_SRC:
        for fn in f["media"] + [f["music"][0]]:
            src = next((os.path.join(MEDIA_SRC, sub, fn) for sub in ("footage", "audio") if os.path.exists(os.path.join(MEDIA_SRC, sub, fn))), None)
            if src: shutil.copy(src, os.path.join(d, "assets", "media", fn))
        sfx_dir = os.path.expanduser("~/.agents/skills/media-use/audio/assets/sfx")
        for n, _ in f["sfx"]:
            if os.path.exists(os.path.join(sfx_dir, n + ".mp3")): shutil.copy(os.path.join(sfx_dir, n + ".mp3"), os.path.join(d, "assets", "sfx", n + ".mp3"))
    t, hosts = 0.0, []
    for sid, dur, fn in f["scenes"]:
        open(os.path.join(d, "compositions", f"{sid}.html"), "w").write(fn(sid, dur))
        hosts.append(f'<div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{t:.2f}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>')
        t += dur
    assert abs(t - f["dur"]) < 0.01, f"{name}: escenas suman {t}, film {f['dur']}"
    sfx = "\n".join(f'<audio id="sfx{i}" src="assets/sfx/{n}.mp3" data-start="{at}" data-duration="{sfx_len(os.path.join(d, "assets", "sfx", n + ".mp3"))}" data-volume="0.55"></audio>' for i, (n, at) in enumerate(f["sfx"]))
    open(os.path.join(d, "index.html"), "w").write(INDEX.format(w=W, h=H, dur=f["dur"], title=f["title"], hosts="\n".join(hosts), music=f["music"][0], mstart=f["music"][1], sfx=sfx))
    open(os.path.join(d, ".gitignore"), "w").write("assets/media/\nassets/sfx/\nrenders/\nsnapshots/\n.hyperframes/\n")
    print("ok", name, f"{t:.1f}s", len(f["scenes"]), "escenas")

if __name__ == "__main__":
    for n in (sys.argv[1:] or FILMS): build(n)
