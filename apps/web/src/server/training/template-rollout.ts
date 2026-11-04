// D194 · «Actualizar programas de alumnos» desde una plantilla del coach. Surgió del caso de Urko (D193): editar una plantilla
// no cambia las copias de sus alumnos. Esto le muestra al profe qué alumnos usan copias de la plantilla, de qué versión
// salió cada copia, qué cambió en la plantilla y qué personalizó en cada alumno, y aplica sólo lo que el profe elige.
//
// Reglas: nada se aplica sin confirmación explícita; cada programa afectado recibe una versión nueva con su motivo (las
// sesiones y series registradas siguen apuntando a la versión con la que se hicieron); una personalización del alumno en la
// misma unidad es un conflicto y por defecto se conserva; el destino se vuelve a leer y se compara con la huella de la vista
// previa (409 si cambió); un reintento con el mismo `requestId` no repite nada. Un alumno entrenando ve el aviso de rutina
// nueva y «Aplicar ahora» (D145/D193) sin que cambien sus series hechas. Sólo coach: el gimnasio edita el programa de cada
// socio (no tiene plantillas). La auditoría guarda ids y cantidades, nunca nombres.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { applyRollout, docFingerprint, rolloutPlan, validateProgramDoc, type ProgramDoc } from "@repi/domain";
import { db, schema } from "@/db";
import { AccessError, audit, type Tx } from "../access/util";
import { assertLibrary, newVersion, plain, readVersion, requireCoach } from "./services";

const { program, programVersion, programAssignment, coachClient, user, workoutSession, auditEvent } = schema;
const NOT_FOUND = () => new AccessError("not_found", "No encontramos lo que buscás.", 404);
const norm = (d: ProgramDoc) => { const v = validateProgramDoc(plain(d as never)); return v.ok ? v.doc : plain(d as never); };

async function templateOf(orgId: string, templateId: string, tx: Tx | typeof db = db, lock = false) {
  const q = tx.select().from(program).where(and(eq(program.id, templateId), eq(program.orgId, orgId), eq(program.kind, "template"), isNull(program.archivedAt)));
  const [t] = lock ? await q.for("update") : await q;
  if (!t?.currentVersionId) throw NOT_FOUND();
  return t;
}

/** Copias vigentes de la plantilla: programa del alumno con asignación activa y relación activa, dentro de la organización. */
async function copiesOf(orgId: string, templateId: string, ids?: string[], tx: Tx | typeof db = db) {
  return tx.select({ p: program, rel: coachClient.id, relStatus: coachClient.status, name: user.name }).from(programAssignment)
    .innerJoin(program, eq(program.id, programAssignment.programId))
    .innerJoin(coachClient, eq(coachClient.id, programAssignment.coachClientId))
    .innerJoin(user, eq(user.id, coachClient.userId))
    .where(and(eq(programAssignment.status, "active"), eq(program.orgId, orgId), eq(program.kind, "client_copy"), eq(program.sourceProgramId, templateId), isNull(program.archivedAt),
      eq(coachClient.coachOrgId, orgId), ...(ids ? [inArray(program.id, ids)] : [])));
}

async function planFor(copy: typeof program.$inferSelect, template: ProgramDoc, tx: Tx | typeof db) {
  const cur = await readVersion(copy.currentVersionId!, tx);
  const student = norm(cur.doc as never);
  // Base: la versión de la que salió la copia (o la última que se le aplicó). Debe ser de la misma organización.
  let base: ProgramDoc | null = null, baseNumber: number | null = null, baseOfTemplate = false;
  if (copy.sourceVersionId) {
    const [bv] = await tx.select({ id: programVersion.id, number: programVersion.number, programId: programVersion.programId, org: program.orgId }).from(programVersion)
      .innerJoin(program, eq(program.id, programVersion.programId)).where(eq(programVersion.id, copy.sourceVersionId));
    if (bv && bv.org === copy.orgId) { base = norm((await readVersion(bv.id, tx)).doc as never); baseNumber = bv.number; baseOfTemplate = bv.programId === copy.sourceProgramId; }
  }
  return { cur, student, base, baseNumber, baseOfTemplate, plan: rolloutPlan(base, template, student), fingerprint: docFingerprint(student) };
}

/** Alumnos que usan copias de la plantilla, con la versión de cada uno y la comparación (lo que cambiaría). */
export async function templateRolloutPreview(actorId: string, orgId: string, templateId: string) {
  await requireCoach(actorId, orgId);
  const t = await templateOf(orgId, templateId);
  const tv = await readVersion(t.currentVersionId!);
  const template = norm(tv.doc as never);
  const copies = await copiesOf(orgId, templateId);
  const open = copies.length ? await db.select({ rel: workoutSession.coachClientId }).from(workoutSession)
    .where(and(inArray(workoutSession.coachClientId, copies.map((c) => c.rel)), inArray(workoutSession.status, ["in_progress", "paused"]))) : [];
  const students = [];
  for (const c of copies) {
    if (c.relStatus !== "active" || !c.p.currentVersionId) continue;
    const x = await planFor(c.p, template, db);
    students.push({
      programId: c.p.id, name: c.name, version: x.cur.version.number, baseVersion: x.baseOfTemplate ? x.baseNumber : null, noBase: x.plan.noBase,
      upToDate: x.plan.changes.length === 0, ownChanges: x.plan.ownChanges, training: open.some((o) => o.rel === c.rel),
      changes: x.plan.changes, fingerprint: x.fingerprint,
    });
  }
  students.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { template: { id: t.id, name: template.name, version: tv.version.number, fingerprint: docFingerprint(template) }, students };
}

