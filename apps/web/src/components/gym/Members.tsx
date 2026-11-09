"use client";
// Socios de la sede: lista y ficha institucional (REPI Desktop Gym.dc.html · sc.members, modal "edit").
// La ficha nunca muestra salud, nutrición, Mi cuerpo, la app del socio ni su relación con un coach privado (DEC-10/11).
import { SharedWishes, type SharedWishesView } from "@/components/coach/SharedWishes";
import { Fragment, useEffect, useMemo, useState } from "react";
import { TASK_CATEGORY, activityOf, circuitIssues, combineWithNext, combinedWithNext, copyDayContent, formatRest, groupLabels, isActivityProfile, separateFromGroup, isStraightPlan, mainSets, mentionsHealth, parseRest, pasteDay, prescriptionText, resizeBlocks, straightRow, syncCircuit, type ProgramDoc } from "@repi/domain";
import { api } from "@/lib/api";
import { NewExercise } from "@/components/coach/NewExercise";
import { ActivityFields, ActivityLast, ConvertToActivity, editorProfile, libMatches, rowDefaults, toActivityRow } from "@/components/coach/ActivityFields";
import { ExerciseDetailEditor, detailSummary } from "@/components/coach/ExerciseDetailEditor";
import { DayMenu, GymDayPaste, readClip, writeClip, type DayClip } from "@/components/coach/DayCopy";
import { NoteButton, NoteField } from "@/components/coach/ExerciseNote";
import { Modal } from "@/components/ui/Modal";
import { ApprovedSubs, subsLabel, subsRow, useSubsPanel, useSubstitutions } from "@/components/coach/ApprovedSubs";
import { LoadSuggestion, useLastTimes } from "@/components/coach/LoadSuggestion";
import { featureOn } from "@/lib/features";
import { NewTaskModal, TaskCard } from "./Floor";
import { Bars, Head, fmt, initials, useAct, useLoad, when, type GymScreen, type Shell, type Task } from "./shared";
import { Ic } from "@/components/ui/Ic";
import { ArrowLeft, Lock, MagnifyingGlass } from "@phosphor-icons/react";
import { IntInput } from "@/components/ui/IntInput";
import { ProgramAssistant, type BriefPrefill } from "@/components/coach/ProgramAssistant";
import { ProgramImportModal } from "@/components/coach/ProgramImportModal";
import { SessionLog, type LoggedSession } from "@/components/coach/SessionLog";
import { IntelSection } from "@/components/coach/CoachIntelligence";
import { RepiSignals } from "@/components/coach/RepiSignals";
import { ProposalBanner, clearTiDraft, readTiDraft, stashTiDraft, type TiDraft } from "@/components/coach/ProposalDraft";
import { Skel } from "@/components/motion/Skeleton";
import { MemberKioskCard } from "./Kiosk";

type Row = { id: string; name: string; since: string; lastSessionAt: string | null; visits30: number; program: { name: string; revision: number } | null; status: { label: string; tone: string } };
type Detail = {
  id: string; name: string; since: string; status: { label: string; tone: string }; trainingShared: boolean; lastSessionAt: string | null; visits30: number;
  weeks: { label: string; n: number }[];
  program: { programId: string; startsOn: string; revision: number; doc: ProgramDoc & { days: (ProgramDoc["days"][number] & { id?: string })[] }; revisions: { number: number; author: string; reason: string | null; at: string }[] } | null;
  tasks: Task[]; programTaskId: string | null; notes: { id: string; kind: "institutional" | "personal"; text: string; author: string; mine: boolean; at: string }[];
  canEdit: boolean; canWriteNotes: boolean; seesTraining: boolean; restricted: string[]; wishes?: SharedWishesView | null; programBrief?: BriefPrefill | null; log: (LoggedSession & { atKiosk?: boolean })[];
  community: { attempts: { challenge: string; value: string; status: string; newRecord: boolean; at: string }[]; achievements: number; level: number; visits30: number } | null;
};

