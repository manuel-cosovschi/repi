// Guía con IA para dueños y gerencia (D135). Dos partes: (1) «Primeros pasos» calculados con datos reales del gimnasio
// (sin IA, siempre disponibles) y (2) un asistente que responde cómo usar REPI y cómo manejar a los socios y al equipo,
// con la guía de REPI y sólo números agregados del gimnasio: nunca nombres, emails, mensajes ni datos de salud.
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AccessError } from "../access/util";
import { aiJson, aiOn } from "../ai/openai";
import { GYM_KB } from "../ai/gym-kb";
import { gymContext, needRoles } from "./services";
import { policyOf } from "./access-control";
import { connectOn } from "./connect";

const { gymLocation, locationJoinLink, staffMembership, invitation, gymMember, membershipRequest, programAssignment, communityPost, organization } = schema;
const count = sql<number>`count(*)::int`;

export type SetupStep = { key: string; title: string; detail: string; done: boolean; screen: string };

/** Estado del gimnasio para la guía: lo que ya está hecho y lo que falta, con números. */
export async function ownerSetup(actorId: string, orgId: string) {
  const ctx = await gymContext(actorId, orgId);
  needRoles(ctx, ["owner", "manager"]);
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [locs, links, staff, staffInv, members, pending, withProgram, posts] = await Promise.all([
    one(db.select({ n: count }).from(gymLocation).where(eq(gymLocation.orgId, orgId))),
    one(db.select({ n: count }).from(locationJoinLink).where(and(eq(locationJoinLink.orgId, orgId), isNull(locationJoinLink.revokedAt)))),
    one(db.select({ n: count }).from(staffMembership).where(and(eq(staffMembership.orgId, orgId), eq(staffMembership.status, "active"), ne(staffMembership.role, "owner")))),
    one(db.select({ n: count }).from(invitation).where(and(eq(invitation.orgId, orgId), eq(invitation.kind, "gym_staff"), eq(invitation.status, "pending")))),
    one(db.select({ n: count }).from(gymMember).where(and(eq(gymMember.orgId, orgId), eq(gymMember.status, "active")))),
    one(db.select({ n: count }).from(membershipRequest).where(and(eq(membershipRequest.orgId, orgId), eq(membershipRequest.status, "pending")))),
    one(db.select({ n: count }).from(programAssignment).innerJoin(gymMember, eq(gymMember.id, programAssignment.gymMemberId)).where(and(eq(gymMember.orgId, orgId), eq(programAssignment.status, "active")))),
    one(db.select({ n: count }).from(communityPost).where(eq(communityPost.orgId, orgId))),
  ]);
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
  const access = (await policyOf(orgId)).enabled;
  const steps: SetupStep[] = [
    { key: "qr", title: "QR de alta en cada sede", detail: links >= locs ? "Listo: imprimilo y pegalo en recepción." : `Te falta el QR de ${locs - links} sede${locs - links === 1 ? "" : "s"}.`, done: locs > 0 && links >= locs, screen: "accesses" },
    { key: "team", title: "Invitar a tu equipo", detail: staff ? `${staff} en el equipo${staffInv ? ` · ${staffInv} invitación${staffInv === 1 ? "" : "es"} sin aceptar` : ""}.` : staffInv ? `${staffInv} invitación${staffInv === 1 ? "" : "es"} esperando que creen su cuenta.` : "Sumá a tus entrenadores de sala y a recepción.", done: staff > 0, screen: "staff" },
    { key: "joins", title: "Aprobar a los socios que piden acceso", detail: pending ? `${pending} solicitud${pending === 1 ? "" : "es"} esperando.` : members ? "Sin solicitudes pendientes." : "Cuando escaneen el QR, aparecen acá.", done: pending === 0 && members > 0, screen: "joins" },
    { key: "programs", title: "Que cada socio tenga su programa", detail: members ? `${withProgram} de ${members} socios con programa.` : "Lo arma el equipo de sala desde la ficha de cada socio.", done: members > 0 && withProgram >= members, screen: "pc" },
    { key: "community", title: "Primera novedad para tus socios", detail: posts ? `${posts} publicaciones.` : "Un saludo, horarios o un desafío: lo ven en la app.", done: posts > 0, screen: "community" },
  ];
  return {
    steps, done: steps.filter((s) => s.done).length,
    facts: { sedes: locs, qrActivos: links, equipo: staff, invitacionesEquipoPendientes: staffInv, socios: members, solicitudesPendientes: pending, sociosConPrograma: withProgram, publicaciones: posts,
      controlDeAcceso: access, repiConnect: connectOn(org), rol: ctx.roles.includes("owner") ? "dueño" : "gerencia" },
  };
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["answer", "actions"],
  properties: {
    answer: { type: "string" },
    actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "screen"], properties: { label: { type: "string" }, screen: { type: "string" } } } },
  },
};
const SCREENS: Record<string, string> = {
  exec: "Ejecutivo", locs: "Sedes", pc: "Equipo y servicio", staff: "Equipo", reviews: "Reseñas", community: "Comunidad", validations: "Validaciones", joins: "Solicitudes de acceso",
  accesses: "Accesos y QR", billing: "Condiciones REPI", config: "Configuración", presence: "Acceso y presencia", connect: "Seguimiento de sala", reception: "Mostrador", guide: "Guía", notices: "Avisos",
};

