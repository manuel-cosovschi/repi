import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import * as svc from "@/server/access/services";
import { beginUpload, completeUpload, purgeUploadIntents } from "@/server/uploads";
import { AccessError } from "@/server/access/util";

// Subida directa (D71) contra un Supabase Storage simulado: se verifica qué pedidos se harían, sin red real.
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
let n = 0;
const person = async () => (await svc.signUpPerson({ name: "Persona Subida", email: `subida${++n}.${Date.now()}@test.repi.local`, password: "prueba1234", terms: true })).userId!;

function fakeSupabase(object: { bytes: Uint8Array; size: number } | null) {
  vi.stubEnv("SUPABASE_URL", "https://proyecto.supabase.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_prueba");
  const calls: { method: string; url: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url });
    if (url.includes("/object/upload/sign/")) return Response.json({ url: `/object/upload/sign/repi-private/${url.split("/repi-private/")[1]}?token=t1` });
    if (init?.method === "DELETE") return Response.json([]);
    if (!object) return new Response("{}", { status: 400 });
    return new Response(new Blob([object.bytes as Uint8Array<ArrayBuffer>]), { status: 206, headers: { "content-range": `bytes 0-${object.bytes.length - 1}/${object.size}` } });
  }));
  return calls;
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("subida directa de videos", () => {
  it("sin almacenamiento con URL firmada, el cliente sube por /api", async () => {
    const uid = await person();
    expect(await beginUpload(uid, { purpose: "request_video", mime: "video/mp4", size: 1000 })).toEqual({ id: null, upload: null });
  });
  it("valida tipo, tamaño y pertenencia antes de firmar", async () => {
    fakeSupabase(null);
    const uid = await person();
    await expect(beginUpload(uid, { purpose: "request_video", mime: "video/avi", size: 1000 })).rejects.toBeInstanceOf(AccessError);
    await expect(beginUpload(uid, { purpose: "request_video", mime: "video/mp4", size: 61 * 1024 * 1024 })).rejects.toMatchObject({ code: "invalid_file" });
    await expect(beginUpload(uid, { purpose: "attempt_video", orgId: "org-ajena", mime: "video/mp4", size: 1000 })).rejects.toMatchObject({ status: 404 });
  });
  it("firma, confirma por tamaño y firma real, y no se puede confirmar dos veces", async () => {
    const calls = fakeSupabase({ bytes: MP4, size: 5_000_000 });
    const uid = await person();
    const b = await beginUpload(uid, { purpose: "request_video", mime: "video/quicktime", size: 5_000_000 });
    expect(b.upload?.url).toMatch(/^https:\/\/proyecto\.supabase\.test\/storage\/v1\/object\/upload\/sign\/repi-private\/request-video\/.+\?token=t1$/);
    const otro = await person();
    await expect(completeUpload(otro, b.id!)).rejects.toMatchObject({ status: 404 });
    expect(await completeUpload(uid, b.id!)).toEqual({ id: b.id });
    const [m] = await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, b.id!));
    expect(m).toMatchObject({ ownerUserId: uid, purpose: "request_video", sizeBytes: 5_000_000 });
    await expect(completeUpload(uid, b.id!)).rejects.toMatchObject({ status: 404 });
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });
  it("un archivo que no es video se borra y no queda registrado", async () => {
    const calls = fakeSupabase({ bytes: PNG, size: 2000 });
    const uid = await person();
    const b = await beginUpload(uid, { purpose: "request_video", mime: "video/mp4", size: 2000 });
    await expect(completeUpload(uid, b.id!)).rejects.toMatchObject({ code: "invalid_file" });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(await db.select().from(schema.mediaObject).where(eq(schema.mediaObject.id, b.id!))).toHaveLength(0);
  });
  it("si el archivo no llegó, se puede reintentar; vencida, se limpia", async () => {
    fakeSupabase(null);
    const uid = await person();
    const b = await beginUpload(uid, { purpose: "request_video", mime: "video/mp4", size: 2000 });
    await expect(completeUpload(uid, b.id!)).rejects.toMatchObject({ code: "upload_missing" });
    await db.update(schema.uploadIntent).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.uploadIntent.id, b.id!));
    expect(await purgeUploadIntents()).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(schema.uploadIntent).where(eq(schema.uploadIntent.id, b.id!))).toHaveLength(0);
  });
});
