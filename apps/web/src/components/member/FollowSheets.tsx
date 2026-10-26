"use client";
// Hojas de seguimiento de App Alumno v4: check-in, molestia, pedir ayuda y lesión. Textos del prototipo; datos reales.
import { useEffect, useState } from "react";
import { INJURY_STATUS, INJURY_ZONES, PAIN_WARN_LEVEL, PAIN_ZONES, REVIEW_DIMS, VIDEO_LIMITS, type InjuryStatus, type RequestKind } from "@repi/domain";
import { api } from "@/lib/api";
import { Sheet } from "./Sheet";

type Privacy = { coach: { name: string; org: string } | null; items: { key: string; on: boolean; restricted: boolean }[] };
const opts5: [number, string][] = [1, 2, 3, 4, 5].map((n) => [n, String(n)]);
const first = (n?: string | null) => (n ?? "tu coach").split(" ")[0];

export function CheckinSheet({ onDone, onSkip, flash, standalone }: { onDone: () => void; onSkip: () => void; flash: (t: string) => void; standalone?: boolean }) {
  const [v, setV] = useState<{ e?: number; s?: number; m?: number }>({});
  const [busy, setBusy] = useState(false);
  const ready = !!(v.e && v.s && v.m);
  const submit = async () => {
    if (!ready) { flash("Completá los datos marcados."); return; }
    setBusy(true);
    try { await api("/api/me/checkin", { body: { energy: v.e, sleep: v.s, mood: v.m } }); if (standalone) flash("Check-in guardado."); }
    catch { flash("Sin conexión: este check-in no se guardó."); }
    finally { setBusy(false); onDone(); }
  };
  return (
    <Sheet title="¿Cómo llegás hoy?" sub="Tres toques. Tu coach lo usa para ajustar la carga del día." closeLabel={standalone ? "Cancelar" : "Saltar"} onClose={onSkip}
      groups={[["Energía", "e"], ["Sueño", "s"], ["Ánimo", "m"]].map(([l, k]) => ({ label: l, minW: 52, opts: opts5, value: v[k as "e"], onPick: (x) => setV((y) => ({ ...y, [k]: x as number })) }))}
      action={{ label: standalone ? "Guardar" : "Empezar entrenamiento", ready, busy, onSubmit: submit }} />
  );
}

