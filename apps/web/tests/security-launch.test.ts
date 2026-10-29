import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { auth } from '@/server/auth';
import { completeGymConsent } from '@/server/access/services';
import { issueFirstAdminTicket, claimFirstAdmin } from '@/server/admin/bootstrap';
import { POST as authPost } from '@/app/api/auth/[...all]/route';

const person = async (extra: Partial<typeof schema.user.$inferInsert> = {}) => {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Persona real de prueba', email: `${id}@example.test`, emailVerified: true, ...extra });
  return id;
};
afterEach(() => { delete process.env.REPI_DEPLOY; });

describe('cierre de lanzamiento: identidad y acceso', () => {
  it('SEC-4 (QA 29/10): no se crean cuentas por fuera del alta con términos y edad', async () => {
    const email = `${randomUUID()}@example.test`;
    const res = await authPost(new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, name: 'Atajo', password: 'Password123!' }),
    }));
    expect(res.status).toBe(404);
    await auth.api.signInEmailOTP({ body: { email, otp: '123456' } }).catch(() => {});
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } }).catch(() => {});
    expect(await db.select().from(schema.user).where(eq(schema.user.email, email))).toHaveLength(0);
  });
  it('no deja a un socio suspendido reactivar su membresía mediante consentimiento', async () => {
    const uid = await person();
    const [org] = await db.insert(schema.organization).values({ name: 'Gym prueba', kind: 'gym', status: 'active', commercialStatus: 'enabled' }).returning();
    const [loc] = await db.insert(schema.gymLocation).values({ orgId: org.id, name: 'Sede' }).returning();
    const [member] = await db.insert(schema.gymMember).values({ orgId: org.id, locationId: loc.id, userId: uid, status: 'suspended' }).returning();
    await expect(completeGymConsent(uid, org.id, ['attendance_training'])).rejects.toMatchObject({ code: 'invalid_state' });
    expect((await db.select().from(schema.gymMember).where(eq(schema.gymMember.id, member.id)))[0].status).toBe('suspended');
    expect(await db.select().from(schema.consentGrant).where(eq(schema.consentGrant.relationId, member.id))).toHaveLength(0);
    await db.update(schema.gymMember).set({ status: 'pending_consent' }).where(eq(schema.gymMember.id, member.id));
    await db.update(schema.organization).set({ commercialStatus: 'suspended' }).where(eq(schema.organization.id, org.id));
    await expect(completeGymConsent(uid, org.id, [])).rejects.toMatchObject({ code: 'org_unavailable' });
    await db.update(schema.organization).set({ commercialStatus: 'enabled' }).where(eq(schema.organization.id, org.id));
    await completeGymConsent(uid, org.id, ['attendance_training']);
    expect((await db.select().from(schema.gymMember).where(eq(schema.gymMember.id, member.id)))[0].status).toBe('active');
  });

  it('impide sesiones de cuentas sembradas en un despliegue aunque tengan contraseña conocida', async () => {
    const email = `retirada-${randomUUID()}@demo.repi.app`;
    const created = await auth.api.signUpEmail({ body: { email, name: 'Demo retirada', password: 'Password123!' } });
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, created.user.id));
    process.env.REPI_DEPLOY = 'demo';
    await expect(auth.api.signInEmail({ body: { email, password: 'Password123!' } })).rejects.toBeDefined();
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, created.user.id))).toHaveLength(0);
    const newEmail = `nueva-${randomUUID()}@demo.repi.app`;
    // Better Auth puede devolver una respuesta sintética para evitar enumeración; jamás debe persistir la cuenta.
    await auth.api.signUpEmail({ body: { email: newEmail, name: 'No', password: 'Password123!' } }).catch(() => {});
    expect(await db.select().from(schema.user).where(eq(schema.user.email, newEmail))).toHaveLength(0);
  });

  it('primer Admin: token único, cuenta verificada, 2FA real, vencimiento y consumo concurrente', async () => {
    // Suite aislada: esta prueba se ejecuta antes de crear otros administradores.
    await db.update(schema.user).set({ platformRole: null }).where(eq(schema.user.platformRole, 'admin'));
    const uid = await person({ emailVerified: false });
    const ticket = await issueFirstAdminTicket();
    await expect(claimFirstAdmin(uid, ticket.token)).rejects.toMatchObject({ code: 'unverified' });
    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, uid));
    await expect(claimFirstAdmin(uid, ticket.token)).rejects.toMatchObject({ code: 'twofa_required' });
    await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, uid));
    await expect(claimFirstAdmin(uid, ticket.token)).rejects.toMatchObject({ code: 'twofa_required' });
    await db.insert(schema.twoFactor).values({ id: randomUUID(), userId: uid, secret: 'encrypted-test-only', backupCodes: 'encrypted-test-only', verified: true });
    await expect(claimFirstAdmin(uid, 'incorrect-token')).rejects.toMatchObject({ code: 'invalid_ticket' });
    const expired = await issueFirstAdminTicket(new Date(Date.now() - 48 * 3600_000));
    await expect(claimFirstAdmin(uid, expired.token)).rejects.toMatchObject({ code: 'invalid_ticket' });
    const latest = await issueFirstAdminTicket();
    await expect(claimFirstAdmin(uid, ticket.token)).rejects.toMatchObject({ code: 'invalid_ticket' });
    const results = await Promise.allSettled([claimFirstAdmin(uid, latest.token), claimFirstAdmin(uid, latest.token)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.select().from(schema.user).where(eq(schema.user.id, uid)))[0].platformRole).toBe('admin');
    await expect(issueFirstAdminTicket()).rejects.toMatchObject({ code: 'admin_exists' });
    expect(await db.select().from(schema.auditEvent).where(and(eq(schema.auditEvent.action, 'admin.bootstrap.claimed'), eq(schema.auditEvent.actorUserId, uid)))).toHaveLength(1);
    await db.update(schema.user).set({ platformRole: null }).where(eq(schema.user.id, uid));
  });
});
