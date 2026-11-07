"use client";
// Asistente REPI (D209) · «¿Por qué te digo esto?». Hoja (la pidió la persona) con la evidencia que mandó el servidor: qué se
// comparó, qué sesiones y qué se dejó afuera, y de dónde sale. Opinar queda registrado sólo después de que el servidor lo confirma.
import { useState } from "react";
import { api } from "@/lib/api";
import { Sheet } from "@/components/member/Sheet";
import { useBrain, type WhyInput } from "./BrainProvider";
import { EvidenceBody } from "./parts";
import { OFFLINE_NOTE } from "./presenter";

export function RepiWhy({ w, onClose }: { w: WhyInput; onClose: () => void }) {
  const brain = useBrain();
  const [sent, setSent] = useState<{ value: 1 | -1; state: "busy" | "ok" | "err" } | null>(null);
  const rate = async (value: 1 | -1) => {
    if (!w.feedback || brain.offline || sent?.state === "busy") return;
    setSent({ value, state: "busy" });
    try {
      if (w.feedback.target === "message") await api("/api/me/brain/feedback", { body: { messageId: w.feedback.id, value } });
      else await api("/api/me/brain/action", { body: { op: "propose", kind: "record_feedback", input: { target: "intervention", id: w.feedback.id, value } } });
      setSent({ value, state: "ok" });
    } catch { setSent({ value, state: "err" }); }
  };
  return (
    <Sheet title="¿Por qué te digo esto?" sub={w.claim} onClose={onClose}>
      <EvidenceBody e={w.evidence} />
      {w.feedback && (
        <div className="rp-why-fb" role="group" aria-label="¿Te sirvió la explicación?">
          <span>¿Te sirvió?</span>
          <button type="button" className="ghost sm" aria-pressed={sent?.value === 1} disabled={brain.offline || sent?.state === "busy"} onClick={() => void rate(1)}>Me sirve</button>
          <button type="button" className="ghost sm" aria-pressed={sent?.value === -1} disabled={brain.offline || sent?.state === "busy"} onClick={() => void rate(-1)}>No me sirve</button>
        </div>
      )}
      {sent?.state === "ok" && <p className="sheet-sub" role="status">Gracias por avisar: lo tengo en cuenta.</p>}
      {sent?.state === "err" && <p className="sheet-sub" role="status">No llegó tu opinión. Probá de nuevo en un rato.</p>}
      {brain.offline && <p className="sheet-sub" role="status">{OFFLINE_NOTE}</p>}
      {w.chat && !brain.offline && (
        <button type="button" className="ghost" onClick={() => { const c = w.chat!; onClose(); setTimeout(() => brain.open(c), 0); }}>Hablar con REPI</button>
      )}
    </Sheet>
  );
}
