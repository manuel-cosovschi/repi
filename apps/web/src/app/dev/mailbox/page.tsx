import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

// Buzón de desarrollo (T05). No existe en producción.
export default async function DevMailbox() {
  if (process.env.NODE_ENV === "production") notFound();
  const mails = await db.select().from(schema.devMailbox).orderBy(desc(schema.devMailbox.createdAt)).limit(30);
  return (
    <main style={{ padding: 24, background: "#F3F5F8", color: "#0B0F14", minHeight: "100dvh", fontFamily: "var(--font-ui)" }}>
      <p style={{ font: "500 11px var(--font-mono)", color: "#8A5300", textTransform: "uppercase" }}>Entorno de desarrollo · correos no enviados</p>
      <h1 style={{ marginTop: 4 }}>Buzón DEV</h1>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {mails.map((m) => (
          <li key={m.id} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14 }}>
            <strong>{m.subject}</strong> <small style={{ color: "#5B6B80" }}>→ {m.to} · {m.createdAt.toLocaleString("es-AR")}</small>
            <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontFamily: "var(--font-mono)", fontSize: 13 }}>{m.body}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}
