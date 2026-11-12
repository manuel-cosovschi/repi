import { describe, expect, it } from "vitest";
import { eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEMO_ROLES, purgeSandboxes, sealDemo, startDemo } from "@/server/sandbox/services";
import { createSelfGoal } from "@/server/progress/goals";
import { createGoal } from "@/server/training/goals";

// Incidente 12/11 (alerta «sandbox.purge · código 23503 · Failed query: delete», una por hora): en producción el DELETE de
// "user" fallaba con «violates foreign key constraint client_goal_created_by_user_id_fk on table client_goal». Una meta
// propia (D217, migración 0055) apunta dos veces a la misma persona: user_id con cascada y created_by sin cascada; Postgres
// revisa created_by antes de que la cascada borre la fila. La demo vencida no se borraba nunca y el job fallaba cada minuto.
const expire = (ids: string[]) => db.update(schema.demoSandbox).set({ expiresAt: new Date(Date.now() - 1000) }).where(inArray(schema.demoSandbox.id, ids));
const boxOf = async (tag: string) => (await db.select().from(schema.demoSandbox).where(eq(schema.demoSandbox.tag, tag)))[0];

describe("limpieza de demos vencidas", () => {
  it("una meta propia del visitante (y una del coach) no traba la limpieza", async () => {
    const d = await startDemo("member");
    await sealDemo(d.tag);
    const box = await boxOf(d.tag);
    const users = box.userIds as string[], orgs = box.orgIds as string[];
    const people = await db.select({ id: schema.user.id, email: schema.user.email }).from(schema.user).where(inArray(schema.user.id, users));
    const by = (slug: string) => people.find((u) => u.email.startsWith(`${slug}@`))!.id;
    const vale = by("valentina.gomez"), coach = by("agustin.perez");
    const [press] = await db.select({ id: schema.exercise.id }).from(schema.exercise).where(eq(schema.exercise.name, "Press de banca"));
    // Lo que hizo el visitante en producción: fijarse una meta desde Progreso (por ejercicio y de frecuencia).
    await createSelfGoal(vale, { kind: "load", exerciseId: press.id, target: 70, targetReps: 8 }, async () => []);
    await createSelfGoal(vale, { kind: "frequency", target: 3 }, async () => []);
    // Y el coach de la demo, un objetivo acordado con su alumna (cae con la relación coach_client).
    const [rel] = await db.select({ id: schema.coachClient.id }).from(schema.coachClient).where(eq(schema.coachClient.userId, vale));
    await createGoal(coach, orgs[1], rel.id, { kind: "manual", title: "Correr 5 km", target: 5, unit: "km" });
    const mine = or(inArray(schema.clientGoal.userId, users), inArray(schema.clientGoal.createdBy, users));
    expect(await db.select({ id: schema.clientGoal.id }).from(schema.clientGoal).where(mine)).toHaveLength(3);

    await expire([box.id]);
    expect(await purgeSandboxes()).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(schema.demoSandbox).where(eq(schema.demoSandbox.id, box.id))).toHaveLength(0);
    expect(await db.select({ id: schema.user.id }).from(schema.user).where(inArray(schema.user.id, users))).toHaveLength(0);
    expect(await db.select({ id: schema.organization.id }).from(schema.organization).where(inArray(schema.organization.id, orgs))).toHaveLength(0);
    expect(await db.select({ id: schema.clientGoal.id }).from(schema.clientGoal).where(mine)).toHaveLength(0);
  });

  it("los cinco perfiles de la demo se borran completos, también con aceptaciones legales de la organización", async () => {
    const boxes: (typeof schema.demoSandbox.$inferSelect)[] = [];
    for (const role of DEMO_ROLES) {
      const d = await startDemo(role);
      await sealDemo(d.tag);
      boxes.push(await boxOf(d.tag));
    }
    // legal_acceptance.org_id no tiene cascada: una aceptación (DPA) ligada al gimnasio de la demo frenaría el borrado de la organización.
    for (const b of boxes) await db.insert(schema.legalAcceptance).values({ userId: (b.userIds as string[])[0], orgId: (b.orgIds as string[])[0], document: "dpa", version: "demo" });
    const users = boxes.flatMap((b) => b.userIds as string[]), orgs = boxes.flatMap((b) => b.orgIds as string[]);
    expect(users.length).toBeGreaterThanOrEqual(4 * 8 + 6);
    await expire(boxes.map((b) => b.id));
    expect(await purgeSandboxes()).toBeGreaterThanOrEqual(boxes.length);
    expect(await db.select().from(schema.demoSandbox).where(inArray(schema.demoSandbox.id, boxes.map((b) => b.id)))).toHaveLength(0);
    expect(await db.select({ id: schema.user.id }).from(schema.user).where(inArray(schema.user.id, users))).toHaveLength(0);
    expect(await db.select({ id: schema.organization.id }).from(schema.organization).where(inArray(schema.organization.id, orgs))).toHaveLength(0);
    expect(await db.select({ id: schema.legalAcceptance.id }).from(schema.legalAcceptance).where(inArray(schema.legalAcceptance.orgId, orgs))).toHaveLength(0);
  }, 180_000);

  // La clase del error, para la próxima tabla: una referencia a "user" u "organization" SIN cascada en una fila que la
  // organización de la demo no arrastra frena el DELETE (23503) y la demo queda para siempre. Se lee el catálogo de la base
  // recién migrada (el mismo esquema que producción): cada FK así tiene que estar en una tabla atada a la organización por
  // una cadena de columnas obligatorias con ON DELETE CASCADE (se borra antes que la persona) o resuelta a mano en purgeSandboxes.
  it("guarda: ninguna referencia sin cascada a user u organization queda fuera de la limpieza", async () => {
    const BY_HAND: Record<string, string> = {
      "client_goal.created_by": "metas propias (D217): purgeSandboxes las borra antes que a la persona",
      "legal_acceptance.org_id": "purgeSandboxes borra las aceptaciones de la organización antes que la organización",
    };
    const fks = [...await db.execute<{ tbl: string; col: string; ref: string; del: string; nn: boolean }>(sql`
      select t.relname::text as tbl, a.attname::text as col, r.relname::text as ref, c.confdeltype::text as del, a.attnotnull as nn
      from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_class r on r.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)];
    expect(fks.length).toBeGreaterThan(300);
    // Tablas que caen sí o sí con la organización: columna obligatoria + ON DELETE CASCADE hacia otra que también cae.
    const bound = new Set(["organization"]);
    for (let grew = true; grew;) {
      grew = false;
      for (const f of fks) if (f.del === "c" && f.nn && bound.has(f.ref) && !bound.has(f.tbl)) { bound.add(f.tbl); grew = true; }
    }
    const toSandbox = fks.filter((f) => f.ref === "user" || f.ref === "organization");
    const blocking = toSandbox.filter((f) => f.del === "a" || f.del === "r"); // NO ACTION / RESTRICT
    const uncovered = blocking.filter((f) => !bound.has(f.tbl)).map((f) => `${f.tbl}.${f.col}`).sort();
    expect(uncovered, "FK sin cascada a user/organization en una tabla que la organización de la demo no arrastra: borrá esas filas en purgeSandboxes (y anotala en BY_HAND con su prueba) o declarala ON DELETE CASCADE / SET NULL").toEqual(Object.keys(BY_HAND).sort());
    // SET NULL sobre una columna obligatoria también falla al borrar.
    expect(toSandbox.filter((f) => f.del === "n" && f.nn).map((f) => `${f.tbl}.${f.col}`)).toEqual([]);
    // La guarda habría frenado 0055: al dejar de ser obligatoria coach_client_id, client_goal dejó de caer con la organización.
    expect(bound.has("coach_client") && bound.has("gym_task") && !bound.has("client_goal")).toBe(true);
  });
});