export function MembersScreen({ shell }: { shell: Shell }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const [q, setQ] = useState("");
  const [qq, setQq] = useState("");
  useEffect(() => { const t = setTimeout(() => setQq(q), 250); return () => clearTimeout(t); }, [q]);
  const list = useLoad<{ location: { id: string; name: string }; awaiting: string[]; members: Row[] }>(`/api/gym/${shell.orgId}/members?loc=${loc}&q=${encodeURIComponent(qq)}`, { keep: true });
  // FSA1: al cambiar de sede, mientras llega la lista nueva no se abre sola la ficha de un socio de la sede anterior.
  const current = shell.sel ?? (list.data?.location.id === loc ? list.data.members[0]?.id : null) ?? null;
  return (
    <>
      <Head kicker={`${shell.ctx.org.name}${list.data ? ` · ${list.data.location.name}` : ""}`} title="Socios" />
      {list.err && <p role="alert" className="err-box">{list.err}</p>}
      <div className="split gy-members" data-sel={shell.sel ? "1" : "0"}>
        <div className="list-pane">
          <label className="search"><Ic i={MagnifyingGlass} size={16} color="var(--ui-muted)" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar socio" aria-label="Buscar socio" /></label>
          {/* QA 29/10 (DATA-10): la lista trae hasta 200; con más, se avisa y se busca por nombre. */}
          {(list.data?.members.length ?? 0) >= 200 && <span className="muted" role="status" style={{ padding: "8px 12px", fontSize: 13 }}>Se muestran los primeros 200 en orden alfabético. Buscá por nombre para encontrar al resto.</span>}
          {list.data?.members.map((m) => (
            <button key={m.id} type="button" className="crow" aria-current={m.id === current} onClick={() => { shell.setSel(m.id); window.scrollTo(0, 0); }}>
              <span className="av36">{initials(m.name)}</span>
              <span><b>{m.name}</b><small className="muted">{m.program ? m.program.name : "Sin programa"} · {m.visits30} {m.visits30 === 1 ? "sesión" : "sesiones"} en 30 días</small></span>
              <span className={`chip ${m.status.tone}`}>{m.status.label}</span>
            </button>
          ))}
          {list.data && !list.data.members.length && <span className="muted" style={{ padding: 20, textAlign: "center", fontSize: 14 }}>{qq ? "Sin resultados." : "Todavía no hay socios activos en REPI en esta sede."}</span>}
          {!!list.data?.awaiting.length && <span className="muted" style={{ padding: "8px 12px", fontSize: 13 }}>Aprobados, falta que confirmen en su app qué comparten: {list.data.awaiting.join(", ")}. Aparecen acá al confirmar.</span>}
        </div>
        <div className="detail-pane">
          <button type="button" className="btn sm gy-list-back" onClick={() => shell.setSel(null)}><Ic i={ArrowLeft} size={16} /> Todos los socios</button>
          {current ? <MemberDetail key={current} shell={shell} id={current} loc={loc!} onChanged={list.reload} /> : list.data && <div className="empty">Elegí un socio.</div>}</div>
      </div>
    </>
  );
}

/** Ficha de un socio como página propia: desde Sala, Mi turno o la lista en el teléfono (pedido del titular, 07/11/2026). */
export function MemberPage({ shell, back, name }: { shell: Shell; back: { to: GymScreen; label: string; go?: (to: GymScreen) => void } | null; name?: string | null }) {
  const loc = shell.loc ?? shell.ctx.locations[0]?.id;
  const id = shell.sel;
  return (
    <>
      <nav className="gy-back" aria-label="Volver">
        {back && <button type="button" className="btn sm" onClick={() => (back.go ?? shell.go)(back.to)}><Ic i={ArrowLeft} size={16} /> Volver a {back.label}</button>}
        <button type="button" className={back ? "btn sm gy-ghost" : "btn sm"} onClick={() => shell.go("members")}>{back ? "Todos los socios" : <><Ic i={ArrowLeft} size={16} /> Todos los socios</>}</button>
      </nav>
      {id && loc ? <MemberDetail key={id} shell={shell} id={id} loc={loc} onChanged={() => {}} page name={name} /> : <><Head title="Ficha del socio" /><div className="empty">Elegí un socio desde «Socios».</div></>}
    </>
  );
}

