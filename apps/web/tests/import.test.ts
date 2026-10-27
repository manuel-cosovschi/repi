import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { guessColumns, mapRows, parseCsv } from "@repi/domain";
import { db, schema } from "@/db";
import { auth } from "@/server/auth";
import * as acc from "@/server/access/services";
import { resetRateLimits } from "@/server/access/util";
import { confirmImport, previewImport } from "@/server/access/import";

// F-CO-11 / D99: importar = invitar por email las filas válidas; vista previa y deduplicación en el servidor.
let n = 0;
async function verified(name = "Persona Import", email = `im${++n}.${Date.now()}@test.repi.local`) {
  const r = await acc.signUpPerson({ name, email, password: "prueba1234", terms: true, birth: "01/01/1990" });
  const [m] = await db.select().from(schema.devMailbox).where(eq(schema.devMailbox.to, email)).orderBy(desc(schema.devMailbox.createdAt)).limit(1);
  await auth.api.verifyEmailOTP({ body: { email, otp: /(\d{6})/.exec(m.body)![1] } });
  return { id: r.userId!, email };
}
beforeEach(() => resetRateLimits());

describe("importación CSV de clientes", () => {
  it("vista previa marca cada fila; confirmar invita sólo las válidas y reintentar no duplica", async () => {
    const coach = await verified("Coach Import");
    const org = await acc.createCoachOrganization(coach.id, { brand: `Import ${n}` });
    const client = await verified("Cliente Vigente");
    const inv = await acc.inviteCoachClient(coach.id, org.id, { email: client.email });
    await acc.acceptInvitation(client.id, inv.code, []);
    const pendingEmail = `pend${n}.${Date.now()}@test.repi.local`;
    await acc.inviteCoachClient(coach.id, org.id, { email: pendingEmail });
    const fresh = `nuevo${n}.${Date.now()}@test.repi.local`;
    const csv = `Nombre;Apellido;Correo\nAna;Ruiz;${fresh.toUpperCase()}\nAna;Ruiz;${fresh}\nVigente;X;${client.email}\nPend;Y;${pendingEmail}\nSin;Mail;no-es-email\n`;
    const p = parseCsv(csv);
    const rows = mapRows(p.rows, guessColumns(p.headers));
    const prev = await previewImport(coach.id, org.id, rows);
    expect(prev.map((r) => r.status)).toEqual(["ok", "duplicate_in_file", "already_client", "pending_invitation", "invalid_email"]);
    expect(prev[0]).toMatchObject({ line: 2, name: "Ana Ruiz", email: fresh.toLowerCase() });

    const r1 = await confirmImport(coach.id, org.id, rows);
    expect(r1).toMatchObject({ invited: 1, skipped: 4, failed: 0 });
    const r2 = await confirmImport(coach.id, org.id, rows);
    expect(r2).toMatchObject({ invited: 0, skipped: 5 });
    const invs = await db.select().from(schema.invitation).where(and(eq(schema.invitation.orgId, org.id), eq(schema.invitation.email, fresh.toLowerCase())));
    expect(invs).toHaveLength(1);
    const logs = await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.orgId, org.id), eq(schema.auditEvent.action, "import.clients")));
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs[0].meta)).not.toContain("@");
  });

  it("sólo el coach dueño; límite de filas", async () => {
    const coach = await verified("Coach Import 2");
    const org = await acc.createCoachOrganization(coach.id, { brand: `Import B ${n}` });
    const other = await verified("Otro");
    await expect(previewImport(other.id, org.id, [{ line: 2, email: "a@b.co" }])).rejects.toMatchObject({ status: 404 });
    await expect(previewImport(coach.id, org.id, [])).rejects.toMatchObject({ code: "invalid" });
    const many = Array.from({ length: 201 }, (_, i) => ({ line: i + 2, email: `x${i}@b.co` }));
    await expect(previewImport(coach.id, org.id, many)).rejects.toMatchObject({ code: "invalid" });
  });
});