export type AssistantMsg = { role: "user" | "assistant"; text: string };

export async function askOwnerAssistant(actorId: string, orgId: string, messages: AssistantMsg[]) {
  if (!aiOn()) throw new AccessError("ai_unavailable", "El asistente no está disponible en este momento. Mirá la «Guía».", 503);
  const setup = await ownerSetup(actorId, orgId);
  const hist = messages.slice(-6).map((m) => ({ role: m.role, text: m.text.slice(0, 600) }));
  if (!hist.length || hist[hist.length - 1].role !== "user" || !hist[hist.length - 1].text.trim()) throw new AccessError("invalid", "Escribí tu pregunta.");
  const system = `Sos la guía de REPI para ${setup.facts.rol} de un gimnasio en Argentina que recién empieza a usar la app. Respondé en español rioplatense, cálido y concreto. Hablás como REPI: nunca digas «IA», «modelo» ni «inteligencia artificial».
- Respuesta corta: hasta 5 oraciones o una lista de hasta 5 pasos con los nombres exactos de los botones y pantallas.
- Basate sólo en la GUÍA y en el ESTADO del gimnasio. Si algo no está en la guía, decí que no estás seguro y sugerí escribir a REPI desde «Ayuda». No inventes funciones.
- Para manejar socios y equipo, dá consejos prácticos de gestión (comunicación, primeras semanas, cómo pedirles que usen la app) además de los pasos en REPI.
- Nunca pidas ni muestres datos personales de socios. No des consejos médicos ni legales.
- En "actions" proponé hasta 2 pantallas para ir, con "screen" exactamente una de estas claves (clave = pantalla): ${Object.entries(SCREENS).map(([k, v]) => `${k} = «${v}»`).join(", ")}.

GUÍA:
${GYM_KB}

ESTADO (números agregados): ${JSON.stringify(setup.facts)}
Pasos iniciales: ${setup.steps.map((s) => `${s.title}: ${s.done ? "hecho" : "pendiente"} (${s.detail})`).join(" | ")}`;
  const conv = hist.map((m) => `${m.role === "user" ? "Pregunta" : "Respuesta anterior"}: ${m.text}`).join("\n");
  const out = await aiJson<{ answer: string; actions: { label: string; screen: string }[] }>({ name: "guia_duenio", system, parts: [{ type: "text", text: conv }], schema: SCHEMA, fast: true, maxTokens: 700, timeoutMs: 20_000 });
  return {
    answer: out.answer.slice(0, 1500),
    // El botón lleva el nombre real de la pantalla (no el que escriba el modelo), sin repetidos.
    actions: [...new Set((out.actions ?? []).map((a) => a.screen).filter((x) => x in SCREENS))].slice(0, 2).map((screen) => ({ label: SCREENS[screen], screen })),
  };
}
