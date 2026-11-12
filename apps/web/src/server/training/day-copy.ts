// D192 · Copiar un día completo entre programas (pedido de Urko). El cliente nunca manda el contenido a copiar: manda de qué
// programa y día copiar, y el servidor vuelve a leer el origen con los permisos de quien copia, arma la copia (identidades
// nuevas, sin resultados ni datos de Training Intelligence) y, para el coach, la guarda por el mismo camino que el
// autoguardado (versión nueva si la vigente está congelada). En el gimnasio la copia vuelve al borrador del programa del
// socio y se guarda como cualquier revisión (con motivo).
//
// Seguridad: todo queda dentro de una organización (los ids de otra no se encuentran: 404). Coach: dueño activo de su
// organización; programas no archivados; un programa de cliente sólo si la relación sigue vigente. Gimnasio: `program.edit`
// en la sede de cada socio. Ningún log ni auditoría guarda nombres de personas: sólo ids y cantidades.
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { copyDayContent, daySummary, docFingerprint, pasteDay, validateProgramDoc, type CopyOptions, type DayDoc, type PasteMode, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";
import { visibleIn } from "./library";
import { loadProgram, plain, readVersion, requireCoach, writeProgramDoc } from "./services";
import { gymContext, inScope, need } from "../gym/services";

const { program, programVersion, programAssignment, coachClient, user, exercise, auditEvent, gymMember } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);

export type CopyChoice = { weights: CopyOptions["weights"]; notes: boolean; skipUnavailable?: boolean };
export type PasteTarget = { programId: string; mode: PasteMode; day: number | null };
export type CopyRef = { programId: string; day: number };

// ── Coach ───────────────────────────────────────────────────────────────────
/** Programa del coach con su relación vigente (si es de un cliente). Una relación terminada no se lee ni se escribe. */
async function coachProgram(orgId: string, programId: string, tx: Tx | typeof db = db) {
  const p = await loadProgram(orgId, programId, tx);
  if (p.kind !== "template" && p.kind !== "client_copy") throw NOT_FOUND();
  let client: { id: string; name: string } | null = null;
  if (p.kind === "client_copy") {
    if (!p.coachClientId) throw NOT_FOUND();
    const [r] = await tx.select({ id: coachClient.id, name: user.name }).from(coachClient).innerJoin(user, eq(user.id, coachClient.userId))
      .where(and(eq(coachClient.id, p.coachClientId), eq(coachClient.coachOrgId, orgId), ne(coachClient.status, "ended")));
    if (!r) throw NOT_FOUND();
    client = r;
  }
  return { p, client };
}
const labelOf = (x: { p: { kind: string }; client: { name: string } | null }, name: string) => (x.client ? `${x.client.name} · ${name}` : `Plantilla · ${name}`);

/** A dónde puede pegar el coach: sus plantillas y el programa vigente de cada cliente con la relación activa o en pausa. */
export async function coachPasteTargets(actorId: string, orgId: string) {
  await requireCoach(actorId, orgId);
  const templates = await db.select({ id: program.id, kind: program.kind, versionId: program.currentVersionId }).from(program)
    .where(and(eq(program.orgId, orgId), eq(program.kind, "template"), isNull(program.archivedAt)));
  const clients = await db.select({ id: program.id, kind: program.kind, versionId: program.currentVersionId, client: user.name }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId)).innerJoin(coachClient, eq(coachClient.id, programAssignment.coachClientId)).innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(program.orgId, orgId), eq(programAssignment.status, "active"), eq(program.kind, "client_copy"), isNull(program.archivedAt), eq(coachClient.coachOrgId, orgId), ne(coachClient.status, "ended")));
  const out = [];
  for (const r of [...clients.map((c) => ({ ...c })), ...templates.map((t) => ({ ...t, client: null as string | null }))]) {
    if (!r.versionId) continue;
    const { version, doc } = await readVersion(r.versionId);
    out.push({ id: r.id, kind: r.kind, client: r.client, name: doc.name, version: version.number, locked: version.locked, days: doc.days.map((d, i) => ({ index: i, name: d.name, exercises: d.exercises.length })) });
  }
  return { programs: out.sort((a, b) => (a.client ?? "￿").localeCompare(b.client ?? "￿", "es") || a.name.localeCompare(b.name, "es")) };
}

async function unavailableIn(orgId: string, day: DayDoc, q: Tx | typeof db = db) {
  const ids = [...new Set(day.exercises.map((e) => e.exerciseId))];
  if (!ids.length) return new Set<string>();
  const ok = await q.select({ id: exercise.id }).from(exercise).where(and(inArray(exercise.id, ids), visibleIn(orgId)));
  const okIds = new Set(ok.map((x) => x.id));
  return new Set(ids.filter((x) => !okIds.has(x)));
}

