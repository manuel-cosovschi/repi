"use client";
// D166 (F-RC-04): nivel REPI, vitrina de trofeos y desbloqueo 3D. La medalla es un disco con espesor real (capas en Z)
// y caras de metal por escalón (bronce, plata, oro) con el punto cian del isotipo. El desbloqueo sigue el lenguaje del
// video de lanzamiento (motion tokens): anillo cónico que abre el iris, puntos que convergen, la medalla llega girando
// desde el fondo con expo.out, un brillo la cruza y el titular sube por máscara palabra por palabra. Se puede girar con el
// dedo. Con «reducir movimiento», sólo fundidos.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Barbell, CalendarCheck, PersonSimple, Shuffle, Stack, Trophy, type Icon } from "@phosphor-icons/react";
import { CHALLENGE_DIFFICULTY, TIER_LABEL, XP, type TrophyTier } from "@repi/domain";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";

export type TrophyView = { key: string; name: string; tier: number; tierName: TrophyTier | null; value: number; goal: number | null; pct: number; next: string | null; since: string | null };
export type Unlock = { id: string; key: string; tier: TrophyTier; title: string; detail: string };
export type LevelData = { level: number; xp: number; toNext: number; pct: number; breakdown: { label: string; count: number; xp: number }[]; trophies: TrophyView[]; unseen: Unlock[] };

