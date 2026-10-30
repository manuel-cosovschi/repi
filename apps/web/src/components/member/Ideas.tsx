"use client";
// D156: «Sugerí una mejora». El alumno cuenta qué le gustaría que REPI haga mejor; le llega al equipo de REPI (REPI Admin
// → Sugerencias, y un aviso por email al titular). La respuesta, si la hay, aparece acá mismo. Vive en Inicio, la primera
// pantalla: cerrada es una tarjeta de una línea y al tocarla se despliega el formulario.
import { useCallback, useEffect, useState } from "react";
import { Lightbulb } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";

const AREAS = [["train", "Entrenar"], ["progress", "Progreso"], ["messages", "Mensajes"], ["gym", "Gym y club"], ["profile", "Perfil"], ["other", "Otra cosa"]] as const;
type Mine = { code: string; category: string; message: string; status: "open" | "in_progress" | "resolved"; resolution: string | null; createdAt: string };
const ST: Record<Mine["status"], string> = { open: "Enviada", in_progress: "La están viendo", resolved: "Respondida" };

export function Ideas({ offline, flash }: { offline: boolean; flash: (m: string) => void }) {
  const [area, setArea] = useState<(typeof AREAS)[number][0] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Mine[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api<Mine[]>("/api/me/support").then((r) => setMine(r.filter((x) => x.category === "idea"))).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    if (offline) { flash("Necesitás conexión para mandar tu sugerencia."); return; }
    if (msg.trim().length < 10) { flash("Contanos un poco más (al menos 10 caracteres)."); return; }
    setBusy(true);
    try {
      await api("/api/support", { body: { category: "idea", message: msg.trim(), diagnostics: area ? { area } : null } });
      setMsg(""); setArea(null); setOpen(false); flash("¡Gracias! Tu sugerencia le llegó al equipo de REPI."); void load();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  const replies = mine.filter((x) => x.resolution).length;
  if (!open) return (
    <button type="button" className="hbanner ideas-open" aria-expanded={false} aria-controls="ideas-form" onClick={() => setOpen(true)}>
      <Ic i={Lightbulb} size={22} color="#5DE6D8" />
      <span><b>Sugerí una mejora para REPI</b><small>{replies ? `Tenés ${replies === 1 ? "una respuesta" : `${replies} respuestas`} del equipo de REPI` : "¿Qué te gustaría que la app haga mejor?"}</small></span><em>Escribir</em>
    </button>
  );
  return (
    <section id="ideas-form" className="wishes ideas-card" aria-labelledby="ideas-h">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 id="ideas-h" style={{ fontSize: 16 }}>Sugerí una mejora</h2>
        <button type="button" className="linkbtn" aria-expanded={true} aria-controls="ideas-form" onClick={() => setOpen(false)}>Cerrar</button>
      </div>
      <span className="mb-muted" style={{ fontSize: 13, lineHeight: 1.45 }}>¿Algo que REPI podría hacer mejor o que te gustaría tener? Le llega directo al equipo de REPI. No pongas datos de salud ni contraseñas.</span>
      <div className="wish-goals" role="group" aria-label="¿Sobre qué parte de la app?">
        {AREAS.map(([k, label]) => <button key={k} type="button" className="ai-chip" aria-pressed={area === k} onClick={() => setArea(area === k ? null : k)}>{label}</button>)}
      </div>
      <label>Tu idea<textarea rows={3} maxLength={2000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ej.: que el cronómetro de descanso suene más fuerte" /></label>
      <button type="button" className="cta" disabled={busy || msg.trim().length < 10} aria-busy={busy || undefined} onClick={() => void send()}>{busy ? "Enviando…" : "Mandar sugerencia"}</button>
      {mine.length > 0 && (
        <div className="ideas-mine" aria-label="Tus sugerencias">
          {mine.slice(0, 5).map((x) => (
            <div key={x.code}>
              <small className="mb-muted">{new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" }).format(new Date(x.createdAt))} · {ST[x.status]}</small>
              <span>{x.message.length > 140 ? `${x.message.slice(0, 140)}…` : x.message}</span>
              {x.resolution && <span className="ideas-reply"><b>Respuesta de REPI:</b> {x.resolution}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
