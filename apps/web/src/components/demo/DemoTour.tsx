"use client";
// Recorrido guiado de la demo (D85): aparece sólo en sesiones de demo y va paso a paso sobre la app real, resaltando dónde
// tocar y por qué le sirve a cada perfil. Navega solo entre pantallas tocando el menú real. Se puede salir y volver a
// abrir con «Guía». Teclado: flechas para avanzar o volver, Escape para cerrar. Movimiento reducido: sin transiciones.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DemoRole } from "@/server/sandbox/services";

type Step = { t: string; d: string; target?: string; go?: boolean };
const TOURS: Record<DemoRole, { who: string; steps: Step[] }> = {
  owner: { who: "Dueño o gerente", steps: [
    { t: "Bienvenido a Gym Norte", d: "Sos Martín, el dueño. En dos minutos te mostramos cómo REPI ordena tu gimnasio. Todo es ficticio y se borra solo: tocá lo que quieras." },
    { t: "Tu gimnasio de un vistazo", d: "Socios activos, asistencia, servicio del equipo y alertas, por sede. Sin planillas.", target: "Ejecutivo", go: true },
    { t: "Altas sin papeles", d: "El socio escanea el QR de la sede, crea su cuenta y el equipo lo aprueba acá. Camila está esperando: aprobala y mirá cómo queda activa.", target: "Solicitudes de acceso", go: true },
    { t: "Un QR por sede", d: "Fijo, revocable y sin datos personales. Lo imprimís, lo pegás en recepción y listo.", target: "Accesos y QR", go: true },
    { t: "Seguimiento de sala", d: "Pedidos de los socios, cuánto tardan en atenderse y resolverse, traspasos entre profesores y si les sirvió. Sólo números: no ves chats, notas ni datos de salud.", target: "Seguimiento de sala", go: true },
    { t: "Cómo atiende tu equipo", d: "Tareas resueltas, tiempos de respuesta y reseñas de los socios, por entrenador.", target: "Equipo y servicio", go: true },
    { t: "Comunidad que fideliza", d: "Novedades, descuentos y desafíos con premio que tus socios ven en la app. Más motivos para volver.", target: "Comunidad", go: true },
    { t: "Precio claro", d: "Pagás por la cantidad de socios acordada, con el precio a la vista. Sin sorpresas.", target: "Condiciones REPI", go: true },
    { t: "Eso es REPI para tu gimnasio", d: "Seguí explorando a tu ritmo o probá cómo lo vive tu entrenador de sala, tus socios o un personal trainer." },
  ] },
  floor: { who: "Entrenador de sala", steps: [
    { t: "Hola, Sofía", d: "Sos entrenadora de sala y estás en turno en Palermo. Así es tu día con REPI." },
    { t: "Avisos en vivo", d: "Julián marcó «Que venga alguien» en una serie. Te llega al instante: tocá «Voy» y el resto del equipo ve que ya lo atendés.", target: "Mi turno", go: true },
    { t: "Tu bandeja de sala", d: "Julián pidió ayuda desde su ejercicio y Lucas te dejó a Martina para continuar. Abrí el traspaso: ves qué se hizo, qué falta y el próximo paso. Aceptalo, registrá lo que hiciste y resolvelo.", target: "Sala", go: true },
    { t: "Aprobás altas desde el piso", d: "Si alguien nuevo escanea el QR, lo confirmás vos mismo sin pasar por recepción.", target: "Solicitudes de acceso", go: true },
    { t: "La ficha de cada socio", d: "Programa, notas del equipo, molestias y su historial. Le armás o ajustás la rutina en el momento.", target: "Socios", go: true },
    { t: "Cambio de turno sin perder nada", d: "Al cerrar el turno dejás lo pendiente a otro profesor o a la cola, con el historial completo.", target: "Traspaso de turno", go: true },
    { t: "Menos papeles, más sala", d: "Seguí explorando o probá cómo lo ve el socio en su teléfono." },
  ] },
  member: { who: "Alumno o socio", steps: [
    { t: "Hola, Valentina", d: "Así se ve REPI en tu teléfono. Entrenás con tu coach y con tu gimnasio desde la misma app." },
    { t: "Tu día", d: "Tu próximo entrenamiento, los avisos de tu coach y tu semana. Con «Pedir ayuda» le escribís al equipo de sala del gym y seguís el estado en «Mis pedidos».", target: "Inicio", go: true },
    { t: "Entrenar es fácil", d: "Tu programa día por día. Tocá «Comenzar entrenamiento»: cargás peso y repeticiones con un toque, el descanso corre solo y marcás cómo te sentiste. Funciona sin conexión.", target: "Entrenar", go: true },
    { t: "Tu progreso", d: "Tus récords y cómo suben tus cargas semana a semana.", target: "Progreso", go: true },
    { t: "Hablá con tu coach", d: "Chat privado con tu coach y con el equipo del gimnasio.", target: "Mensajes", go: true },
    { t: "Tu gimnasio en la app", d: "Novedades, descuentos, desafíos con premio y tu carnet QR.", target: "Gym", go: true },
    { t: "Listo para entrenar", d: "Probá un entrenamiento completo o mirá cómo lo ve tu coach." },
  ] },
  coach: { who: "Personal trainer", steps: [
    { t: "Hola, Agustín", d: "Sos personal trainer con tres alumnos. Así gestionás todo desde un solo lugar." },
    { t: "Tu panel", d: "Quién entrenó, quién no y qué necesita tu atención hoy.", target: "Panel", go: true },
    { t: "Cada alumno a fondo", d: "Sesiones registradas, rendimiento con 1RM estimado y volumen, salud compartida y pagos. Abrí la ficha de Valentina.", target: "Clientes", go: true },
    { t: "Programas en minutos", d: "Armás con tu biblioteca, duplicás y asignás. Cada cambio queda versionado y el alumno ve qué cambió.", target: "Programas", go: true },
    { t: "Pedidos de tus alumnos", d: "Martina te pidió que revises su técnica. Lo resolvés y le llega el aviso.", target: "Solicitudes", go: true },
    { t: "Chat con cada alumno", d: "Separado de tu WhatsApp personal y con todo el contexto a mano.", target: "Mensajes", go: true },
    { t: "Tus cobros ordenados", d: "Quién te pagó, quién debe y cuánto cobraste este mes. Registrás un pago en segundos.", target: "Cobros a alumnos", go: true },
    { t: "Eso es REPI para coaches", d: "Seguí explorando o mirá cómo vive el entrenamiento tu alumno." },
  ] },
};

