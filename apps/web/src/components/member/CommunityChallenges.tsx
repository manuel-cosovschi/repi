"use client";
// D172: desafíos que proponen los socios. Un profe los aprueba con una dificultad (fácil, media, difícil) y se publican
// para la sede; validarlos, con video o en sala, suma puntos al nivel. En Inicio se ven los activos y se propone uno nuevo.
import { useCallback, useEffect, useState } from "react";
import { Lightbulb, Trophy } from "@phosphor-icons/react";
import { CHALLENGE_DIFFICULTY, CHALLENGE_UNITS, MAX_PENDING_PROPOSALS, type ChallengeUnit } from "@repi/domain";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";
import { Sheet } from "./Sheet";
import type { Nudge } from "./Nudges";

type Item = { id: string; title: string; rule: string; endsOn: string; difficulty: { level: number; label: string; xp: number }; prize: string; by: string; record: string; mine: string | null };
type Data = { orgId: string | null; minor: boolean; pending: number; items: Item[] };

export const DIFF_CLASS = ["", "easy", "mid", "hard"] as const;
/** Chip de dificultad con los puntos que suma validarlo. */
export function DifficultyChip({ d }: { d: { level: number; label: string; xp: number } }) {
  return <span className={`chd chd-${DIFF_CLASS[d.level] ?? "easy"}`}>{d.label} · +{d.xp} pts</span>;
}

/** Sección de Inicio: desafíos de la comunidad y «Proponer un desafío». */
export function CommunityChallenges({ go, flash }: { go: (n: Nudge) => void; flash: (t: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [propose, setPropose] = useState(false);
  const load = useCallback(() => api<Data>("/api/me/gym/community-challenges").then(setD).catch(() => setD(null)), []);
  useEffect(() => { void load(); }, [load]);
  if (!d?.orgId) return null;
  const open = (c: Item) => go({ id: `community:${c.id}`, title: c.title, body: "", cta: "", action: "challenge", challengeId: c.id });
  return (
    <section className="cch" aria-label="Desafíos de la comunidad">
      <div className="cch-head">
        <h2><Ic i={Trophy} size={16} weight="fill" color="#00D1FF" />Desafíos de la comunidad</h2>
        {!d.minor && <button type="button" className="linkbtn" onClick={() => setPropose(true)}>Proponer</button>}
      </div>
      {!d.items.length && (
        <button type="button" className="cch-empty" onClick={() => (d.minor ? undefined : setPropose(true))} disabled={d.minor}>
          <Ic i={Lightbulb} size={22} color="#00D1FF" />
          <span><b>¿Tenés un desafío en mente?</b><small>Proponelo: si un profe lo aprueba, lo ve toda la sede y validarlo suma puntos a tu nivel.</small></span>
        </button>
      )}
      {d.items.length > 0 && (
        <div className="cch-list">
          {d.items.map((c) => (
            <article key={c.id} className="cch-card">
              <span className="cch-meta"><DifficultyChip d={c.difficulty} /><small>Propuesto por {c.by}</small></span>
              <b>{c.title}</b>
              <small className="cch-rule">{c.rule}</small>
              <span className="cch-foot">
                <small>Récord: <strong>{c.record}</strong></small>
                {c.mine === "approved" ? <span className="st-chip ok">Validado</span> : c.mine === "pending" ? <span className="st-chip warn">En validación</span>
                  : !d.minor && <button type="button" className="cta sm" onClick={() => open(c)}>Intentarlo</button>}
              </span>
            </article>
          ))}
        </div>
      )}
      {d.pending > 0 && <small className="mb-muted">Tenés {d.pending} propuesta{d.pending === 1 ? "" : "s"} esperando que un profe la{d.pending === 1 ? "" : "s"} revise.</small>}
      {propose && <ProposeSheet orgId={d.orgId} pending={d.pending} flash={flash} onClose={(sent) => { setPropose(false); if (sent) void load(); }} />}
    </section>
  );
}

/** Formulario para proponer un desafío; lo revisa el equipo de sala. */
export function ProposeSheet({ orgId, pending, flash, onClose }: { orgId: string; pending: number; flash: (t: string) => void; onClose: (sent: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [rule, setRule] = useState("");
  const [unit, setUnit] = useState<ChallengeUnit>("reps");
  const [lower, setLower] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const full = pending >= MAX_PENDING_PROPOSALS;
  const ready = !full && title.trim().length >= 3 && rule.trim().length >= 10;
  const submit = async () => {
    if (full) { flash(`Ya tenés ${MAX_PENDING_PROPOSALS} propuestas esperando al equipo.`); return; }
    if (title.trim().length < 3) { flash("Poné un nombre al desafío."); return; }
    if (rule.trim().length < 10) { flash("Contá cómo se hace: qué cuenta y cómo tiene que verse el intento."); return; }
    setBusy(true);
    try { await api(`/api/me/gym/proposals?org=${orgId}`, { body: { title, rule, unit, lowerIsBetter: unit === "seg" ? lower : false } }); setSent(true); }
    catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  };
  if (sent) return (
    <Sheet title="Propuesta enviada" onClose={() => onClose(true)} action={{ label: "Listo", ready: true, onSubmit: () => onClose(true) }}>
      <p className="mb-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>Un profe de tu sede la revisa y le pone la dificultad. Si la aprueba, aparece en Inicio para toda la sede y te avisamos.</p>
    </Sheet>
  );
  return (
    <Sheet title="Proponer un desafío" sub="Lo revisa el equipo de sala antes de publicarlo" onClose={() => onClose(false)} action={{ label: "Enviar propuesta", ready, busy, onSubmit: () => void submit() }}>
      <label className="or-field">Nombre<input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: 50 burpees por tiempo" /></label>
      <label className="or-field">Cómo se hace<textarea style={{ fontSize: 16 }} value={rule} maxLength={400} rows={3} onChange={(e) => setRule(e.target.value)} placeholder="Qué cuenta como válido y cómo tiene que verse el intento" /></label>
      <fieldset className="sheet-group"><legend>Cómo se mide</legend>
        <div>{(Object.keys(CHALLENGE_UNITS) as ChallengeUnit[]).map((k) => <button key={k} type="button" aria-pressed={unit === k} onClick={() => setUnit(k)}>{CHALLENGE_UNITS[k][0].toUpperCase() + CHALLENGE_UNITS[k].slice(1)}</button>)}</div>
      </fieldset>
      {unit === "seg" && <label className="sheet-check"><input type="checkbox" checked={lower} onChange={(e) => setLower(e.target.checked)} />Gana el menor tiempo</label>}
      <p className="mb-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
        Puntos para el nivel según la dificultad que elija el profe: {Object.values(CHALLENGE_DIFFICULTY).map((x) => `${x.label.toLowerCase()} +${x.xp}`).join(", ")}.
        {full ? ` Ya tenés ${MAX_PENDING_PROPOSALS} propuestas esperando.` : ""}
      </p>
    </Sheet>
  );
}
