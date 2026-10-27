// Ejecutar con DATABASE_URL del entorno elegido. Sólo crea un ticket si no existe Admin.
// La URL privada se escribe en un archivo 0600 fuera del repositorio; nunca se imprime.
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { issueFirstAdminTicket } from "../src/server/admin/bootstrap";
import { sqlClient } from "../src/db";

try {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  if (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("El dominio del alta requiere HTTPS.");
  const ticket = await issueFirstAdminTicket();
  const dir = join(homedir(), ".repi-secrets");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const output = join(dir, "primer-admin.txt");
  const url = new URL("/activar-admin", origin);
  url.hash = ticket.token;
  await writeFile(output, `REPI — alta privada del primer administrador\n\n${url.href}\n\nVence: ${ticket.expiresAt.toISOString()}\nCreá tu cuenta con tu email real, verificá el correo y activá dos pasos. Después confirmá la administración. No compartas este enlace. Generar otro invalida éste.\n`, { mode: 0o600 });
  await chmod(output, 0o600);
  console.log(`Ticket generado. Enlace privado guardado en ${output}. Vence en 24 horas.`);
} catch (e) {
  console.error(e instanceof Error && 'code' in e ? 'No se emitió el ticket: comprobá que no exista un administrador.' : 'No se pudo preparar el alta. Revisá la conexión y el dominio.');
  process.exitCode = 1;
} finally { await sqlClient.end(); }
