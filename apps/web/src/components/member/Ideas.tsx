"use client";
// D156: «Sugerí una mejora». El alumno cuenta qué le gustaría que REPI haga mejor; le llega al equipo de REPI (REPI Admin
// → Sugerencias, y un aviso por email al titular). La respuesta, si la hay, aparece acá mismo.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AREAS = [["train", "Entrenar"], ["progress", "Progreso"], ["messages", "Mensajes"], ["gym", "Gym y club"], ["profile", "Perfil"], ["other", "Otra cosa"]] as const;
type Mine = { code: string; category: string; message: string; status: "open" | "in_progress" | "resolved"; resolution: string | null; createdAt: string };
const ST: Record<Mine["status"], string> = { open: "Enviada", in_progress: "La están viendo", resolved: "Respondida" };

export function Ideas({ offline, flash }: { offline: boolean; flash: (m: string) => void }) {
  const [area, setArea] = useState<(typeof AREAS)[number][0] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Mine[]>([]);
  const load = useCallback(() => api<Mine[]>("/api/me/support").then((r) => setMine(r.filter((x) => x.category === "idea"))).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    if (offline) { flash("Necesitás conexión para mandar tu sugerencia."); return; }
    if (msg.trim().length < 10) { flash("Contanos un poco más (al menos 10 caracteres)."); return; }
    setBusy(true);
    try {
      await api("/api/support", { body: { category: "idea", message: msg.trim(), diagnostics: area ? { area } : null } });
      setMsg(""); setArea(null); flash("¡Gracias! Tu sugerencia le llegó al equipo de REPI."); void load();
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="wishes" aria-labelledby="ideas-h">
      <h2 id="ideas-h" style={{ fontSize: 16 }}>Sugerí una mejora</h2>
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
