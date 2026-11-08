"use client";
// «En sala ahora» (D131): profesores con turno iniciado en la sede del socio y con quién entrena hoy. Tocá para elegir;
// tocá de nuevo para quitar. Es lo que declaran los profesores al iniciar el turno, no una ubicación.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCached } from "@/lib/cache";
import { Skel } from "@/components/motion/Skeleton";

type Gym = { orgId: string; gymMemberId: string; gym: string; location: string; trainers: { id: string; name: string; availability: "available" | "busy"; since: string }[]; pick: string | null };

export function FloorNow({ orgId, flash, offline }: { orgId: string | null | undefined; flash: (t: string) => void; offline?: boolean }) {
  // M06: la primera vez reserva el alto de la tarjeta (sin empujar «Entrenar» cuando llega); el sondeo conserva lo último
  // cargado (y se pausa con la sección oculta).
  const c = useCached<{ gyms: Gym[] }>(offline ? null : "/api/me/gym/floor");
  const g = c.data?.gyms.find((x) => x.orgId === orgId) ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const load = c.reload;
  const setG = (v: Gym) => c.setData((d) => (d ? { ...d, gyms: d.gyms.map((x) => (x.orgId === v.orgId ? v : x)) } : d));
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  if (!g) return !c.data && !c.err && !offline ? (
    <section className="fl-now" aria-hidden="true">
      <div className="fl-head"><Skel w="58%" h={14} style={{ margin: "2px 0" }} /><Skel w="44%" h={12} style={{ margin: "2px 0" }} /></div>
      <div style={{ display: "flex", gap: 8 }}>{[0, 1].map((i) => <Skel key={i} w={132} h={44} r={22} />)}</div>
    </section>
  ) : null;
  const pick = async (id: string) => {
    const next = g.pick === id ? null : id;
    setBusy(id);
    try {
      const r = await api<{ pick: string | null; name?: string }>("/api/me/gym/floor", { body: { gymMemberId: g.gymMemberId, trainerId: next } });
      setG({ ...g, pick: r.pick });
      flash(r.pick ? `Hoy entrenás con ${r.name}.` : "Quitaste la elección del profesor.");
    } catch (e) { flash((e as Error).message); void load(); } finally { setBusy(null); }
  };
  return (
    <section className="fl-now" aria-label={`En sala ahora en ${g.location}`}>
      <div className="fl-head"><b>En sala ahora · {g.location}</b><small>{g.trainers.length ? "Elegí con quién entrenás hoy" : ""}</small></div>
      {!g.trainers.length ? <small className="fl-empty">No hay profesores con el turno iniciado en este momento.</small> : (
        <div className="fl-list">
          {g.trainers.map((t) => (
            <button key={t.id} type="button" className="fl-t" aria-pressed={g.pick === t.id} aria-busy={busy === t.id || undefined} onClick={() => void pick(t.id)}>
              <span className="fl-ini" aria-hidden="true">{t.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
              <span><b>{t.name.split(" ")[0]}</b><small className={t.availability === "busy" ? "busy" : "ok"}>{t.availability === "busy" ? "Ocupado" : "Disponible"}</small></span>
            </button>
          ))}
        </div>
      )}
      {g.pick && <small className="fl-note">Entrenás con {g.trainers.find((t) => t.id === g.pick)?.name.split(" ")[0]}: lo ve en su turno y queda en tu entrenamiento de hoy.</small>}
    </section>
  );
}