const ICON: Record<string, Icon> = { constancia: CalendarCheck, fuerza: Barbell, volumen: Stack, variedad: Shuffle, cuerpo: PersonSimple, gym: Trophy };
// Curvas de los motion tokens del video (GSAP → cubic-bezier).
const EASE = { expoOut: "cubic-bezier(0.16, 1, 0.3, 1)", power3In: "cubic-bezier(0.55, 0, 1, 0.45)", power2InOut: "cubic-bezier(0.45, 0, 0.55, 1)", backOut: "cubic-bezier(0.34, 1.8, 0.64, 1)" };
const REST = "rotateY(-16deg) rotateX(6deg)"; // reposo: levemente girada para que se vea el canto
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Medalla 3D. `tier` null = bloqueada (pizarra). */
export function Medal({ k, tier, size = 88, spin }: { k: string; tier: TrophyTier | null; size?: number; spin?: React.Ref<HTMLDivElement> }) {
  const depth = Math.max(4, Math.round(size / 14));
  return (
    <div className="tm" data-tier={tier ?? "none"} style={{ ["--s" as string]: `${size}px`, ["--d" as string]: `${depth}px` }} aria-hidden="true">
      <div className="tm-body" ref={spin}>
        {Array.from({ length: depth }, (_, i) => <i key={i} className="tm-edge" style={{ transform: `translateZ(${-i - 1}px)` }} />)}
        <div className="tm-face tm-back" style={{ transform: `translateZ(${-depth - 1}px) rotateY(180deg)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon_r.png" alt="" /><b />
        </div>
        <div className="tm-face tm-front">
          <span className="tm-core"><Ic i={ICON[k] ?? Trophy} size={Math.round(size * 0.34)} color={tier ? "#00D1FF" : "#5B6B80"} /><b /></span>
          <i className="tm-sheen" />
        </div>
      </div>
    </div>
  );
}

/** Nivel y vitrina. Sin `data` la carga sola (Progreso); en el gym llega con el inicio. */
export function LevelPanel({ data, onReplay }: { data?: LevelData | null; onReplay?: (u: Unlock) => void }) {
  const [own, setOwn] = useState<LevelData | null>(null);
  const [failed, setFailed] = useState(false);
  const [how, setHow] = useState(false);
  const [replay, setReplay] = useState<Unlock | null>(null);
  useEffect(() => { if (data === undefined) api<LevelData>("/api/me/level").then(setOwn).catch(() => setFailed(true)); }, [data]);
  const d = data ?? own;
  if (failed && !d) return <span className="mb-muted" style={{ fontSize: 14 }}>No pudimos cargar tu nivel (necesita conexión).</span>;
  if (!d) return null;
  const play = (t: TrophyView) => {
    if (!t.tierName) return;
    const u = { id: `replay-${t.key}`, key: t.key, tier: t.tierName, title: `${t.name} · ${TIER_LABEL[t.tierName]}`, detail: t.goal == null ? "Escalón máximo" : `Próximo: ${t.next}` };
    if (onReplay) onReplay(u); else setReplay(u);
  };
  return (
    <section className="lv" aria-label="Tu nivel y trofeos">
      <div className="lv-card">
        <div className="lv-top">
          <span className="lv-num"><small>Nivel</small>{d.level}</span>
          <span className="lv-xp"><b>{d.xp.toLocaleString("es-AR")}</b> puntos</span>
        </div>
        <div className="lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.pct} aria-label={`Progreso al nivel ${d.level + 1}`}><i style={{ width: `${Math.max(4, d.pct)}%` }} /></div>
        <span className="mb-muted" style={{ fontSize: 12 }}>Te falta{d.toNext === 1 ? "" : "n"} {d.toNext} punto{d.toNext === 1 ? "" : "s"} para el nivel {d.level + 1}</span>
        <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} aria-expanded={how} onClick={() => setHow(!how)}>{how ? "Ocultar" : "Cómo sumo puntos"}</button>
        {how && (
          <div className="lv-how">
            {d.breakdown.map((b) => <div key={b.label}><span>{b.label} <small>× {b.count}</small></span><b>+{b.xp}</b></div>)}
            <p className="mb-muted">Día entrenado +{XP.day} · récord personal +{XP.pr} · ejercicio nuevo +{XP.newExercise} · cada tonelada movida +{XP.ton} · desafío validado +{XP.validated} (con dificultad: fácil +{CHALLENGE_DIFFICULTY[1].xp}, media +{CHALLENGE_DIFFICULTY[2].xp}, difícil +{CHALLENGE_DIFFICULTY[3].xp}) · récord del gym +{XP.gymRecord} · constancia del mes +{XP.month}. Récord personal: superar tu peso máximo en un ejercicio.</p>
          </div>
        )}
      </div>
      <h2 style={{ margin: "6px 0 0" }}>Trofeos</h2>
      <div className="tcase">
        {d.trophies.map((t) => (
          <button key={t.key} type="button" className="tcase-it" disabled={!t.tierName} onClick={() => play(t)}
            aria-label={`${t.name}: ${t.tierName ? TIER_LABEL[t.tierName] : "bloqueado"}. ${t.next ? `Próximo escalón: ${t.next}` : "Escalón máximo"}`}>
            <Medal k={t.key} tier={t.tierName} size={72} />
            <b>{t.name}</b>
            <small>{t.tierName ? TIER_LABEL[t.tierName] : "Bloqueado"}</small>
            {t.goal != null && <span className="tcase-bar"><i style={{ width: `${Math.max(3, t.pct)}%` }} /></span>}
            <small className="tcase-next">{t.goal != null ? `${t.value.toLocaleString("es-AR")} / ${t.next}` : "Completo"}</small>
          </button>
        ))}
      </div>
      {replay && <TrophyUnlock items={[replay]} onDone={() => setReplay(null)} />}
    </section>
  );
}

// Puntos de la convergencia: generador con semilla fija, como en el video (determinista).
function dots(n: number) {
  let seed = 20261027;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + rnd() * 0.4; const r = 150 + rnd() * 140; return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.9 }; });
}

/** Desbloqueo a pantalla completa. Varios trofeos: uno por vez («1 de 3»), el oro al final. */
export function TrophyUnlock({ items, onDone }: { items: Unlock[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const it = items[i];
  const root = useRef<HTMLDivElement>(null);
  const spin = useRef<HTMLDivElement>(null);
  const settled = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !it) return;
    settled.current = false;
    const q = (s: string) => el.querySelector<HTMLElement>(s);
    const all = (s: string) => [...el.querySelectorAll<HTMLElement>(s)];
    const anims: Animation[] = [];
    const a = (t: HTMLElement | null, k: Keyframe[], o: KeyframeAnimationOptions) => { if (t) anims.push(t.animate(k, { fill: "both", ...o })); };
    if (reduced()) {
      a(q(".tu-stage"), [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
      all(".tu-w").forEach((w) => a(w, [{ transform: "none" }, { transform: "none" }], { duration: 1 }));
      settled.current = true;
      btn.current?.focus();
      return () => anims.forEach((x) => x.cancel());
    }
    // 0 ms: el mundo aparece; el anillo del isotipo hace pop (back.out) y abre el iris (power2.in).
    a(q(".tu-glow"), [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: EASE.power2InOut });
    a(q(".tu-ring"), [{ transform: "scale(0)", opacity: 1 }, { transform: "scale(1)", opacity: 1, offset: 0.32 }, { transform: "scale(9)", opacity: 0 }], { duration: 900, easing: "linear" });
    // Corcheas: los puntos aparecen dispersos y convergen al centro (240 → 760 ms).
    all(".tu-dot").forEach((d, j) => {
      const x = Number(d.dataset.x), y = Number(d.dataset.y);
      a(d, [{ transform: `translate(${x}px, ${y}px) scale(0)`, opacity: 0 }, { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0.35 }, { transform: "translate(0, 0) scale(.4)", opacity: 0 }],
        { duration: 760, delay: 120 + j * 18, easing: EASE.power2InOut });
    });
    // La medalla llega desde el fondo girando (expo.out, 1,4 s) y asienta con un leve squash; después el brillo la cruza.
    a(spin.current, [
      { transform: "translateZ(-900px) rotateY(-540deg) rotateX(18deg)", opacity: 0 },
      { transform: "translateZ(-900px) rotateY(-540deg) rotateX(18deg)", opacity: 1, offset: 0.05 },
      { transform: `translateZ(0) ${REST}`, opacity: 1 },
    ], { duration: 1700, delay: 380, easing: EASE.expoOut });
    a(q(".tu-medal"), [{ transform: "scale(1)" }, { transform: "scale(1.06, .94)", offset: 0.5 }, { transform: "scale(1)" }], { duration: 260, delay: 1500, easing: EASE.backOut });
    // Sin «fill» antes del retraso: una capa animada dentro de la cara no respeta su backface-visibility en Chrome y el
    // frente se vería espejado mientras la medalla gira.
    a(q(".tu-medal .tm-sheen"), [{ transform: "translateX(-140%) skewX(-18deg)" }, { transform: "translateX(140%) skewX(-18deg)" }], { duration: 760, delay: 1560, easing: EASE.power2InOut, fill: "none" });
    a(q(".tu-burst"), [{ transform: "scale(.4)", opacity: 0 }, { transform: "scale(1)", opacity: .9, offset: .25 }, { transform: "scale(1.5)", opacity: 0 }], { duration: 900, delay: 1480, easing: EASE.expoOut });
    // Texto: kicker desde la izquierda; titular por máscara, palabra por palabra (0,09 s); detalle y botón después.
    a(q(".tu-kick"), [{ transform: "translateX(-24px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 400, delay: 1180, easing: EASE.expoOut });
    all(".tu-w").forEach((w, j) => a(w, [{ transform: "translateY(118%)" }, { transform: "translateY(0)" }], { duration: 460, delay: 1300 + j * 90, easing: EASE.expoOut }));
    a(q(".tu-detail"), [{ transform: "translateY(14px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 450, delay: 1700, easing: "cubic-bezier(0.33, 1, 0.68, 1)" });
    a(q(".tu-acts"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1900, easing: "linear" });
    const t = setTimeout(() => { settled.current = true; btn.current?.focus(); }, 1900);
    return () => { clearTimeout(t); anims.forEach((x) => x.cancel()); };
  }, [it]);

  // Girar la medalla con el dedo (una vez asentada); al soltar vuelve al frente.
  const move = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !settled.current || !spin.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    spin.current.getAnimations().forEach((x) => x.cancel());
    spin.current.style.transform = `rotateY(${dx * 0.7}deg) rotateX(${Math.max(-35, Math.min(35, -dy * 0.4))}deg)`;
  }, []);
  const release = useCallback(() => {
    if (!drag.current || !spin.current) return;
    drag.current = null;
    const from = spin.current.style.transform || "none";
    spin.current.style.transform = "";
    if (!reduced()) spin.current.animate([{ transform: from }, { transform: REST }], { duration: 900, easing: EASE.expoOut });
  }, []);

  if (!it) return null;
  const words = it.title.replace(" · ", " ").split(" ");
  const last = i === items.length - 1;
  return (
    <div className="tu" ref={root} role="dialog" aria-modal="true" aria-label={`Trofeo desbloqueado: ${it.title}`} data-tier={it.tier}>
      <div className="tu-glow" />
      <div className="tu-stage">
        <div className="tu-scene" onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={move} onPointerUp={release} onPointerCancel={release}>
          <span className="tu-ring" />
          <span className="tu-burst" />
          {dots(it.tier === "oro" ? 18 : 12).map((p, j) => <span key={j} className="tu-dot" data-x={p.x} data-y={p.y} />)}
          <div className="tu-medal"><Medal k={it.key} tier={it.tier} size={168} spin={spin} /></div>
        </div>
        <div className="tu-kick">Trofeo desbloqueado</div>
        <h2 className="tu-title">{words.map((w, j) => <span key={j} className="tu-ln"><span className="tu-w">{w}</span></span>)}</h2>
        <p className="tu-detail">{it.detail}</p>
        <div className="tu-acts">
          {items.length > 1 && <span className="tu-count">{i + 1} de {items.length}</span>}
          <button ref={btn} type="button" className="cta" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Listo" : "Siguiente"}</button>
          <small className="mb-muted">Girala con el dedo</small>
        </div>
      </div>
    </div>
  );
}