export function PainSheet({ exerciseName, sessionId, onClose, flash }: { exerciseName?: string; sessionId?: string; onClose: () => void; flash: (t: string) => void }) {
  const [p, setP] = useState<Privacy | null>(null);
  const [v, setV] = useState<{ zone?: string; level?: number; when?: "now" | "after" | "out"; note: string; share: boolean }>({ when: exerciseName ? "now" : sessionId ? "after" : "out", note: "", share: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Privacy>("/api/me/privacy").then(setP).catch(() => setP({ coach: null, items: [] })); }, []);
  const health = p?.items.find((i) => i.key === "health");
  const coach = first(p?.coach?.name);
  const ready = !!v.zone && v.level != null;
  const sub = !p ? "" : !p.coach ? "Se guarda en tu perfil. No tenés coach con quien compartirla." : health?.on ? `La ve ${coach} porque compartiste tu salud.` : `${coach} no ve tu salud. Se guarda sólo para vos, salvo que compartas este reporte.`;
  const submit = async () => {
    if (!ready) { flash("Completá los datos marcados."); return; }
    setBusy(true);
    try {
      const r = await api<{ visibleToCoach: boolean }>("/api/me/pains", { body: { zone: v.zone, level: v.level, context: v.when, exerciseName: v.when === "now" ? exerciseName ?? null : null, sessionId: sessionId ?? null, note: v.note || null, shareThis: v.share || undefined } });
      flash(v.level! >= PAIN_WARN_LEVEL ? "Guardado. Frená y pedí ayuda si la necesitás." : r.visibleToCoach ? `Enviado a ${coach}. Lo va a tener en cuenta en tu programa.` : "Guardado en tu perfil.");
      onClose();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Reportar molestia" sub={sub} closeLabel="Cancelar" onClose={onClose}
      groups={[
        { label: "Zona", opts: PAIN_ZONES.map((z) => [z, z] as [string, string]), value: v.zone, onPick: (x) => setV((y) => ({ ...y, zone: x as string })) },
        { label: "Intensidad (0 nada · 10 máxima)", minW: 36, opts: Array.from({ length: 11 }, (_, i) => [i, String(i)] as [number, string]), value: v.level, onPick: (x) => setV((y) => ({ ...y, level: x as number })) },
        { label: "¿Cuándo?", opts: [...(exerciseName ? [["now", `Ahora · ${exerciseName}`]] : []), ["after", "Al terminar"], ["out", "Fuera del entrenamiento"]] as [string, string][], value: v.when, onPick: (x) => setV((y) => ({ ...y, when: x as "now" })) },
      ]}
      warn={(v.level ?? 0) >= PAIN_WARN_LEVEL
        ? "Si el dolor es fuerte o agudo, frená el ejercicio. REPI no hace diagnósticos: si persiste, consultá a un profesional de la salud."
          + (p?.coach && !health?.on && !health?.restricted && !v.share ? ` Te sugerimos compartir este reporte con ${coach} para que ajuste tu programa (D37).` : "")
        : null}
      text={{ value: v.note, onChange: (x) => setV((y) => ({ ...y, note: x })), placeholder: "Contá cómo se siente (opcional)" }}
      action={{ label: "Enviar", ready, busy, onSubmit: submit }}>
      {p?.coach && !health?.on && (
        health?.restricted
          ? <p className="sheet-sub">Tu salud se comparte cuando tu adulto responsable lo autorice.</p>
          : <label className="sheet-check"><input type="checkbox" checked={v.share} onChange={(e) => setV((y) => ({ ...y, share: e.target.checked }))} />Compartir sólo este reporte con {coach}</label>
      )}
    </Sheet>
  );
}

/** Pedir ayuda: al coach (Etapa 4) o al equipo de sala del gym (D41). Al gym sólo llega este texto, nunca los mensajes con el coach. */
export function HelpSheet({ initialKind = "rutina", coachName, gymPlace, initialTo, onClose, flash }: {
  initialKind?: RequestKind; coachName: string | null; gymPlace: string | null; initialTo?: "coach" | "gym"; onClose: () => void; flash: (t: string) => void;
}) {
  const [kind, setKind] = useState<RequestKind>(initialKind);
  const [to, setTo] = useState<"coach" | "gym">(initialTo ?? (coachName ? "coach" : "gym"));
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = text.trim().length > 2;
  const gymName = gymPlace?.split(" · ")[0] ?? "tu gym";
  const submit = async () => {
    if (!ready) { flash("Contá qué necesitás."); return; }
    if (file && (file.size > VIDEO_LIMITS.maxBytes || !(VIDEO_LIMITS.mimes as readonly string[]).includes(file.type))) { flash("El video tiene que ser MP4, MOV o WebM de hasta 60 MB."); return; }
    setBusy(true);
    try {
      let videoId: string | null = null;
      if (file && kind === "tecnica") {
        const fd = new FormData(); fd.append("file", file);
        const res = await fetch("/api/me/videos", { method: "POST", body: fd, credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "No se pudo subir el video.");
        videoId = data.id;
      }
      if (to === "gym") {
        const r = await api<{ duplicate: boolean }>("/api/me/gym/requests", { body: { kind, text, videoId } });
        flash(r.duplicate ? "Ya tenés un pedido igual abierto con el equipo de sala." : "Pedido enviado al equipo de sala. Te avisamos cuando lo resuelvan.");
      } else {
        await api("/api/me/requests", { body: { kind, text, videoId } });
        flash(`Pedido enviado a ${first(coachName)}.`);
      }
      onClose();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  const both = !!coachName && !!gymPlace;
  const sub = to === "gym" ? `Le llega al equipo de sala de ${gymName} como tarea. No incluye tus mensajes con tu coach.` : coachName ? `Le llega a ${first(coachName)}, tu coach.` : "";
  return (
    <Sheet title="Pedir ayuda" sub={!coachName && !gymPlace ? "Todavía no tenés coach ni gym en REPI." : sub} closeLabel="Cancelar" onClose={onClose}
      groups={[
        { label: "Qué necesitás", opts: [["rutina", "Cambiar mi rutina"], ["tecnica", "Revisar mi técnica"], ["consulta", "Consulta"]], value: kind, onPick: (x) => setKind(x as RequestKind) },
        ...(both ? [{ label: "Para", opts: [["gym", `Equipo de sala · ${gymName}`], ["coach", `${first(coachName)} · tu coach`]] as [string, string][], value: to, onPick: (x: string | number) => setTo(x as "coach" | "gym") }] : []),
      ]}
      text={{ value: text, onChange: setText, placeholder: "Contá qué necesitás" }}
      video={kind === "tecnica" ? { file, onPick: setFile } : undefined}
      action={coachName || gymPlace ? { label: "Enviar pedido", ready, busy, onSubmit: submit } : undefined} />
  );
}

/** Reseña verificada (F-RV-06): opcional, vinculada a una atención real. El entrenador la ve sin tu nombre. */
export function ReviewSheet({ invite, onClose, flash }: { invite: { id: string; trainer: string; kind: string }; onClose: (done: boolean) => void; flash: (t: string) => void }) {
  const [stars, setStars] = useState<number>();
  const [dims, setDims] = useState<(number | null)[]>([null, null, null]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scale = [1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string]);
  const submit = async () => {
    if (!stars) { flash("Elegí una calificación general."); return; }
    setBusy(true);
    try { await api(`/api/me/gym/reviews/${invite.id}`, { body: { stars, dims, text: text || null } }); flash("¡Gracias! Tu reseña quedó vinculada a esta atención."); onClose(true); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  const tn = first(invite.trainer);
  return (
    <Sheet title={`¿Cómo te atendió ${tn}?`} sub={`${tn} ve tu calificación y comentario sin tu nombre. La gerencia de la sede la ve con tu nombre. Otros socios no la ven.`} closeLabel="Cancelar" onClose={() => onClose(false)}
      groups={[
        { label: "General", minW: 52, opts: scale, value: stars, onPick: (x) => setStars(x as number) },
        ...REVIEW_DIMS.map((l, i) => ({ label: `${l} · opcional`, minW: 52, opts: scale, value: dims[i], onPick: (x: string | number) => setDims((d) => d.map((v, j) => (j === i ? (v === x ? null : (x as number)) : v))) })),
      ]}
      text={{ value: text, onChange: setText, placeholder: "Comentario (opcional)" }}
      action={{ label: "Enviar reseña", ready: !!stars, busy, onSubmit: submit }} />
  );
}

export function InjurySheet({ onClose, onSaved, flash }: { onClose: () => void; onSaved: () => void; flash: (t: string) => void }) {
  const [zone, setZone] = useState<string>();
  const [st, setSt] = useState<InjuryStatus>();
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !!zone && !!st;
  const submit = async () => {
    if (!ready) { flash("Completá los datos marcados."); return; }
    setBusy(true);
    try { await api("/api/me/injuries", { body: { zone, status: st, detail: detail || null } }); flash("Lesión guardada."); onSaved(); onClose(); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Agregar lesión o antecedente" sub="Se comparte solo con quien autorices en Privacidad." closeLabel="Cancelar" onClose={onClose}
      groups={[
        { label: "Zona", opts: INJURY_ZONES.map((z) => [z, z] as [string, string]), value: zone, onPick: (x) => setZone(x as string) },
        { label: "Estado", opts: Object.entries(INJURY_STATUS) as [string, string][], value: st, onPick: (x) => setSt(x as InjuryStatus) },
      ]}
      text={{ value: detail, onChange: setDetail, placeholder: "Detalle (ej.: esguince, operación, diagnóstico que te dieron)" }}
      action={{ label: "Guardar", ready, busy, onSubmit: submit }} />
  );
}
