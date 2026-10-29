"use client";
// Socios de la sede: lista y ficha institucional (REPI Desktop Gym.dc.html · sc.members, modal "edit").
// La ficha nunca muestra salud, nutrición, Mi cuerpo, la app del socio ni su relación con un coach privado (DEC-10/11).
import { Fragment, useEffect, useMemo, useState } from "react";
import { TASK_CATEGORY, formatRest, mentionsHealth, parseRest, type ProgramDoc } from "@repi/domain";
import { api } from "@/lib/api";
import { NewExercise } from "@/components/coach/NewExercise";
import { Modal } from "@/components/ui/Modal";
import { ApprovedSubs, subsLabel, useSubstitutions } from "@/components/coach/ApprovedSubs";
import { featureOn } from "@/lib/features";
import { NewTaskModal, TaskCard } from "./Floor";
import { Bars, Head, fmt, initials, useAct, useLoad, when, type Shell, type Task } from "./shared";
import { Ic } from "@/components/ui/Ic";
import { Lock, MagnifyingGlass } from "@phosphor-icons/react";

type Row = { id: string; name: string; since: string; lastSessionAt: string | null; visits30: number; program: { name: string; revision: number } | null; status: { label: string; tone: string } };
type Detail = {
  id: string; name: string; since: string; status: { label: string; tone: string }; trainingShared: boolean; lastSessionAt: string | null; visits30: number;
  weeks: { label: string; n: number }[];
  program: { programId: string; startsOn: string; revision: number; doc: ProgramDoc & { days: (ProgramDoc["days"][number] & { id?: string })[] }; revisions: { number: number; author: string; reason: string | null; at: string }[] } | null;
  tasks: Task[]; notes: { id: string; kind: "institutional" | "personal"; text: string; author: string; mine: boolean; at: string }[];
  canEdit: boolean; canWriteNotes: boolean; restricted: string[];
  community: { attempts: { challenge: string; value: string; status: string; newRecord: boolean; at: string }[]; achievements: number; level: number; visits30: number } | null;
};