export type RolloutTarget = { programId: string; fingerprint: string; apply: string[] };

/** Aplica los cambios elegidos a cada alumno elegido: una versión nueva por programa, todo o nada. */
export async function applyTemplateRollout(actorId: string, orgId: string, templateId: string, p: { requestId: string; template: string; targets: RolloutTarget[] }) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(p.requestId)) throw new AccessError("invalid", "Falta el identificador de la operación.");
  if (!p.targets.length) throw new AccessError("invalid", "Elegí al menos un alumno.");
  if (new Set(p.targets.map((x) => x.programId)).size !== p.targets.length) throw new AccessError("invalid", "Hay alumnos repetidos.");
  await requireCoach(actorId, orgId);
  return db.transaction(async (tx) => {
    const t = await templateOf(orgId, templateId, tx, true);
    const [prev] = await tx.select({ meta: auditEvent.meta }).from(auditEvent)
      .where(and(eq(auditEvent.actorUserId, actorId), eq(auditEvent.action, "program.template_rollout"), eq(auditEvent.resourceId, templateId), sql`${auditEvent.meta}->>'requestId' = ${p.requestId}`)).limit(1);
    if (prev) return { ...(prev.meta as { results: { programId: string; version: number | null; applied: number }[] }), repeated: true };
    const tv = await readVersion(t.currentVersionId!, tx);
    const template = norm(tv.doc as never);
    if (docFingerprint(template) !== p.template) throw new AccessError("conflict", "La plantilla cambió desde la vista previa. Revisá la comparación otra vez.", 409);
    await assertLibrary(orgId, template);
    const ids = p.targets.map((x) => x.programId);
    // Bloqueo de los programas de destino en un orden fijo (dos actualizaciones a la vez no se cruzan).
    await tx.select({ id: program.id }).from(program).where(and(inArray(program.id, ids), eq(program.orgId, orgId))).orderBy(program.id).for("update");
    const copies = await copiesOf(orgId, templateId, ids, tx);
    const results: { programId: string; version: number | null; applied: number }[] = [];
    for (const target of p.targets) {
      const c = copies.find((x) => x.p.id === target.programId);
      if (!c || c.relStatus !== "active" || !c.p.currentVersionId) throw NOT_FOUND();
      const x = await planFor(c.p, template, tx);
      if (x.fingerprint !== target.fingerprint) throw new AccessError("conflict", `El programa de ${c.name.split(" ")[0]} cambió desde la vista previa. Revisá la comparación otra vez.`, 409);
      const valid = new Set(x.plan.changes.map((ch) => ch.key));
      const apply = [...new Set(target.apply)];
      if (apply.some((k) => !valid.has(k))) throw new AccessError("conflict", "La comparación cambió. Revisala otra vez.", 409);
      const next = applyRollout(x.base, template, x.student, apply);
      const v = validateProgramDoc(next);
      if (!v.ok) throw new AccessError("invalid", `${c.name.split(" ")[0]}: ${v.error}`);
      let version: number | null = null;
      if (apply.length && JSON.stringify(v.doc) !== JSON.stringify(x.student)) {
        // Siempre una versión nueva (con motivo): la anterior queda congelada con lo que ya se entrenó.
        await tx.update(programVersion).set({ locked: true }).where(eq(programVersion.id, x.cur.version.id));
        const nv = await newVersion(tx, c.p.id, x.cur.version.number + 1, v.doc, actorId, `Actualización desde la plantilla «${template.name}» (versión ${tv.version.number})`.slice(0, 200));
        version = nv.number;
      }
      // La versión de la plantilla queda como base de la próxima comparación (y congelada, para que no cambie debajo). Lo que
      // el profe dejó sin marcar pasa a ser una decisión (lo del alumno). Sin nada elegido no cambia nada: los cambios
      // pendientes siguen apareciendo en la próxima comparación.
      if (apply.length) await tx.update(program).set({ sourceVersionId: tv.version.id }).where(eq(program.id, c.p.id));
      await audit(tx, { actorUserId: actorId, orgId, action: "program.versioned", resourceType: "program", resourceId: c.p.id, meta: { version, source: "template_rollout", template: templateId, applied: apply.length, conflictsTaken: x.plan.changes.filter((ch) => ch.conflict && apply.includes(ch.key)).length } });
      results.push({ programId: c.p.id, version, applied: apply.length });
    }
    await tx.update(programVersion).set({ locked: true }).where(eq(programVersion.id, tv.version.id));
    await audit(tx, { actorUserId: actorId, orgId, action: "program.template_rollout", resourceType: "program", resourceId: templateId, meta: { requestId: p.requestId, templateVersion: tv.version.number, results } });
    return { results, repeated: false };
  });
}
