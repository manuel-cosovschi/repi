import { db, schema } from "@/db";

export type Mail = { to: string; subject: string; body: string };

// Adaptador de correo (T05). Sin proveedor configurado (D24) sólo existe el buzón DEV.
// En producción falla de forma explícita en lugar de fingir un envío.
export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("No hay proveedor de email configurado (docs/DECISIONS.md D24)");
  }
  await db.insert(schema.devMailbox).values(mail);
}
