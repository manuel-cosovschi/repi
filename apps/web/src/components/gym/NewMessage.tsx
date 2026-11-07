"use client";
// «Nuevo mensaje» en Mensajes de sala (pedido del titular, 07/11/2026): el entrenador elige un socio de la sede y le escribe,
// sin pasar por la ficha. Abre (o reutiliza) la conversación del socio con el equipo de sala; el primer mensaje se escribe ahí.
import { useEffect, useState } from "react";
import { MagnifyingGlass, PencilSimple } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";
import { Modal } from "@/components/ui/Modal";
import { initials, useAct, useLoad, type Shell } from "./shared";

type Row = { id: string; name: string; status: { label: string; tone: string } };

export function NewMessageButton({ shell, onOpen }: { shell: Shell; onOpen: (conversationId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn pri" onClick={() => setOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Ic i={PencilSimple} size={16} /> Nuevo mensaje
      </button>
      {open && <PickMember shell={shell} onClose={() => setOpen(false)} onOpen={(id) => { setOpen(false); onOpen(id); }} />}
    </>
  );
}

function PickMember({ shell, onClose, onOpen }: { shell: Shell; onClose: () => void; onOpen: (id: string) => void }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const [q, setQ] = useState("");
  const [qq, setQq] = useState("");
  useEffect(() => { const t = setTimeout(() => setQq(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useLoad<{ members: Row[] }>(`/api/gym/${shell.orgId}/members?loc=${loc}&q=${encodeURIComponent(qq)}`);
  const { busy, run } = useAct(shell.flash);
  const pick = (m: Row) => run(m.id, async () => {
    const r = await api<{ id: string }>(`/api/gym/${shell.orgId}/members/${m.id}/conversation`, { body: {} });
    onOpen(r.id);
  });
  return (
    <Modal label="Nuevo mensaje" onClose={onClose}>
      <div className="mhead"><h2>Nuevo mensaje</h2><button type="button" className="x" aria-label="Cerrar" onClick={onClose}>×</button></div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Elegí un socio de la sede. La conversación es con el equipo de sala; la gerencia no ve su contenido.</p>
      <label className="search"><Ic i={MagnifyingGlass} size={16} color="var(--ui-muted)" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar socio" aria-label="Buscar socio para escribirle" autoFocus /></label>
      {list.err && <p role="alert" className="err-box">{list.err}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "50vh", overflowY: "auto" }}>
        {list.data?.members.map((m) => (
          <button key={m.id} type="button" className="crow" aria-busy={busy === m.id || undefined} disabled={!!busy} onClick={() => void pick(m)}>
            <span className="av36">{initials(m.name)}</span>
            <span><b>{m.name}</b><small className="muted">{m.status.label}</small></span>
          </button>
        ))}
        {list.data && !list.data.members.length && <span className="muted" style={{ padding: 12, textAlign: "center", fontSize: 14 }}>{qq ? "Sin resultados." : "Todavía no hay socios activos en REPI en esta sede."}</span>}
        {!list.data && !list.err && <span className="muted">Cargando…</span>}
      </div>
    </Modal>
  );
}