function findTarget(label: string): HTMLElement | null {
  const byAttr = document.querySelector<HTMLElement>(`button[title="${label}"], [aria-label="${label}"]`);
  if (byAttr) return byAttr;
  return [...document.querySelectorAll<HTMLElement>("nav button, button")].find((b) => b.textContent?.trim().startsWith(label)) ?? null;
}
const visible = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };

export function DemoTour() {
  const [role, setRole] = useState<DemoRole | null>(null);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const key = role ? `repi:tour:${role}` : "";

  useEffect(() => {
    if (!document.cookie.split("; ").some((c) => c.startsWith("repi_demo="))) return;
    fetch("/api/demo/me", { credentials: "same-origin" }).then((r) => r.json()).then((d: { role: DemoRole } | null) => {
      if (!d) return;
      setRole(d.role);
      try { const saved = JSON.parse(sessionStorage.getItem(`repi:tour:${d.role}`) ?? "null"); if (saved) { setI(saved.i ?? 0); setOpen(saved.open ?? true); } } catch { /* */ }
    }).catch(() => {});
  }, []);
  useEffect(() => { if (key) try { sessionStorage.setItem(key, JSON.stringify({ i, open })); } catch { /* */ } }, [key, i, open]);

  const step = role ? TOURS[role].steps[i] : null;
  // Al entrar a un paso con destino: toca el menú real (navega) y resalta el elemento.
  useEffect(() => {
    if (!open || !step?.target) { setRect(null); return; }
    let tries = 0, done = false;
    const t = setInterval(() => {
      const el = findTarget(step.target!);
      if (el) {
        if (step.go && !done) { done = true; if (el.getAttribute("aria-current") !== "page") el.click(); }
        setRect(visible(el) ? el.getBoundingClientRect() : null);
      }
      if (++tries > 20) clearInterval(t);
    }, 150);
    return () => clearInterval(t);
  }, [open, step]);
  useLayoutEffect(() => { if (open) card.current?.focus(); }, [open, i]);
  const total = role ? TOURS[role].steps.length : 0;
  const next = useCallback(() => setI((x) => Math.min(total - 1, x + 1)), [total]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, next, prev]);

  if (!role || !step) return null;
  const last = i === total - 1;
  return createPortal(
    <>
      {open && rect && <div className="dt-ring" aria-hidden="true" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      {open ? (
        <div ref={card} className="dt-card" role="dialog" aria-modal="false" aria-labelledby="dt-t" tabIndex={-1}>
          <div className="dt-top"><span className="dt-badge">Demo · {TOURS[role].who}</span><span className="dt-n">{i + 1} de {total}</span></div>
          <h2 id="dt-t">{step.t}</h2>
          <p aria-live="polite">{step.d}</p>
          <div className="dt-act">
            {i > 0 && <button type="button" className="dt-sec" onClick={prev}>Anterior</button>}
            {last
              ? <a className="dt-pri" href="/demo">Probar otro perfil</a>
              : <button type="button" className="dt-pri" onClick={next}>{i === 0 ? "Empezar" : "Siguiente"}</button>}
          </div>
          <button type="button" className="dt-x" onClick={() => setOpen(false)}>{last ? "Explorar por mi cuenta" : "Salir de la guía"}</button>
        </div>
      ) : (
        <div className="dt-pill">
          <span>Demo</span>
          <button type="button" onClick={() => setOpen(true)}>Guía</button>
          <a href="/demo">Otro perfil</a>
        </div>
      )}
    </>,
    document.body,
  );
}