export function MembersScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const [q, setQ] = useState("");
  const [qq, setQq] = useState("");
  useEffect(() => { const t = setTimeout(() => setQq(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useLoad<{ location: { name: string }; awaiting: string[]; members: Row[] }>(`/api/gym/${shell.orgId}/members?loc=${loc}&q=${encodeURIComponent(qq)}`);
  const current = shell.sel ?? list.data?.members[0]?.id ?? null;
  return (
    <>
      <Head kicker={`${shell.ctx.org.name}${list.data ? ` · ${list.data.location.name}` : ""}`} title="Socios" />
      {list.err && <p role="alert" className="err-box">{list.err}</p>}
      <div className="split">
        <div className="list-pane">
          <label className="search"><Ic i={MagnifyingGlass} size={16} color="#5B6B80" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar socio" aria-label="Buscar socio" /></label>
          {list.data?.members.map((m) => (
            <button key={m.id} type="button" className="crow" aria-current={m.id === current} onClick={() => shell.setSel(m.id)}>
              <span className="av36">{initials(m.name)}</span>
              <span><b>{m.name}</b><small className="muted">{m.program ? m.program.name : "Sin programa"} · {m.visits30} {m.visits30 === 1 ? "sesión" : "sesiones"} en 30 días</small></span>
              <span className={`chip ${m.status.tone}`}>{m.status.label}</span>
            </button>
          ))}
          {list.data && !list.data.members.length && <span className="muted" style={{ padding: 20, textAlign: "center", fontSize: 14 }}>{qq ? "Sin resultados." : "Todavía no hay socios activos en REPI en esta sede."}</span>}
          {!!list.data?.awaiting.length && <span className="muted" style={{ padding: "8px 12px", fontSize: 13 }}>Aprobados, falta que confirmen en su app qué comparten: {list.data.awaiting.join(", ")}. Aparecen acá al confirmar.</span>}
        </div>
        <div className="detail-pane">{current ? <MemberDetail key={current} shell={shell} id={current} loc={loc!} onChanged={list.reload} /> : list.data && <div className="empty">Elegí un socio.</div>}</div>
      </div>
    </>
  );
}

function MemberDetail({ shell, id, loc, onChanged }: { shell: Shell; id: string; loc: string; onChanged: () => void }) {
  const d = useLoad<Detail>(`/api/gym/${shell.orgId}/members/${id}`);
  const [noteKind, setNoteKind] = useState<"institutional" | "personal">("institutional");
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState(false);
  const [task, setTask] = useState(false);
  const { busy, run } = useAct(shell.flash);
  if (d.err) return <p role="alert" className="err-box">{d.err}</p>;
  if (!d.data) return <p className="muted">Cargando ficha…</p>;
  const m = d.data;
  const notes = m.notes.filter((n) => n.kind === noteKind);
  const saveNote = () => run("note", () => api(`/api/gym/${shell.orgId}/members/${id}/notes`, { body: { kind: noteKind, text: draft } }),
    noteKind === "institutional" ? "Nota institucional guardada. El equipo de la sede puede verla." : "Nota personal guardada. Sólo vos la ves.").then((r) => { if (r) { setDraft(""); d.reload(); } });
  const write = () => run("chat", async () => { const r = await api<{ id: string }>(`/api/gym/${shell.orgId}/members/${id}/conversation`, { body: {} }); shell.go("msgs", { sel: r.id }); });
  const floor = shell.ctx.caps.includes("floor.work");
  return (
    <>
      <section className="card who" style={{ flexDirection: "row" }}>
        <span className="av56">{initials(m.name)}</span>
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 600 }}>{m.name}</span>
          <span className="muted" style={{ fontSize: 13 }}>Socio en REPI desde {fmt(m.since, { month: "short", year: "numeric" })} · última sesión {m.lastSessionAt ? when(m.lastSessionAt) : "—"} · {m.visits30} en 30 días</span>
        </div>
        <span className={`chip ${m.status.tone}`}>{m.status.label}</span>
        <div className="co-actions">
          {floor && <button type="button" className="btn" onClick={() => setTask(true)}>Nueva tarea</button>}
          {floor && <button type="button" className="btn" aria-busy={busy === "chat" || undefined} onClick={write}>Escribir</button>}
          {m.canEdit && <button type="button" className="btn pri" onClick={() => setEdit(true)}>{m.program ? "Editar programa" : "Crear programa"}</button>}
        </div>
      </section>
      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))" }}>
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <h2>Programa institucional</h2>
            {m.program && <span className="chip mute">revisión {m.program.revision}</span>}
          </div>
          {!m.program ? <span className="muted" style={{ fontSize: 14 }}>Sin programa. {m.canEdit ? "Creá uno: el socio lo ve en su app." : ""}</span> : (
            <>
              <span className="muted">{m.program.doc.name} · {m.program.doc.weeks} semanas · desde {m.program.startsOn.split("-").reverse().join("/")}</span>
              {m.program.doc.days.map((day, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <b style={{ fontSize: 13 }}>{day.name}</b>
                  {day.exercises.map((e, j) => <div key={j} className="trow" style={{ padding: "6px 4px" }}><span style={{ flex: 1 }}>{e.name}</span><span className="muted">{e.sets} × {e.reps}{e.rir != null ? ` · RIR ${e.rir}` : ""} · {formatRest(e.restSec)}</span></div>)}
                </div>
              ))}
              <h2 style={{ fontSize: 14, marginTop: 6 }}>Revisiones</h2>
              {m.program.revisions.map((r) => <div key={r.number} className="trow" style={{ padding: "6px 4px" }}><span className="muted" style={{ flex: "0 0 80px" }}>{fmt(r.at)}</span><span style={{ flex: 1 }}><b>{r.author}</b> · {r.reason ?? "Sin motivo"}</span><span className="muted">v{r.number}</span></div>)}
            </>
          )}
        </section>
        <section className="card">
          <h2>Asistencia · 8 semanas</h2>
          {m.trainingShared ? <Bars data={m.weeks} label="Sesiones por semana" /> : <span className="muted">El socio no comparte sus entrenamientos con el gym.</span>}
          <span className="muted">Sesiones registradas desde el programa institucional. La relación con un coach privado no se ve acá.</span>
        </section>
      </div>
      {m.community && (
        <section className="card">
          <h2>Comunidad del gym</h2>
          <span className="muted">Nivel {m.community.level} · {m.community.achievements} logros del gym · {m.community.visits30} ingresos por recepción en 30 días</span>
          {m.community.attempts.map((a, i) => <div key={i} className="trow"><span style={{ flex: 1 }}>{a.challenge} · <b>{a.value}</b>{a.newRecord ? " · récord" : ""}</span><span className={`chip ${a.status === "approved" ? "ok" : "warn"}`}>{a.status === "approved" ? "Validado" : "Pendiente"}</span><span className="muted">{fmt(a.at)}</span></div>)}
          {!m.community.attempts.length && <span className="muted">Sin intentos en desafíos.</span>}
        </section>
      )}
      <section className="card">
        <h2>Tareas abiertas</h2>
        {!m.tasks.length && <span className="muted" style={{ fontSize: 14 }}>Sin tareas abiertas para este socio.</span>}
        {m.tasks.map((t) => <TaskCard key={t.id} t={t} />)}
      </section>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <h2>Notas</h2>
          <div className="seg" role="tablist" aria-label="Tipo de nota">
            <button type="button" role="tab" aria-selected={noteKind === "institutional"} onClick={() => setNoteKind("institutional")}>Institucionales</button>
            {floor && <button type="button" role="tab" aria-selected={noteKind === "personal"} onClick={() => setNoteKind("personal")}>Mis notas personales</button>}
          </div>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{noteKind === "institutional" ? "Visibles para el equipo de entrenamiento de la sede. No incluyas datos de salud ni contenido de mensajes privados." : "Sólo vos las ves. No se incluyen en traspasos ni en reportes de gestión."}</span>
        {m.canWriteNotes && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea className="note" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} aria-label="Nueva nota" placeholder="Escribí una nota" />
            {noteKind === "institutional" && mentionsHealth(draft) && <p className="gy-warn" role="note" style={{ margin: 0 }}>Parece que mencionás datos de salud. Las notas institucionales las ve todo el equipo.</p>}
            <div><button type="button" className="btn sm pri" aria-busy={busy === "note" || undefined} aria-disabled={draft.trim().length < 2} onClick={() => draft.trim().length >= 2 && saveNote()}>Guardar nota</button></div>
          </div>
        )}
        {notes.map((n) => <div key={n.id} className="trow" style={{ alignItems: "flex-start" }}><span className="muted" style={{ flex: "0 0 120px" }}>{n.author} · {fmt(n.at)}</span><span style={{ flex: 1, lineHeight: 1.45 }}>{n.text}</span></div>)}
        {!notes.length && <span className="muted" style={{ fontSize: 14 }}>Sin notas.</span>}
      </section>
      <section className="card lock" style={{ flexDirection: "row" }}>
        <Ic i={Lock} size={22} color="#5B6B80" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2>Datos restringidos</h2>
          <span className="muted" style={{ fontSize: 14 }}>{m.restricted.join(" · ")}. El gym no los ve: son del socio y de las relaciones que él autorice.</span>
        </div>
      </section>
      {edit && <EditProgramModal shell={shell} member={m} onClose={(ok) => { setEdit(false); if (ok) { d.reload(); onChanged(); shell.refreshBadges(); } }} />}
      {task && <NewTaskModal shell={shell} loc={loc} gymMemberId={m.id} memberName={m.name} onClose={(ok) => { setTask(false); if (ok) d.reload(); }} />}
    </>
  );
}