function MemberDetail({ shell, id, loc, onChanged, page = false, name }: { shell: Shell; id: string; loc: string; onChanged: () => void; page?: boolean; name?: string | null }) {
  const d = useLoad<Detail>(`/api/gym/${shell.orgId}/members/${id}`);
  const [noteKind, setNoteKind] = useState<"institutional" | "personal">("institutional");
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState(false);
  // Después de guardar, el editor espera la versión nueva: reabrirlo enseguida mostraba la anterior y se podía editar encima.
  const [refreshing, setRefreshing] = useState(false);
  const [task, setTask] = useState(false);
  const [intelTick, setIntelTick] = useState(0); // D210: Training Intelligence cargó o decidió → «Señales de REPI» relee
  const { busy, run } = useAct(shell.flash);
  // Como página, el nombre es el título (h1): GymApp le pasa el foco al navegar.
  const head = (title: string) => page && <Head kicker={`${shell.ctx.org.name} · Ficha del socio`} title={title} />;
  // El nombre llega desde el botón que abrió la ficha: el título existe desde el primer cuadro y no cambia al cargar.
  if (d.err && !d.data) return <>{head(name ?? "Ficha del socio")}<p role="alert" className="err-box">{d.err}</p></>;
  if (!d.data) return <>{head(name ?? "Ficha del socio")}<MemberSkeleton /></>;
  const m = d.data;
  const notes = m.notes.filter((n) => n.kind === noteKind);
  const saveNote = () => run("note", () => api(`/api/gym/${shell.orgId}/members/${id}/notes`, { body: { kind: noteKind, text: draft } }),
    noteKind === "institutional" ? "Nota institucional guardada. El equipo de la sede puede verla." : "Nota personal guardada. Sólo vos la ves.").then((r) => { if (r) { setDraft(""); d.reload(); } });
  const write = () => run("chat", async () => { const r = await api<{ id: string }>(`/api/gym/${shell.orgId}/members/${id}/conversation`, { body: {} }); shell.go("msgs", { sel: r.id }); });
  const floor = shell.ctx.caps.includes("floor.work");
  return (
    <>
      {head(m.name)}
      <section className="card who" style={{ flexDirection: "row" }}>
        <span className="av56">{initials(m.name)}</span>
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4 }}>
          {!page && <span style={{ fontSize: 22, fontWeight: 600 }}>{m.name}</span>}
          <span className="muted" style={{ fontSize: 13 }}>Socio en REPI desde {fmt(m.since, { month: "short", year: "numeric" })} · última sesión {m.lastSessionAt ? when(m.lastSessionAt) : "—"} · {m.visits30} en 30 días</span>
        </div>
        <span className={`chip ${m.status.tone}`}>{m.status.label}</span>
        <div className="co-actions">
          {floor && <button type="button" className="btn" onClick={() => setTask(true)}>Nueva tarea</button>}
          {floor && <button type="button" className="btn" aria-busy={busy === "chat" || undefined} onClick={write}>Escribir</button>}
          {m.canEdit && <button type="button" className="btn pri" disabled={refreshing} aria-busy={refreshing || undefined} onClick={() => setEdit(true)}>{m.program ? "Editar programa" : "Crear programa"}</button>}
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
                  {/* Ejercicios por tiempo: una actividad se lee «10 min · 5 km/h · incl. 3» (sin series, RIR ni descanso). */}
                  {day.exercises.map((e, j) => <div key={j} className="trow" style={{ padding: "6px 4px" }}><span style={{ flex: 1 }}>{e.name}</span><span className="muted">{prescriptionText(e, { rir: true })}{activityOf(e.detail) && e.sets <= 1 ? "" : ` · ${formatRest(e.restSec)}`}</span></div>)}
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
      <section className="card">
        <h2>Entrenamientos registrados</h2>
        {!m.trainingShared ? <span className="muted" style={{ fontSize: 14 }}>El socio no comparte sus entrenamientos con el gym: no se ven sus series.</span>
          : !m.seesTraining ? <span className="muted" style={{ fontSize: 14 }}>Las series y sus notas las ve el equipo de entrenamiento de la sede. La gestión ve la asistencia.</span>
          : !m.log.length ? <span className="muted" style={{ fontSize: 14 }}>Todavía no registró entrenamientos.</span>
          : <SessionLog sessions={m.log} extra={(s) => (s.atKiosk ? <span className="chip mute" title="Registrado por el socio en la pantalla de rutinas del gimnasio">Pantalla del gimnasio</span> : null)} />}
      </section>
      {/* D210: señales de REPI para quien programa en la sede (program.edit + consentimiento; el servidor lo vuelve a exigir). Dueño,
          gerencia y recepción reciben 403 y no ven nada: ni la sección ni pistas de lo que habría. */}
      {m.trainingShared && m.canEdit && <RepiSignals kind="gym" relId={m.id} programId={m.program?.programId ?? null} quietDenied load={`/api/gym/${shell.orgId}/members/${m.id}/brain`}
        decideUrl={(pid) => `/api/gym/${shell.orgId}/intel-proposals/${pid}`} onReview={(t) => { stashTiDraft(t); setEdit(true); }} refresh={intelTick} />}
      {/* D191: quien arma su programa en la sede y sólo si el socio compartió su entrenamiento (el servidor lo vuelve a exigir). */}
      {m.trainingShared && m.canEdit && <IntelSection kind="gym" relId={m.id} who="en esta sede" load={`/api/gym/${shell.orgId}/members/${m.id}/intelligence`}
        decideUrl={(pid) => `/api/gym/${shell.orgId}/intel-proposals/${pid}`} onReview={(t) => { stashTiDraft(t); setEdit(true); }} onLoaded={() => setIntelTick((n) => n + 1)} />}
      <SharedWishes w={m.wishes} who={m.name.split(" ")[0]} />
      {m.community && (
        <section className="card">
          <h2>Comunidad del gym</h2>
          <span className="muted">Nivel {m.community.level} · {m.community.achievements} logros del gym · {m.community.visits30} ingresos por recepción en 30 días</span>
          {m.community.attempts.map((a, i) => <div key={i} className="trow"><span style={{ flex: 1 }}>{a.challenge} · <b>{a.value}</b>{a.newRecord ? " · récord" : ""}</span><span className={`chip ${a.status === "approved" ? "ok" : "warn"}`}>{a.status === "approved" ? "Validado" : "Pendiente"}</span><span className="muted">{fmt(a.at)}</span></div>)}
          {!m.community.attempts.length && <span className="muted">Sin intentos en desafíos.</span>}
        </section>
      )}
      {/* REPI Control (D213): código y PIN para la pantalla de rutinas (dueño, gerencia y recepción, si REPI la habilitó). */}
      {shell.ctx.kiosk && shell.ctx.caps.includes("reception.desk") && <MemberKioskCard shell={shell} memberId={m.id} name={m.name} />}
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
        {!notes.length && <span className="muted" style={{ fontSize: 14 }}>{m.seesTraining ? "Sin notas." : "Las notas del equipo de entrenamiento no se muestran a la gestión."}</span>}
      </section>
      <section className="card lock" style={{ flexDirection: "row" }}>
        <Ic i={Lock} size={22} color="var(--ui-muted)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2>Datos restringidos</h2>
          <span className="muted" style={{ fontSize: 14 }}>{m.restricted.join(" · ")}. El gym no los ve: son del socio y de las relaciones que él autorice.</span>
        </div>
      </section>
      {edit && <EditProgramModal shell={shell} member={m} onClose={(ok) => { setEdit(false); if (ok) { setRefreshing(true); void d.reload().finally(() => setRefreshing(false)); onChanged(); shell.refreshBadges(); } }} />}
      {task && <NewTaskModal shell={shell} loc={loc} gymMemberId={m.id} memberName={m.name} onClose={(ok) => { setTask(false); if (ok) d.reload(); }} />}
    </>
  );
}

