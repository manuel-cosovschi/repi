"use client";
// Hoja inferior de App Alumno v4 (`fbSheet`): título, cierre, grupos de chips, aviso, texto, video y acción.
// Accesible: diálogo modal, foco inicial y atrapado, Esc cierra, fondo inerte, foco restaurado.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ic } from "@/components/ui/Ic";
import { VideoCamera } from "@phosphor-icons/react";
import { useScrollLock } from "@/components/ui/scrollLock";

export type SheetGroup<T extends string | number> = { label: string; minW?: number; opts: [T, string][]; value: T | null | undefined; onPick: (v: T) => void };

export function Sheet({ title, sub, closeLabel = "Cerrar", onClose, groups = [], warn, text, video, children, action }: {
  title: string; sub?: string; closeLabel?: string; onClose: () => void; groups?: SheetGroup<string | number>[]; warn?: string | null;
  text?: { value: string; onChange: (v: string) => void; placeholder: string };
  video?: { file: File | null; onPick: (f: File | null) => void; label?: string };
  children?: ReactNode;
  action?: { label: string; ready: boolean; busy?: boolean; onSubmit: () => void };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useScrollLock();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = ref.current!;
    const focusables = () => [...root.querySelectorAll<HTMLElement>("button,[href],input,textarea,[tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
    root.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    const col = document.querySelector(".mb-col");
    col?.setAttribute("inert", "");
    return () => { document.removeEventListener("keydown", onKey); col?.removeAttribute("inert"); prev?.focus?.(); };
  }, []);
  return createPortal(
    <div className="sheet-bg" onClick={onClose}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head"><h2>{title}</h2><button type="button" className="linkbtn" style={{ height: 44, fontSize: 14 }} onClick={onClose}>{closeLabel}</button></div>
        {sub && <p className="sheet-sub">{sub}</p>}
        {groups.map((g) => (
          <fieldset key={g.label} className="sheet-group"><legend>{g.label}</legend>
            <div>{g.opts.map(([v, l]) => <button type="button" key={String(v)} aria-pressed={g.value === v} style={g.minW ? { minWidth: g.minW } : undefined} onClick={() => g.onPick(v)}>{l}</button>)}</div>
          </fieldset>
        ))}
        {warn && <p className="sheet-warn" role="alert">{warn}</p>}
        {children}
        {text && <textarea rows={3} value={text.value} maxLength={1000} placeholder={text.placeholder} aria-label={text.placeholder} onChange={(e) => text.onChange(e.target.value)} />}
        {video && (
          <label className="sheet-video">
            <Ic i={VideoCamera} size={20} />
            {video.file ? `Video listo · ${(video.file.size / 1_048_576).toFixed(1).replace(".", ",")} MB` : video.label ?? "Adjuntar video (opcional)"}
            <input type="file" accept="video/mp4,video/quicktime,video/webm" capture="environment" onChange={(e) => video.onPick(e.target.files?.[0] ?? null)} />
          </label>
        )}
        {action && <button type="button" className="cta" style={{ height: 52, opacity: action.ready ? 1 : .45 }} aria-busy={action.busy || undefined} onClick={action.onSubmit}>{action.busy ? "Un momento…" : action.label}</button>}
      </div>
    </div>,
    document.body,
  );
}