type Lib = { id: string; name: string; group: string; kind: string; own?: boolean }[];
type Ex = ProgramDoc["days"][number]["exercises"][number];

function EditProgramModal({ shell, member, onClose }: { shell: Shell; member: Detail; onClose: (ok: boolean) => void }) {
  const lib = useLoad<Lib>(`/api/gym/${shell.orgId}/library`);
  const { subs, setSubs } = useSubstitutions(shell.orgId);
  const [subsFor, setSubsFor] = useState<string | null>(null); // ejercicio con el panel de reemplazos abierto
  const base: ProgramDoc = member.program
    ? { name: member.program.doc.name, weeks: member.program.doc.weeks, note: member.program.doc.note, days: member.program.doc.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, note: e.note ?? null })) })) }
    : { name: "Programa inicial", weeks: 6, note: "", days: [{ name: "Día A", exercises: [] }] };
  const [doc, setDoc] = useState<ProgramDoc>(base);
  const [day, setDay] = useState(0);
  const [reason, setReason] = useState("");
  const [libQ, setLibQ] = useState("");
  const related = member.tasks.find((t) => ["open", "in_progress", "follow_up"].includes(t.status) && (!t.assignee || t.assignee.id) && ["programa_nuevo", "actualizar_programa", "onboarding", "tecnica"].includes(t.category));
  const [complete, setComplete] = useState(!!related);
  const { busy, run } = useAct(shell.flash);
  const setEx = (i: number, patch: Partial<Ex>) => setDoc((d) => ({ ...d, days: d.days.map((x, j) => j === day ? { ...x, exercises: x.exercises.map((e, k) => k === i ? { ...e, ...patch } : e) } : x) }));
  const removeEx = (i: number) => setDoc((d) => ({ ...d, days: d.days.map((x, j) => j === day ? { ...x, exercises: x.exercises.filter((_, k) => k !== i) } : x) }));
  const addEx = (e: Lib[number]) => setDoc((d) => ({ ...d, days: d.days.map((x, j) => j === day ? { ...x, exercises: [...x.exercises, { exerciseId: e.id, name: e.name, sets: 3, reps: "10-12", rir: 2, restSec: 90, note: null }] } : x) }));
  const filtered = useMemo(() => (lib.data ?? []).filter((e) => !libQ || (e.name + " " + e.group).toLowerCase().includes(libQ.toLowerCase())).slice(0, 24), [lib.data, libQ]);
  const save = async () => {
    const r = await run("save", () => api<{ revision: number; completed: { ref: string; invite: string | null } | null }>(`/api/gym/${shell.orgId}/members/${member.id}/program`, { body: { doc, reason, completeTaskId: complete && related ? related.id : null } }),
      (x) => { const y = x as { revision: number; completed: { ref: string; invite: string | null } | null }; return y.completed ? `Programa guardado (revisión ${y.revision}) y ${y.completed.ref} completada.${y.completed.invite === "pending" ? ` ${member.name.split(" ")[0]} recibirá una invitación opcional para opinar.` : ""}` : `Programa guardado. Revisión ${y.revision} registrada para el equipo.`; });
    if (r) onClose(true);
  };
  const cur = doc.days[day];
  return (
    <Modal label={`Editar programa · ${member.name}`} onClose={() => onClose(false)} wide>
      <div className="mhead"><h2>{member.program ? "Editar" : "Crear"} programa · {member.name}</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "2 1 240px" }}>Nombre<input value={doc.name} maxLength={120} onChange={(e) => setDoc({ ...doc, name: e.target.value })} /></label>
        <label className="field" style={{ flex: "0 0 110px" }}>Semanas<input type="number" min={1} max={52} value={doc.weeks} onChange={(e) => setDoc({ ...doc, weeks: Number(e.target.value) || 1 })} /></label>
      </div>
      <div className="seg" role="tablist" aria-label="Días">
        {doc.days.map((d, i) => <button key={i} type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)}>{d.name || `Día ${i + 1}`}</button>)}
        {doc.days.length < 7 && <button type="button" onClick={() => { setDoc({ ...doc, days: [...doc.days, { name: `Día ${String.fromCharCode(65 + doc.days.length)}`, exercises: [] }] }); setDay(doc.days.length); }}>+ Día</button>}
      </div>
      <label className="field">Nombre del día<input value={cur.name} maxLength={60} onChange={(e) => setDoc({ ...doc, days: doc.days.map((x, j) => j === day ? { ...x, name: e.target.value } : x) })} /></label>
      <div className="exhead"><span className="c-name">Ejercicio</span><span className="c-s">Series</span><span className="c-r">Reps</span><span className="c-rir">RIR</span><span className="c-rest">Desc.</span><span className="c-act" /></div>
      {cur.exercises.map((e, i) => (
        <Fragment key={i}>
        <div className="exrow">
          <span className="c-name">{e.name}
            {featureOn("adaptive") && <button type="button" className="subs-btn" aria-expanded={subsFor === `${i}:${e.exerciseId}`} aria-label={`${subsLabel(subs.filter((x) => x.exerciseId === e.exerciseId).length)} de ${e.name}`}
              onClick={() => setSubsFor((v) => (v === `${i}:${e.exerciseId}` ? null : `${i}:${e.exerciseId}`))}>{subsLabel(subs.filter((x) => x.exerciseId === e.exerciseId).length)}</button>}</span>
          <span className="c-s"><input aria-label={`Series de ${e.name}`} inputMode="numeric" value={e.sets} onChange={(ev) => setEx(i, { sets: Math.max(1, Math.min(20, Number(ev.target.value) || 1)) })} /></span>
          <span className="c-r"><input aria-label={`Repeticiones de ${e.name}`} value={e.reps} maxLength={20} onChange={(ev) => setEx(i, { reps: ev.target.value })} /></span>
          <span className="c-rir"><input aria-label={`RIR de ${e.name}`} inputMode="numeric" value={e.rir ?? ""} onChange={(ev) => setEx(i, { rir: ev.target.value === "" ? null : Math.max(0, Math.min(5, Number(ev.target.value) || 0)) })} /></span>
          <span className="c-rest"><input aria-label={`Descanso de ${e.name}`} defaultValue={formatRest(e.restSec)} onBlur={(ev) => { const r = parseRest(ev.target.value); if (r != null) setEx(i, { restSec: r }); }} /></span>
          <span className="c-act"><button type="button" className="ibtn" aria-label={`Quitar ${e.name}`} onClick={() => removeEx(i)}>×</button></span>
        </div>
        {subsFor === `${i}:${e.exerciseId}` && <ApprovedSubs orgId={shell.orgId} ex={e} lib={lib.data ?? []} subs={subs} setSubs={setSubs} flash={shell.flash} />}
        </Fragment>
      ))}
      {!cur.exercises.length && <span className="muted">Agregá ejercicios desde la biblioteca.</span>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label className="search"><input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Buscar en la biblioteca" aria-label="Buscar ejercicio" /></label>
        <div className="pills">{filtered.map((e) => <button key={e.id} type="button" className="pill" onClick={() => addEx(e)}>+ {e.name}{e.own ? " · propio" : ""}</button>)}</div>
        <NewExercise url={`/api/gym/${shell.orgId}/library`} query={libQ} known={lib.data ?? []} flash={shell.flash}
          onCreated={(e) => { lib.setData((xs) => (xs ?? []).some((x) => x.id === e.id) ? xs : [...(xs ?? []), e]); addEx(e); setLibQ(""); }} />
      </div>
      <label className="field">Motivo del cambio (lo ve el equipo)
        <textarea className="note" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ej.: pasa de 3 a 4 días por pedido del socio" />
      </label>
      {mentionsHealth(reason) && <p className="gy-warn" role="note" style={{ margin: 0 }}>El motivo lo ve el equipo: evitá datos de salud.</p>}
      {related && (
        <label className="mrow" style={{ border: "1px solid #E2E8F0" }}>
          <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
          <span><b style={{ fontSize: 14 }}>Completar {related.ref} · {TASK_CATEGORY[related.category]}</b><small className="muted">Queda atribuida a vos.</small></span>
        </label>
      )}
      <div className="mfoot">
        <button type="button" className="btn" onClick={() => onClose(false)}>Cancelar</button>
        <button type="button" className="btn pri" aria-busy={busy === "save" || undefined} aria-disabled={reason.trim().length < 3} onClick={() => reason.trim().length >= 3 ? save() : shell.flash("Contá el motivo del cambio: lo ve el equipo.")}>Guardar revisión</button>
      </div>
    </Modal>
  );
}