type Plan = Awaited<ReturnType<typeof plan>>;
/** Lee origen y destino con permisos y arma la copia (sin escribir). Lo usan la vista previa y la confirmación. */
async function plan(actorId: string, orgId: string, from: CopyRef, to: PasteTarget, choice: CopyChoice | null, tx: Tx | typeof db = db) {
  await requireCoach(actorId, orgId, tx);
  const src = await coachProgram(orgId, from.programId, tx);
  const dst = from.programId === to.programId ? src : await coachProgram(orgId, to.programId, tx);
  const srcV = await readVersion(src.p.currentVersionId!, tx);
  const dstV = from.programId === to.programId ? srcV : await readVersion(dst.p.currentVersionId!, tx);
  const day = srcV.doc.days[from.day];
  if (!Number.isInteger(from.day) || !day) throw new AccessError("invalid", "Ese día ya no está en el programa de origen.", 409);
  const samePerson = src.p.id === dst.p.id || (!!src.p.coachClientId && src.p.coachClientId === dst.p.coachClientId);
  const opts: CopyChoice = choice ?? { weights: samePerson ? "keep" : "strip", notes: samePerson };
  const missing = await unavailableIn(orgId, { name: day.name, exercises: plain({ ...srcV.doc, days: [day] }).days[0].exercises }, tx);
  const content = copyDayContent(plain({ ...srcV.doc, days: [day] }).days[0], { weights: opts.weights, notes: opts.notes, skip: opts.skipUnavailable ? missing : undefined });
  const dstDoc = plain(dstV.doc);
  const pasted = pasteDay(dstDoc.days, content.day, to.mode, to.day ?? -1);
  return { src, dst, srcV, dstV, day, samePerson, opts, missing, content, dstDoc, pasted, fingerprint: docFingerprint(dstDoc) };
}

function previewOut(x: Plan) {
  const target = x.pasted.ok ? x.pasted.days[x.pasted.day] : null;
  const dstDay = x.pasted.ok && x.pasted.day < x.dstDoc.days.length ? x.dstDoc.days[x.pasted.day] : null;
  return {
    source: { programId: x.src.p.id, label: labelOf(x.src, x.srcV.doc.name), day: x.day.name, exercises: daySummary(plain({ ...x.srcV.doc, days: [x.day] }).days[0]) },
    target: { programId: x.dst.p.id, label: labelOf(x.dst, x.dstV.doc.name), version: x.dstV.version.number, locked: x.dstV.version.locked, day: x.pasted.ok ? x.pasted.day : null,
      dayName: target?.name ?? null, existing: dstDay?.exercises.length ?? 0, existingNames: (dstDay?.exercises ?? []).map((e) => e.name), resulting: target?.exercises.length ?? 0 },
    samePerson: x.samePerson, options: x.opts, stats: x.content.stats, unavailable: x.day.exercises.filter((e) => x.missing.has(e.exerciseId)).map((e) => e.name),
    remapped: x.pasted.ok ? x.pasted.remapped : {}, error: x.pasted.ok ? null : x.pasted.error, fingerprint: x.fingerprint,
  };
}

/** Vista previa: qué se copia, cómo queda el destino y con qué opciones por defecto. No escribe nada. */
export async function coachDayCopyPreview(actorId: string, orgId: string, p: { from: CopyRef; to: PasteTarget; choice?: CopyChoice | null }) {
  return previewOut(await plan(actorId, orgId, p.from, p.to, p.choice ?? null));
}

/**
 * Confirmar: con el programa de destino bloqueado, vuelve a leer y a verificar todo. Si el destino cambió desde la vista previa
 * (`expect`), no pega (409). Un reintento con el mismo `requestId` devuelve el resultado anterior sin pegar dos veces.
 */
