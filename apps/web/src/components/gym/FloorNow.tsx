"use client";
// «En sala ahora» (D131) para el equipo y la gestión: profesores con turno iniciado, disponibilidad y cuántos socios los
// eligieron hoy. Cada profesor ve además quiénes entrenan con él. Lo declarado al iniciar el turno, no ubicación.
import { useEffect } from "react";
import { useLoad, when, type Shell } from "./shared";

type V = { trainers: { id: string; name: string; location: string; availability: "available" | "busy"; since: string; members: number; memberNames?: string[] }[] };

export function FloorNowCard({ shell }: { shell: Shell }) {
  const owner = shell.ctx.roles.includes("owner") || shell.ctx.roles.includes("manager");
  const d = useLoad<V>(`/api/gym/${shell.orgId}/floor-now${!owner && shell.loc ? `?loc=${shell.loc}` : ""}`);
  useEffect(() => { const t = setInterval(() => void d.reload(), 60_000); return () => clearInterval(t); }, [d.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data) return null;
  const multi = new Set(d.data.trainers.map((t) => t.location)).size > 1 || shell.ctx.locations.length > 1;
  return (
    <section className="card" aria-label="En sala ahora">
      <h2 style={{ margin: 0, fontSize: 18 }}>En sala ahora</h2>
      {!d.data.trainers.length ? <div className="empty">No hay profesores con el turno iniciado.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {d.data.trainers.map((t) => (
            <div key={t.id} className="crow" style={{ gap: 10, flexWrap: "wrap" }}>
              <b style={{ flex: "1 1 160px" }}>{t.name}{multi && <small className="muted"> · {t.location}</small>}</b>
              <span className={`chip ${t.availability === "busy" ? "warn" : "ok"}`}>{t.availability === "busy" ? "Ocupado" : "Disponible"}</span>
              <small className="muted">Desde {when(t.since)} · {t.members === 1 ? "1 socio lo eligió hoy" : `${t.members} socios lo eligieron hoy`}</small>
              {t.memberNames && t.memberNames.length > 0 && <small style={{ flex: "1 1 100%" }}>Entrenan con vos hoy: {t.memberNames.join(", ")}</small>}
            </div>
          ))}
        </div>
      )}
      <small className="muted">Los socios ven esta lista en su app y eligen con quién entrenan. Disponible u ocupado lo marca cada profesor en su turno.</small>
    </section>
  );
}
