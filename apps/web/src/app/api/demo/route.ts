import { cookies } from "next/headers";
import { z } from "zod";
import { body, handle, limit } from "@/server/access/http";
import { auth } from "@/server/auth";
import { DEMO_ROLES, sealDemo, startDemo } from "@/server/sandbox/services";

// Demo guiada (D85): crea un entorno ficticio propio y abre la sesión del perfil elegido. Sin cuenta ni contraseña.
export const POST = handle(async (req) => {
  // D205: 20 por hora por IP (antes 6). En un evento muchos teléfonos salen por la misma IP (wifi del lugar o CGNAT de la
  // operadora). El tope global de demos abiertas (MAX_ACTIVE) y la purga a las 6 h siguen iguales.
  await limit("demo-start", 20, 3_600_000);
  const { role } = await body(req, z.object({ role: z.enum(DEMO_ROLES as [string, ...string[]]) }));
  const d = await startDemo(role as (typeof DEMO_ROLES)[number]);
  await auth.api.signInEmail({ body: d.signIn }); // nextCookies deja la cookie de sesión en esta respuesta
  await sealDemo(d.tag);
  // Marca no sensible para que la app muestre el recorrido guiado (el rol real se confirma con /api/demo/me).
  (await cookies()).set("repi_demo", d.role, { path: "/", maxAge: 6 * 3600, sameSite: "lax" });
  return { href: d.href, role: d.role, expiresAt: d.expiresAt };
});