/**
 * El mismo editor del programa, abierto desde una solicitud de Sala (Connect) sin pasar por Socios.
 * Con `taskId`, la ficha marca esa solicitud para completarla al guardar si se cierra con el programa (el servidor lo vuelve a validar).
 */
export function MemberProgramModal({ shell, memberId, taskId, onClose }: { shell: Shell; memberId: string; taskId?: string | null; onClose: (ok: boolean) => void }) {
  const d = useLoad<Detail>(`/api/gym/${shell.orgId}/members/${memberId}${taskId ? `?task=${encodeURIComponent(taskId)}` : ""}`);
  if (d.data?.canEdit) return <EditProgramModal shell={shell} member={d.data} onClose={onClose} />;
  return (
    <Modal label="Programa del socio" onClose={() => onClose(false)}>
      <div className="mhead"><h2>Programa del socio</h2><button type="button" className="x" aria-label="Cerrar" onClick={() => onClose(false)}>×</button></div>
      {d.err ? <p role="alert" className="err-box">{d.err}</p> : d.data ? <p className="muted">No tenés permiso para armar programas en esta sede.</p> : <p className="muted">Cargando ficha…</p>}
    </Modal>
  );
}

type Lib = { id: string; name: string; group: string; kind: string; own?: boolean; profile?: string | null }[];
type Ex = ProgramDoc["days"][number]["exercises"][number];

