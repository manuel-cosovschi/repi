"use client";
// Cambiar un ejercicio sólo en esta sesión (F-HX-21, D106): saltarlo o hacer otro compatible en su lugar, con motivo.
// No toca el programa ni lo que indicó el coach. Las alternativas necesitan conexión; saltar funciona sin red.
// No sugiere cargas: otro ejercicio no tiene la misma carga (se muestra la última registrada de ese ejercicio, si existe).
import { useState } from "react";
import { EXERCISE_CHANGE_REASONS, type ExerciseChangeReason, type WeightUnit } from "@repi/domain";
import { api } from "@/lib/api";
import type { ExChange, LocalEx } from "@/lib/offline/store";
import { Sheet } from "./Sheet";
import { kg } from "./types";

type Alt = { id: string; name: string; muscleGroup: string; sameGroup: boolean; prev: LocalEx["prev"] };

export function ExerciseChangeSheet({ sessionId, ex, unit, onApply, onPain, onClose }: {
  sessionId: string; ex: LocalEx; unit: WeightUnit; onApply: (c: ExChange | null, prev?: LocalEx["prev"]) => void; onPain: () => void; onClose: () => void;
}) {
  const [reason, setReason] = useState<ExerciseChangeReason | null>(ex.change?.reason ?? null);
  const [alts, setAlts] = useState<Alt[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadAlts = async () => {
    if (!reason) return setErr("Elegí el motivo primero.");
    setBusy(true); setErr(null);
    try { setAlts((await api<{ alternatives: Alt[] }>(`/api/me/sessions/${sessionId}/exercises?pe=${ex.id}`)).alternatives); }
    catch { setErr("Para ver alternativas necesitás conexión. Sin red podés saltarlo y seguir."); }
    finally { setBusy(false); }
  };
  const pick = (c: ExChange | null, prev?: LocalEx["prev"]) => { onApply(c, prev); onClose(); };
  return (
    <Sheet title={`Cambiar ${ex.name}`} sub="Sólo para este entrenamiento: tu programa no cambia y tu coach ve qué hiciste y por qué." onClose={onClose}
      groups={[{ label: "¿Qué pasa?", opts: Object.entries(EXERCISE_CHANGE_REASONS) as [string, string][], value: reason, onPick: (v) => { setReason(v as ExerciseChangeReason); setErr(null); } }]}
      warn={err}>
      {reason === "discomfort" && (
        <p className="sheet-sub" role="note">Si es dolor fuerte, punzante o no se va, frená el entrenamiento y consultá. No sigas un movimiento que duele.{" "}
          <button type="button" className="linkbtn" onClick={() => { onClose(); onPain(); }}>Registrar la molestia para tu coach</button></p>
      )}
      {ex.change && (
        <button type="button" className="ghost" onClick={() => pick(null)}>Volver a {ex.name}</button>
      )}
      {!alts ? (
        <div className="xc-actions">
          <button type="button" className="cta" aria-busy={busy || undefined} onClick={loadAlts}>Hacer otro ejercicio</button>
          <button type="button" className="ghost" onClick={() => (reason ? pick({ kind: "skip", reason, substitute: null }) : setErr("Elegí el motivo primero."))}>Saltar este ejercicio</button>
        </div>
      ) : !alts.length ? (
        <p className="sheet-sub">No hay otros ejercicios compatibles en tu biblioteca. Podés saltarlo o pedirle una alternativa a tu coach.</p>
      ) : (
        <ul className="xc-list" aria-label="Alternativas compatibles">
          {alts.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => pick({ kind: "substitute", reason: reason!, substitute: { exerciseId: a.id, name: a.name } }, a.prev)}>
                <strong>{a.name}</strong>
                <small>{a.muscleGroup}{a.sameGroup ? " · mismo grupo" : ""} · {a.prev ? `última vez ${kg(a.prev.weightKg, unit)} × ${a.prev.reps ?? "—"}` : "sin registro previo"}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {alts && <p className="sheet-sub">Las cargas no son equivalentes entre ejercicios: empezá liviano y ajustá.</p>}
    </Sheet>
  );
}
