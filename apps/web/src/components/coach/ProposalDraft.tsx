"use client";
// D191 · De una propuesta de Training Intelligence al editor de programas que ya existe (constructor del coach o edición del
// programa institucional en Gym). No hay un segundo editor: la propuesta viaja en esta pestaña del navegador, el editor la
// muestra arriba y sólo cambia el borrador si la persona toca «Aplicar». Guardar sigue el camino de siempre (permiso,
// versión nueva con su autoría, historial intacto). Nada de esto toca sesiones registradas ni los datos del alumno.
import { applyLoad, canApplyLoad, fmtWeight, type ExerciseDetail } from "@repi/domain";

export type TiDraft = {
  kind: "coach" | "gym"; relId: string; programId: string | null; proposalId: string;
  exerciseId: string; name: string; text: string; weightKg: number | null;
};
const KEY = "repi:ti-draft";

export function stashTiDraft(d: TiDraft) { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
/** La propuesta pendiente para este editor (mismo programa o misma relación), si la hay. */
export function readTiDraft(match: { kind: TiDraft["kind"]; programId?: string | null; relId?: string | null }): TiDraft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as TiDraft | null;
    if (!d || d.kind !== match.kind) return null;
    return (match.programId && d.programId === match.programId) || (match.relId && d.relId === match.relId) ? d : null;
  } catch { return null; }
}
export function clearTiDraft() { try { sessionStorage.removeItem(KEY); } catch {} }

type Ex = { exerciseId: string; sets: number; reps: string; detail?: ExerciseDetail | null };

/** Nuevos detalles por día y posición si se aplica la carga propuesta (sólo series de trabajo iguales). */
export function draftPatches(d: TiDraft, days: { exercises: Ex[] }[]) {
  const out: { day: number; index: number; detail: ExerciseDetail }[] = [];
  if (d.weightKg == null) return out;
  days.forEach((x, di) => x.exercises.forEach((e, i) => {
    if (e.exerciseId === d.exerciseId && canApplyLoad(e.detail)) out.push({ day: di, index: i, detail: applyLoad(e.detail, e.sets, e.reps, d.weightKg!) });
  }));
  return out;
}

export function ProposalBanner({ draft, days, onApply, onDismiss }: {
  draft: TiDraft; days: { exercises: Ex[] }[];
  onApply: (patches: ReturnType<typeof draftPatches>) => void; onDismiss: () => void;
}) {
  const patches = draftPatches(draft, days);
  const present = days.some((x) => x.exercises.some((e) => e.exerciseId === draft.exerciseId));
  return (
    <section className="ti-draft" role="region" aria-label="Propuesta de Training Intelligence">
      <b>Propuesta de Training Intelligence · {draft.name}</b>
      <span>{draft.text}</span>
      <small className="muted">
        {!present ? "Este ejercicio ya no está en el programa: la propuesta no se puede aplicar acá."
          : patches.length ? `«Aplicar» cambia este borrador (${patches.length === 1 ? "1 ejercicio" : `${patches.length} ejercicios`}); se guarda como cualquier edición tuya, con una versión nueva. Las sesiones ya registradas no cambian.`
            : draft.weightKg != null ? "El ejercicio tiene series distintas (top set, drops o pirámide): ajustá la carga en «Series y técnica»."
              : "No es un cambio de carga: revisalo y editá el ejercicio a mano si corresponde."}
      </small>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {patches.length > 0 && <button type="button" className="btn sm pri" onClick={() => onApply(patches)}>Aplicar {fmtWeight(draft.weightKg!, "kg")} al borrador</button>}
        <button type="button" className="btn sm" onClick={onDismiss}>Cerrar propuesta</button>
      </div>
    </section>
  );
}
