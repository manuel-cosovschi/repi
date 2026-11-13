"""Descripción en texto de cada film (alternativa para quien no ve la imagen; los films no tienen voz).
Lee los guiones de build.py sin renderizar nada: reemplaza las funciones de escena por otras que anotan qué se ve y qué
texto aparece. Escribe, por film, una pista WebVTT de descripciones (<id>.descripcion.vtt, junto al video web) para lectores
de pantalla. El reproductor de /conoce muestra sólo el resumen de cada film (content/conoce.ts), pedido del titular 07/11.
Uso: python3 tools/describe.py [film ...]   (sin argumentos, los 11; no necesita los medios)"""
import importlib.util, os, re

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("build", os.path.join(KIT, "build.py"))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
REPO = b.REPO
WEB = {"brand": "film-marca", "gimnasios": "perfil-gimnasios", "entrenadores": "perfil-entrenadores", "deportistas": "perfil-deportistas",
       "aliados": "perfil-aliados", "intelligence": "f-intelligence", "progreso": "f-progreso", "altas": "f-altas", "sala": "f-sala",
       "modo-completo": "modo-completo", "modo-control": "modo-control"}
DEMO = "Pantalla de la app REPI (demo con datos ficticios)"
KIOSK = "Pantalla de rutinas de REPI en la tablet del gimnasio (demo con datos ficticios)"

def plain(t):  # *x* / _x_ son énfasis del guion; las tarjetas usan algo de HTML
    t = re.sub(r"<br\s*/?>", ", ", t); t = re.sub(r"<small>(.*?)</small>", r"\1: ", t); t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"(?<!\w)([*_])(.+?)\1(?!\w)", r"\2", t); return re.sub(r"\s+", " ", t).replace(" ,", ",").strip()

def q(t): return f"«{plain(t)}»"
def panel(p): return f"{plain(p['k'])}: {plain(p['v'])}." + (f" {plain(p['why'])}" if p.get("why") else "")

R = {
    "s_dot": lambda sid, dur, line: f"Un punto cian sobre el plano de la sala, vista desde arriba. Texto: {q(line)}",
    "s_scatter": lambda sid, dur, t1, t2, connect_at, frags_def=None, **k: (
        "Notas sueltas por la sala: " + "; ".join(plain(f[4]) for f in (frags_def or b.FRAGS_SALA)) + f". Texto: {q(t1)} "
        f"Las notas se conectan con líneas hacia el centro. Texto: {q(t2)}"),
    "s_logo": lambda sid, dur, claim: f"Logo de REPI. {q(claim)}",
    "s_device": lambda sid, dur, clips, title, sub=None, panels=(), desc=None, **k: (
        f"{DEMO}. Título: {q(title)}" + (f" {q(sub)}" if sub else "") + (f" {desc}" if desc else "") + "".join(f" Recuadro: {panel(p)}" for p in panels)),
    "s_shot": lambda sid, dur, clips, title, cam=(), panels=(), sub=None, desc=None, **k: (
        f"{DEMO}; la cámara se acerca a la parte de la pantalla de la que habla el título. Título: {q(title)}" + (f" {q(sub)}" if sub else "") + (f" {desc}" if desc else "") + "".join(f" Recuadro: {panel(p)}" for p in panels)),
    "s_network": lambda sid, dur, title, **k: f"La sala vista desde arriba, con socios y equipo como puntos: un socio pide «Que venga alguien» y alguien del equipo responde «Voy». Texto: {q(title)}",
    "s_end": lambda sid, dur, claim, url, kicker=None: f"Logo de REPI.{f' {kicker}.' if kicker else ''} {q(claim)} Dirección: {url}",
    "s_tablet": lambda sid, dur, clips, title, sub=None, panels=(), focus=None, keys=(), still=None, desc=None: (
        f"{KIOSK}. Título: {q(title)}" + (f" {q(sub)}" if sub else "") + (f" {desc}" if desc else "") + "".join(f" Recuadro: {panel(p)}" for p in panels)),
    "s_arrive": lambda sid, dur, title: f"Plano de la sala: el socio, un punto, entra por recepción y llega a la pantalla de rutinas del gimnasio. Texto: {q(title)}",
    "s_statement": lambda sid, dur, title, sub=None, img=None: (
        f"Texto: {q(title)}" + (f" {q(sub)}" if sub else "") + (" Logo de Smart Center Gym." if img else "")),
}
for k, f in R.items(): setattr(b, k, f)

def ts(s): return f"{int(s // 60):02d}:{s % 60:06.3f}"

import sys
only = sys.argv[1:]
out = {}
for name, web in WEB.items():
    if only and name not in only: continue
    f = b.FILMS[name]; t = 0.0; cues = []
    for sid, dur, fn in f["scenes"]:
        cues.append((t, t + dur, fn(sid, dur))); t += dur
    vtt = "WEBVTT\n\n" + "\n\n".join(f"{ts(a)} --> {ts(e)}\n{text}" for a, e, text in cues) + "\n"
    open(os.path.join(REPO, "apps/web/public/conoce/videos", f"{web}.descripcion.vtt"), "w").write(vtt)
    out[web] = [{"at": f"{int(a // 60)}:{int(a % 60):02d}", "text": text} for a, e, text in cues]
path = "pistas .descripcion.vtt"
print("ok", len(out), "films →", path)