function EditProgramModal({ shell, member, onClose }: { shell: Shell; member: Detail; onClose: (ok: boolean) => void }) {
  const lib = useLoad<Lib>(`/api/gym/${shell.orgId}/library`);
  const { subs, setSubs } = useSubstitutions(shell.orgId);
  const [detailFor, setDetailFor] = useState<number | null>(null); // D134: ejercicio con el editor de series abierto
  const base: ProgramDoc = member.program
    ? { name: member.program.doc.name, weeks: member.program.doc.weeks, note: member.program.doc.note, days: member.program.doc.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets, reps: e.reps, rir: e.rir ?? null, restSec: e.restSec, note: e.note ?? null, ...(e.detail ? { detail: e.detail } : {}) })) })) }
    : { name: "Programa inicial", weeks: 6, note: "", days: [{ name: "Día A", exercises: [] }] };
  // Borrador local (como D177 en el constructor del coach): cerrar el editor sin querer (Escape, tocar afuera, ×) no pierde lo
  // armado. Vale para la misma revisión; si otro guardó una revisión nueva, el borrador viejo se descarta.
  const draftKey = `repi:gym-program-draft:${shell.orgId}:${member.id}`;
  const rev = member.program?.revision ?? 0;
  const [restored] = useState(() => readGymDraft(draftKey, rev, base));
  const [doc, setDoc] = useState<ProgramDoc>(restored?.doc ?? base);
  const [recovered, setRecovered] = useState(!!restored);
  const dirty = JSON.stringify(doc) !== JSON.stringify(base);
  const [day, setDay] = useState(0);
  // D201 (Urko): el panel de reemplazos es de este socio y este día; cambiar de socio o de día lo cierra.
  const subsPanel = useSubsPanel(`${shell.orgId}|${member.id}|${day}`);
  // D154: lo que el socio hizo la última vez con el gym en cada ejercicio, para la carga sugerida.
  const lastTimes = useLastTimes(`/api/gym/${shell.orgId}/members/${member.id}/last`, doc.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const [reason, setReason] = useState(restored?.reason ?? "");
  useEffect(() => { if (dirty) writeGymDraft(draftKey, rev, doc, reason); }, [dirty, doc, reason, draftKey, rev]);
  const discard = () => { clearGymDraft(draftKey); setDoc(base); setReason(""); setDay(0); setRecovered(false); };
  // «Cancelar» descarta (con confirmación si hay cambios); cerrar con ×, Escape o tocando afuera deja el borrador guardado.
  const leave = () => { if (dirty) shell.flash("Tus cambios quedaron en este navegador: al abrir el editor de nuevo los recuperás."); onClose(false); };
  const cancel = () => { if (dirty && !window.confirm("¿Descartar los cambios sin guardar?")) return; clearGymDraft(draftKey); onClose(false); };
  const [importing, setImporting] = useState(false); // SI2
  const [libQ, setLibQ] = useState("");
  // La tarea que se cierra al guardar la elige el servidor (libre o tomada por quien guarda): la misma regla que valida.
  const related = member.tasks.find((t) => t.id === member.programTaskId);
  const [complete, setComplete] = useState(!!related);
  const { busy, run } = useAct(shell.flash);
  const [noteOpen, setNoteOpen] = useState<string | null>(null); // D174: «día:posición» del ejercicio con la nota recién abierta
  // D191: propuesta de Training Intelligence traída desde la ficha. Sólo cambia este borrador si se aplica; se guarda como siempre.
  const [tiDraft, setTiDraft] = useState<TiDraft | null>(() => readTiDraft({ kind: "gym", relId: member.id }));
  const [tiApplied, setTiApplied] = useState<string | null>(null);
  const setEx = (i: number, patch: Partial<Ex>) => setDoc((d) => ({ ...d, days: d.days.map((x, j) => j === day ? { ...x, exercises: x.exercises.map((e, k) => k === i ? { ...e, ...patch } : e) } : x) }));
  const removeEx = (i: number) => setDoc((d) => ({ ...d, days: d.days.map((x, j) => j === day ? { ...x, exercises: x.exercises.filter((_, k) => k !== i) } : x) }));
  // Ejercicios por tiempo: cada ejercicio entra con los valores de su perfil. Antes todo entraba como 3 × 10-12 con RIR 2 y una
  // cinta quedaba como musculación; ahora es 10 min a 5 km/h, inclinación 0, sin series ni RIR (la musculación sigue en 10-12).
  const addEx = (e: Lib[number]) => setDoc((d) => ({ ...d, days: d.days.map((x, j) => j === day ? { ...x, exercises: [...x.exercises, { exerciseId: e.id, name: e.name, ...rowDefaults(editorProfile({ name: e.name }, e), "10-12"), note: null }] } : x) }));
  const filtered = useMemo(() => (lib.data ?? []).filter((e) => libMatches(e, libQ)).slice(0, 24), [lib.data, libQ]);
  const libById = useMemo(() => new Map((lib.data ?? []).map((e) => [e.id, e])), [lib.data]);
  const save = async () => {
    const r = await run("save", () => api<{ revision: number; completed: { ref: string; invite: string | null } | null }>(`/api/gym/${shell.orgId}/members/${member.id}/program`, { body: { doc, reason, completeTaskId: complete && related ? related.id : null } }),
      (x) => { const y = x as { revision: number; completed: { ref: string; invite: string | null } | null }; return y.completed ? `Programa guardado (revisión ${y.revision}) y ${y.completed.ref} completada.${y.completed.invite === "pending" ? ` ${member.name.split(" ")[0]} recibirá una invitación opcional para opinar.` : ""}` : `Programa guardado. Revisión ${y.revision} registrada para el equipo.`; });
    if (r) {
      if (tiApplied) api(`/api/gym/${shell.orgId}/intel-proposals/${tiApplied}`, { body: { status: "accepted", note: "Aplicada desde el editor del programa" } }).catch(() => {});
      clearTiDraft(); clearGymDraft(draftKey); onClose(true);
    }
  };
  const cur = doc.days[day] ?? doc.days[0];
  const labels = groupLabels(cur.exercises);
  const issues = circuitIssues(cur.exercises);
  const moveUp = (i: number) => setDayExercises(cur.exercises.map((e, k) => (k === i - 1 ? cur.exercises[i] : k === i ? cur.exercises[i - 1] : e)));
  const removeDay = () => {
    if (cur.exercises.length && !window.confirm(`¿Quitar «${cur.name || `Día ${day + 1}`}» con sus ${cur.exercises.length} ejercicios?`)) return;
    setDoc({ ...doc, days: doc.days.filter((_, j) => j !== day) }); setDay(Math.max(0, day - 1));
    // El botón desaparece con el último día extra: el foco va a la pestaña del día (si no, sale del editor y Escape no responde).
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.modal [role="tab"][aria-selected="true"]')?.focus());
  };
  // Combinar desde la fila (pedido de un entrenador de sala): superserie con el de abajo, o sumarlo a su grupo; «Separar» lo saca.
  const setDayExercises = (exs: Ex[]) => setDoc((d) => ({ ...d, days: d.days.map((x, j) => (j === day ? { ...x, exercises: exs } : x)) }));
  const combine = (i: number) => {
    const next = combineWithNext(cur.exercises, i);
    if (!next) return shell.flash("Este día ya tiene 8 grupos combinados: separá alguno para combinar otro.");
    const sync = syncCircuit(next, i);
    const ok = !sync.removed.length || window.confirm(`El circuito tiene ${sync.rounds} vueltas: se quitan series de ${sync.removed.map((r) => `${r.exercise} (${r.blocks})`).join(", ")}. ¿Seguir?`);
    setDayExercises(ok ? sync.exs : next);
  };
  // D192: copiar y pegar días. El portapapeles es una referencia (socio y día) en esta pestaña; el contenido lo arma el servidor
  // con lo guardado y vuelve a este borrador, que se guarda con motivo como cualquier revisión.
  const [clip, setClip] = useState<DayClip | null>(() => readClip("gym", shell.orgId));
  const [pasting, setPasting] = useState(false);
  const dupDay = () => {
    if (doc.days.length >= 7) return shell.flash("El programa ya tiene 7 días.");
    const c = copyDayContent(cur, { weights: "keep", notes: true }).day;
    setDoc({ ...doc, days: [...doc.days.slice(0, day + 1), { name: `${cur.name || `Día ${day + 1}`} (copia)`.slice(0, 60), exercises: c.exercises }, ...doc.days.slice(day + 1)] });
    setDay(day + 1);
  };
  const copyDay = () => {
    if (!member.program) return shell.flash("Guardá el programa antes de copiar un día.");
    const saved = member.program.doc.days[day];
    const differs = !saved || JSON.stringify(base.days[day]) !== JSON.stringify(doc.days[day]);
    writeClip({ kind: "gym", orgId: shell.orgId, memberId: member.id, day, dayName: saved?.name ?? cur.name, from: `${member.name.split(" ")[0]} · ${saved?.name ?? cur.name}` });
    setClip(readClip("gym", shell.orgId));
    shell.flash(differs ? "Día copiado tal como está guardado (los cambios sin guardar de este día no se copian). Abrí el programa de otro socio y elegí «Pegar día»." : "Día copiado. Abrí el programa de otro socio y elegí «Día ▾ → Pegar día».");
  };
  return (
    <Modal label={`Editar programa · ${member.name}`} onClose={leave} wide>
      <div className="mhead"><h2>{member.program ? "Editar" : "Crear"} programa · {member.name}</h2><button type="button" className="x" aria-label="Cerrar" onClick={leave}>×</button></div>
      {recovered && dirty && (
        <p className="gy-incoming" role="status" style={{ margin: 0 }}>
          <span style={{ flex: 1 }}>Recuperamos cambios que no se habían guardado. Revisalos y tocá «Guardar revisión».</span>
          <button type="button" className="btn sm" onClick={discard}>Descartar cambios</button>
        </p>
      )}
      <ProgramAssistant url={`/api/gym/${shell.orgId}/members/${member.id}/program-draft`} wishes={member.wishes} brief={member.programBrief} hasContent={doc.days.some((d) => d.exercises.length > 0)} library={lib.data ?? []}
        onUse={(d) => { setDoc(d); setDay(0); if (reason.trim().length < 3) setReason("Programa armado con la propuesta de REPI"); }} />
      {/* SI2: un programa que ya existe (foto, PDF, planilla o texto) entra a este borrador; se guarda con «Guardar revisión». */}
      <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setImporting(true)}>Importar programa</button>
      {importing && <ProgramImportModal title={`Importar programa · ${member.name}`} scope={`gym:${shell.orgId}:${member.id}`} previewUrl={`/api/gym/${shell.orgId}/programs/import`}
        createUrl={`/api/gym/${shell.orgId}/library`} library={lib.data ?? []} flash={shell.flash} useLabel="Usar en el borrador" defaultName={doc.name} onClose={() => setImporting(false)}
        onUse={(u) => {
          if (doc.days.some((d) => d.exercises.length > 0) && !window.confirm("¿Reemplazar lo que hay en el editor por el programa importado? No se guarda hasta que toques «Guardar revisión», y las versiones anteriores quedan en el historial.")) return false;
          setDoc({ ...u.doc, weeks: doc.weeks, note: doc.note }); setDay(0);
          if (reason.trim().length < 3) setReason("Programa importado de un archivo");
          setImporting(false);
          shell.flash("Programa importado al borrador. Revisalo y tocá «Guardar revisión» para guardarlo.");
        }} />}
      {tiDraft && <ProposalBanner draft={tiDraft} days={doc.days} onDismiss={() => { clearTiDraft(); setTiDraft(null); }}
        onApply={(ps) => {
          setDoc((d) => ({ ...d, days: d.days.map((x, di) => ({ ...x, exercises: x.exercises.map((e, i) => { const p = ps.find((q) => q.day === di && q.index === i); return p ? { ...e, detail: p.detail } : e; }) })) }));
          setDay(ps[0].day); setTiApplied(tiDraft.proposalId); setTiDraft(null);
          if (reason.trim().length < 3) setReason(`Training Intelligence: ${tiDraft.name}`.slice(0, 300));
          shell.flash("Propuesta aplicada al borrador. Se guarda recién al tocar «Guardar revisión».");
        }} />}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="field" style={{ flex: "2 1 240px" }}>Nombre<input value={doc.name} maxLength={120} onChange={(e) => setDoc({ ...doc, name: e.target.value })} /></label>
        <label className="field" style={{ flex: "0 0 110px" }}>Semanas<IntInput min={1} max={52} value={doc.weeks} onChange={(n) => n != null && setDoc({ ...doc, weeks: n })} /></label>
      </div>
      <div className="seg">
        <div role="tablist" aria-label="Días" style={{ display: "contents" }}>
          {doc.days.map((d, i) => <button key={i} type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)}>{d.name || `Día ${i + 1}`}</button>)}
        </div>
        {doc.days.length < 7 && <button type="button" aria-label="Agregar día" onClick={() => { setDoc({ ...doc, days: [...doc.days, { name: `Día ${String.fromCharCode(65 + doc.days.length)}`, exercises: [] }] }); setDay(doc.days.length); }}>+ Día</button>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <DayMenu dayName={cur.name} clip={clip && clip.memberId ? clip : null} onDuplicate={dupDay} onCopy={copyDay} onPaste={() => setPasting(true)} />
        {doc.days.length > 1 && <button type="button" className="btn danger" onClick={removeDay}>Quitar día</button>}
      </div>
      {pasting && clip?.memberId && <GymDayPaste orgId={shell.orgId} clip={clip} memberId={member.id} days={doc.days} currentDay={day} onCancel={() => setPasting(false)}
        onApply={(content, mode, target) => {
          const r = pasteDay(doc.days, content, mode, target, 7);
          if (!r.ok) return shell.flash(r.error);
          setDoc({ ...doc, days: r.days }); setDay(r.day); setPasting(false);
          if (reason.trim().length < 3) setReason(`Día copiado: ${clip.dayName}`.slice(0, 300));
          shell.flash("Pegado en el borrador. Se guarda recién al tocar «Guardar revisión».");
        }} />}
      <label className="field">Nombre del día<input value={cur.name} maxLength={60} onChange={(e) => setDoc({ ...doc, days: doc.days.map((x, j) => j === day ? { ...x, name: e.target.value } : x) })} /></label>
      <div className="exhead"><span className="c-name">Ejercicio</span><span className="c-s">Series</span><span className="c-r">Reps</span><span className="c-rir">RIR</span><span className="c-rest">Desc.</span><span className="c-act" /></div>
      {cur.exercises.map((e, i) => {
        // Ejercicios por tiempo: una actividad (cinta, bici, remo…) muestra sólo la duración y sus campos, sin series, RIR ni
        // técnica; una escrita como texto en una revisión anterior sigue como estaba y ofrece «Configurar por duración».
        const act = activityOf(e.detail);
        const prof = editorProfile(e, libById.get(e.exerciseId));
        const convert = !act && isActivityProfile(prof) ? prof : null;
        return (
        <Fragment key={i}>
        <div className={act ? "exrow is-activity" : "exrow"}>
          <span className="c-name"><code>{labels[i] ?? String(i + 1).padStart(2, "0")}</code>{e.name}
            {!act && <button type="button" className="ex-edit" onClick={() => setDetailFor(i)} aria-label={`Series y técnica de ${e.name}`}>Series y técnica</button>}
            {i < cur.exercises.length - 1 && !combinedWithNext(cur.exercises, i) && <button type="button" className="subs-btn" onClick={() => combine(i)} aria-label={`Combinar ${e.name} con ${cur.exercises[i + 1].name}`}>Combinar con el siguiente</button>}
            {e.detail?.group && <button type="button" className="subs-btn" onClick={() => setDayExercises(separateFromGroup(cur.exercises, i))} aria-label={`Separar ${e.name} de su grupo`}>Separar</button>}
            {featureOn("adaptive") && <button type="button" className="subs-btn" aria-expanded={subsPanel.isOpen(subsRow(i, e.exerciseId))} aria-label={`${subsLabel(subs.filter((x) => x.exerciseId === e.exerciseId).length)} de ${e.name}`}
              onClick={() => subsPanel.toggle(subsRow(i, e.exerciseId))}>{subsLabel(subs.filter((x) => x.exerciseId === e.exerciseId).length)}</button>}
            {!e.note && noteOpen !== `${day}:${i}` && <NoteButton name={e.name} onOpen={() => setNoteOpen(`${day}:${i}`)} />}</span>
          {detailSummary(e, labels[i]) && <span className="ex-sum">{detailSummary(e, labels[i])}</span>}
          {act ? <ActivityFields e={e} profile={act.profile} onChange={(p) => setEx(i, p)} /> : <>
          <span className="c-s"><small className="c-lbl">Series</small><IntInput disabled={!!e.detail?.setPlan && !isStraightPlan(e.detail)} aria-label={`Series de ${e.name}`} min={1} max={20} value={!!e.detail?.setPlan && !isStraightPlan(e.detail) ? mainSets(e.detail, e.sets) : e.sets} onChange={(n) => n != null && setEx(i, straightRow(e.detail, { sets: n }))} /></span>
          <span className="c-r"><small className="c-lbl">Reps</small><input aria-label={`Repeticiones de ${e.name}`} value={e.reps} maxLength={20} onChange={(ev) => setEx(i, straightRow(e.detail, { reps: ev.target.value }))} /></span>
          <span className="c-rir"><small className="c-lbl">RIR</small><IntInput aria-label={`RIR de ${e.name}`} min={0} max={5} nullable value={e.rir} onChange={(n) => setEx(i, straightRow(e.detail, { rir: n }))} /></span>
          <span className="c-rest"><small className="c-lbl">Descanso</small><input aria-label={`Descanso de ${e.name}`} defaultValue={formatRest(e.restSec)} onBlur={(ev) => { const r = parseRest(ev.target.value); if (r != null) setEx(i, { restSec: r }); }} /></span>
          </>}
          <span className="c-act">
            <button type="button" className="ibtn" aria-label={`Subir ${e.name}`} disabled={i === 0} onClick={() => moveUp(i)}>↑</button>
            <button type="button" className="ibtn" aria-label={`Quitar ${e.name}`} onClick={() => removeEx(i)}>×</button>
          </span>
          {convert && <ConvertToActivity name={e.name} reps={e.reps} profile={convert} onConvert={() => setEx(i, toActivityRow(e, convert))} />}
          {(!!e.note || noteOpen === `${day}:${i}`) && <NoteField name={e.name} value={e.note ?? ""} who="el socio" onChange={(v) => setEx(i, { note: v })} onEmpty={() => setNoteOpen(null)} />}
        </div>
        {act ? <ActivityLast last={lastTimes[e.exerciseId]} /> : <LoadSuggestion e={e} last={lastTimes[e.exerciseId]} profile={prof} onApply={(detail) => setEx(i, { detail })} />}
        {subsPanel.isOpen(subsRow(i, e.exerciseId)) && <ApprovedSubs orgId={shell.orgId} ex={e} lib={lib.data ?? []} subs={subs} setSubs={setSubs} flash={shell.flash} onAdded={subsPanel.close} />}
        </Fragment>
        );
      })}
      {!cur.exercises.length && <span className="muted">Agregá ejercicios desde la biblioteca: un día sin ejercicios no le aparece al socio para empezar.</span>}
      {issues.length > 0 && (
        <div className="err-box" role="alert">
          Circuito {issues[0].group}: {issues[0].rounds} vueltas, pero {issues.map((x) => `${x.exercise} tiene ${x.blocks} ${x.blocks === 1 ? "serie" : "series"}`).join(" y ")}. Las vueltas tienen que coincidir para guardar.
          <button type="button" className="btn sm" style={{ marginLeft: 8 }} onClick={() => setDayExercises(cur.exercises.map((y) => {
            const bad = issues.find((k) => k.exercise === y.name && y.detail?.group === k.group);
            return bad ? { ...y, ...resizeBlocks(y, bad.rounds) } : y;
          }))}>Igualar a {issues[0].rounds} vueltas</button>
        </div>
      )}
      {detailFor != null && cur.exercises[detailFor] && !activityOf(cur.exercises[detailFor].detail) && <ExerciseDetailEditor e={cur.exercises[detailFor]} types={{ kind: "gym", orgId: shell.orgId }} onClose={() => setDetailFor(null)}
        onSave={(p) => {
          // D183: en un circuito con vueltas, todos sus ejercicios quedan con una serie por vuelta (quitar series se confirma).
          const exs = cur.exercises.map((y, k) => (k === detailFor ? { ...y, detail: p.detail, sets: p.sets } : y));
          const sync = syncCircuit(exs, detailFor);
          const ok = !sync.removed.length || window.confirm(`El circuito tiene ${sync.rounds} vueltas: se quitan series de ${sync.removed.map((r) => `${r.exercise} (${r.blocks})`).join(", ")}. ¿Seguir?`);
          setDoc((d) => ({ ...d, days: d.days.map((x, j) => (j === day ? { ...x, exercises: ok ? sync.exs : exs } : x)) }));
          setDetailFor(null);
        }} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <b style={{ fontSize: 14 }}>Agregar ejercicios</b>
        <label className="search"><input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Buscar en la biblioteca" aria-label="Buscar ejercicio" /></label>
        <div className="pills">{filtered.map((e) => <button key={e.id} type="button" className="pill" onClick={() => addEx(e)}>+ {e.name}{e.own ? " · propio" : ""}</button>)}</div>
        <NewExercise url={`/api/gym/${shell.orgId}/library`} query={libQ} known={lib.data ?? []} flash={shell.flash}
          onCreated={(e) => { lib.setData((xs) => (xs ?? []).some((x) => x.id === e.id) ? xs : [...(xs ?? []), e]); addEx(e); setLibQ(""); }} />
      </div>
      <label className="field">Indicación para el socio (la ve en su app)
        <textarea className="note" rows={2} value={doc.note ?? ""} maxLength={1000} onChange={(e) => setDoc({ ...doc, note: e.target.value })} placeholder="Ej.: entrá en calor 10 minutos antes de empezar" />
      </label>
      <label className="field">Motivo del cambio (lo ve el equipo)
        <textarea className="note" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ej.: pasa de 3 a 4 días por pedido del socio" />
      </label>
      {mentionsHealth(reason) && <p className="gy-warn" role="note" style={{ margin: 0 }}>El motivo lo ve el equipo: evitá datos de salud.</p>}
      {related && (
        <label className="mrow" style={{ border: "1px solid var(--ui-border)" }}>
          <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
          <span><b style={{ fontSize: 14 }}>Completar {related.ref} · {TASK_CATEGORY[related.category]}</b><small className="muted">Queda atribuida a vos.</small></span>
        </label>
      )}
      <div className="mfoot">
        <button type="button" className="btn" onClick={cancel}>Cancelar</button>
        <button type="button" className="btn pri" aria-busy={busy === "save" || undefined} aria-disabled={reason.trim().length < 3} onClick={() => reason.trim().length >= 3 ? save() : shell.flash("Contá el motivo del cambio: lo ve el equipo.")}>Guardar revisión</button>
      </div>
    </Modal>
  );
}