export async function coachPasteDay(actorId: string, orgId: string, p: { from: CopyRef; to: PasteTarget; choice: CopyChoice; expect: string; requestId: string }) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(p.requestId)) throw new AccessError("invalid", "Falta el identificador de la operación.");
  await requireCoach(actorId, orgId);
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: program.id }).from(program).where(and(eq(program.id, p.to.programId), eq(program.orgId, orgId), isNull(program.archivedAt))).for("update");
    if (!locked) throw NOT_FOUND();
    const [prev] = await tx.select({ meta: auditEvent.meta }).from(auditEvent)
      .where(and(eq(auditEvent.actorUserId, actorId), eq(auditEvent.action, "program.day_pasted"), eq(auditEvent.resourceId, p.to.programId), sql`${auditEvent.meta}->>'requestId' = ${p.requestId}`)).limit(1);
    if (prev) { const m = prev.meta as { version: number; created: boolean; day: number }; return { version: m.version, created: m.created, day: m.day, repeated: true }; }
    const x = await plan(actorId, orgId, p.from, p.to, p.choice, tx);
    if (x.fingerprint !== p.expect) throw new AccessError("conflict", "El programa de destino cambió desde la vista previa (otra pestaña o el autoguardado). Revisá la vista previa otra vez.", 409);
    if (!x.pasted.ok) throw new AccessError("invalid", x.pasted.error);
    if (x.missing.size && !p.choice.skipUnavailable) throw new AccessError("invalid", "Hay ejercicios que no están disponibles en el destino. Elegí copiar sin ellos.", 409);
    const v = validateProgramDoc({ ...x.dstDoc, days: x.pasted.days } as ProgramDoc);
    if (!v.ok) throw new AccessError("invalid", v.error);
    const r = await writeProgramDoc(tx, { actorId, orgId, programId: x.dst.p.id, cur: x.dstV, doc: v.doc });
    await audit(tx, { actorUserId: actorId, orgId, action: "program.day_pasted", resourceType: "program", resourceId: x.dst.p.id,
      meta: { requestId: p.requestId, from: x.src.p.id, fromDay: p.from.day, mode: p.to.mode, day: x.pasted.day, weights: p.choice.weights, notes: p.choice.notes, exercises: x.content.stats.exercises, skipped: x.content.stats.skipped.length, version: r.version, created: r.created } });
    return { version: r.version, created: r.created, day: x.pasted.day, repeated: false };
  });
}

// ── Gimnasio ────────────────────────────────────────────────────────────────
/** Socio de la organización en una sede de quien arma programas (`program.edit`); si no, 404 (no revela si existe). */
async function gymMemberFor(actorId: string, orgId: string, gymMemberId: string) {
  const ctx = await gymContext(actorId, orgId);
  need(ctx, "program.edit");
  const [m] = await db.select().from(gymMember).where(and(eq(gymMember.id, gymMemberId), eq(gymMember.orgId, orgId)));
  if (!m || !inScope(ctx, m.locationId)) throw NOT_FOUND();
  return m;
}
async function memberProgramDoc(gymMemberId: string) {
  const [a] = await db.select({ programId: programAssignment.programId }).from(programAssignment).where(and(eq(programAssignment.gymMemberId, gymMemberId), eq(programAssignment.status, "active")));
  if (!a) return null;
  const [p] = await db.select({ v: program.currentVersionId, kind: program.kind }).from(program).where(and(eq(program.id, a.programId), isNull(program.archivedAt)));
  if (!p?.v || p.kind !== "member_copy") return null;
  return readVersion(p.v);
}

/** Días del programa institucional de un socio (para elegir qué copiar). Sin series registradas ni datos del socio. */
export async function memberProgramDays(actorId: string, orgId: string, gymMemberId: string) {
  await gymMemberFor(actorId, orgId, gymMemberId);
  const r = await memberProgramDoc(gymMemberId);
  if (!r) return { program: null };
  return { program: { name: r.doc.name, revision: r.version.number, days: r.doc.days.map((d, i) => ({ index: i, name: d.name, exercises: d.exercises.length })) } };
}

/**
 * Contenido de un día del programa de un socio, listo para pegar en el borrador de otro (o del mismo). No escribe: el
 * borrador se guarda después como revisión, con motivo, por `saveMemberProgram` (que vuelve a verificar el destino).
 */
export async function memberDayCopy(actorId: string, orgId: string, gymMemberId: string, p: { day: number; forMemberId: string; choice?: CopyChoice | null }) {
  const src = await gymMemberFor(actorId, orgId, gymMemberId);
  if (p.forMemberId !== gymMemberId) await gymMemberFor(actorId, orgId, p.forMemberId);
  const r = await memberProgramDoc(src.id);
  const day = r?.doc.days[p.day];
  if (!r || !Number.isInteger(p.day) || !day) throw new AccessError("invalid", "Ese día ya no está en el programa de origen.", 409);
  const samePerson = p.forMemberId === gymMemberId;
  const opts: CopyChoice = p.choice ?? { weights: samePerson ? "keep" : "strip", notes: samePerson };
  const plainDay = plain({ ...r.doc, days: [day] }).days[0];
  const missing = await unavailableIn(orgId, plainDay);
  const content = copyDayContent(plainDay, { weights: opts.weights, notes: opts.notes, skip: missing });
  await audit(db, { actorUserId: actorId, orgId, action: "member_program.day_copied", resourceType: "gym_member", resourceId: p.forMemberId,
    meta: { from: src.id, day: p.day, weights: opts.weights, notes: opts.notes, exercises: content.stats.exercises } });
  return { day: content.day, stats: content.stats, samePerson, options: opts, source: { program: r.doc.name, revision: r.version.number, day: day.name }, unavailable: plainDay.exercises.filter((e) => missing.has(e.exerciseId)).map((e) => e.name) };
}
