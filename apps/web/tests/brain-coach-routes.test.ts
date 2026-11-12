// D210 · Rutas nuevas del bloque C2 (señales del entrenador y de la sala, REPI Admin «Coaching IA», opt-in de push del socio):
// sin sesión responden 401 sin llegar al servicio (lo mismo que verifica e2e/api-auth-sweep), con sesión pasan el id de la
// sesión (nunca uno del cuerpo) y validan la entrada. Sin base de datos: los servicios están reemplazados por dobles.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/log", () => ({ maskPath: (path: string) => path, logError: vi.fn() }));
vi.mock("@/server/access/util", () => ({
  AccessError: class extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } },
  audit: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock("@/server/brain/coach", () => ({ coachInsights: vi.fn(async () => ({ insights: [] })), memberInsights: vi.fn(async () => ({ insights: [] })), coachPendingSignals: vi.fn(async () => ({ clients: [] })) }));
vi.mock("@/server/brain/admin", () => ({ brainMetrics: vi.fn(async () => ({ ok: 1 })), updateBrainPolicy: vi.fn(async () => ({ scope: "global" })) }));
vi.mock("@/server/push/services", () => ({ subscribe: vi.fn(async () => ({ ok: true })), unsubscribe: vi.fn(), setPaused: vi.fn(), pushStatus: vi.fn(async () => ({ coaching: { enabled: false, eligible: true } })) }));
vi.mock("@/server/commercial/services", () => ({}));
vi.mock("@/server/privacy/services", () => ({}));
vi.mock("@/server/support/services", () => ({}));
vi.mock("@/server/commercial/payments", () => ({}));
vi.mock("@/server/announcements/services", () => ({}));
vi.mock("@/server/site/events", () => ({}));
vi.mock("@/server/sales/admin-routes", () => ({ salesGet: vi.fn(), salesPost: vi.fn() })); // D209 (fuerza de ventas): la ruta de Admin la importa
vi.mock("@/server/leads/routes", () => ({ leadsGet: vi.fn(), leadsPost: vi.fn() })); // D218 (Captación): la ruta de Admin la importa

import { auth } from "@/server/auth";
import { coachInsights, coachPendingSignals, memberInsights } from "@/server/brain/coach";
import { brainMetrics, updateBrainPolicy } from "@/server/brain/admin";
import { subscribe } from "@/server/push/services";
import { GET as coachGET } from "@/app/api/coach/[orgId]/clients/[relId]/brain/route";
import { GET as gymGET } from "@/app/api/gym/[orgId]/members/[memberId]/brain/route";
import { GET as coachPendingGET } from "@/app/api/coach/[orgId]/brain/route";
import { GET as adminGET, PUT as adminPUT } from "@/app/api/admin/[[...path]]/route";
import { GET as pushGET, POST as pushPOST } from "@/app/api/push/[[...path]]/route";

const req = (url: string, method = "GET", payload?: unknown) => new Request(`https://repiclub.com${url}`, {
  method, headers: { "content-type": "application/json", origin: "https://repiclub.com" }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
});
const p = <T>(x: T) => ({ params: Promise.resolve(x) });
const session = (id: string | null) => vi.mocked(auth.api.getSession).mockResolvedValue((id ? { user: { id } } : null) as never);
beforeEach(() => { vi.clearAllMocks(); session(null); });

describe("sin sesión: 401 y el servicio no se toca", () => {
  it("todas las rutas nuevas y los métodos nuevos", async () => {
    const calls = [
      coachGET(req("/api/coach/o/clients/r/brain"), p({ orgId: "o", relId: "r" })),
      gymGET(req("/api/gym/o/members/m/brain"), p({ orgId: "o", memberId: "m" })),
      coachPendingGET(req("/api/coach/o/brain"), p({ orgId: "o" })),
      adminGET(req("/api/admin/brain"), p({ path: ["brain"] })),
      adminPUT(req("/api/admin/brain/policy", "PUT", { scope: "global", config: {} }), p({ path: ["brain", "policy"] })),
      pushPOST(req("/api/push/subscribe", "POST", { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" }, coaching: true }), p({ path: ["subscribe"] })),
      pushGET(req("/api/push"), p({ path: [] })),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(401);
    for (const f of [coachInsights, memberInsights, coachPendingSignals, brainMetrics, updateBrainPolicy, subscribe]) expect(f).not.toHaveBeenCalled();
  });
});

describe("con sesión", () => {
  it("el id de quien llama sale de la sesión; los parámetros de la ruta van tal cual", async () => {
    session("coach-1");
    expect((await coachGET(req("/api/coach/o/clients/r/brain"), p({ orgId: "o", relId: "r" }))).status).toBe(200);
    expect(coachInsights).toHaveBeenCalledWith("coach-1", "o", "r");
    session("sala-1");
    expect((await gymGET(req("/api/gym/o/members/m/brain"), p({ orgId: "o", memberId: "m" }))).status).toBe(200);
    expect(memberInsights).toHaveBeenCalledWith("sala-1", "o", "m");
    session("coach-2");
    expect((await coachPendingGET(req("/api/coach/o/brain"), p({ orgId: "o" }))).status).toBe(200);
    expect(coachPendingSignals).toHaveBeenCalledWith("coach-2", "o");
  });
  it("REPI Admin: métricas con días acotados por el servicio; política por PUT validada; otra ruta 404", async () => {
    session("admin-1");
    expect((await adminGET(req("/api/admin/brain?days=30"), p({ path: ["brain"] }))).status).toBe(200);
    expect(brainMetrics).toHaveBeenCalledWith("admin-1", { days: 30 });
    expect((await adminPUT(req("/api/admin/brain/policy", "PUT", { scope: "global", config: { user_daily_calls: 5 } }), p({ path: ["brain", "policy"] }))).status).toBe(200);
    expect(updateBrainPolicy).toHaveBeenCalledWith("admin-1", { scope: "global", config: { user_daily_calls: 5 } });
    expect((await adminPUT(req("/api/admin/brain/policy", "PUT", { scope: "global" }), p({ path: ["brain", "policy"] }))).status).toBe(400);
    expect((await adminPUT(req("/api/admin/otra", "PUT", {}), p({ path: ["otra"] }))).status).toBe(404);
  });
  it("push: `coaching` opcional, booleano; sin él, el registro de siempre", async () => {
    session("socio-1");
    const body = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } };
    expect((await pushPOST(req("/api/push/subscribe", "POST", { ...body, coaching: true }), p({ path: ["subscribe"] }))).status).toBe(200);
    expect(subscribe).toHaveBeenLastCalledWith("socio-1", body, null, { coaching: true });
    expect((await pushPOST(req("/api/push/subscribe", "POST", body), p({ path: ["subscribe"] }))).status).toBe(200);
    expect(subscribe).toHaveBeenLastCalledWith("socio-1", body, null, { coaching: false });
    expect((await pushPOST(req("/api/push/subscribe", "POST", { ...body, coaching: "sí" }), p({ path: ["subscribe"] }))).status).toBe(400);
  });
});