/** M06: ficha en esqueleto con su forma (encabezado y tarjetas), en lugar de «Cargando ficha…». */
function MemberSkeleton() {
  return (
    <>
      <span role="status" className="sr-only">Cargando la ficha</span>
      <section className="card who" aria-hidden="true" style={{ flexDirection: "row" }}><Skel w={56} h={56} r={28} /><div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 8 }}><Skel w="40%" h={18} /><Skel w="75%" h={12} /></div></section>
      {[180, 140, 220].map((h, i) => <section key={i} className="card" aria-hidden="true" style={{ minHeight: h, gap: 10 }}><Skel w="35%" h={16} /><Skel h={12} /><Skel w="80%" h={12} /></section>)}
    </>
  );
}

// Borrador local del editor de sala: por socio y revisión de partida. Sin almacenamiento disponible, el editor funciona igual.
type GymDraft = { rev: number; doc: ProgramDoc; reason: string; at: number };
function readGymDraft(key: string, rev: number, base: ProgramDoc): GymDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null") as GymDraft | null;
    if (!d || d.rev !== rev || !d.doc?.days?.length) { if (d) localStorage.removeItem(key); return null; }
    return JSON.stringify(d.doc) === JSON.stringify(base) ? null : d;
  } catch { return null; }
}
function writeGymDraft(key: string, rev: number, doc: ProgramDoc, reason: string) { try { localStorage.setItem(key, JSON.stringify({ rev, doc, reason, at: Date.now() })); } catch { /* sin almacenamiento */ } }
function clearGymDraft(key: string) { try { localStorage.removeItem(key); } catch { /* nada que borrar */ } }
