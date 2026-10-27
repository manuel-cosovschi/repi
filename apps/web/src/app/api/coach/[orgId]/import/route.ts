import { z } from "zod";
import { CSV_MAX_ROWS } from "@repi/domain";
import { body, handle, limit, sessionUserId } from "@/server/access/http";
import { confirmImport, previewImport } from "@/server/access/import";

// Importación CSV de clientes (F-CO-11, D99): ?step=preview valida; confirmar invita sólo las filas válidas.
const S = z.object({ rows: z.array(z.object({ line: z.number().int(), name: z.string().max(200).nullable().optional(), email: z.string().max(320) })).max(CSV_MAX_ROWS) });
export const POST = handle<{ params: Promise<{ orgId: string }> }>(async (req, { params }) => {
  const me = await sessionUserId();
  const orgId = (await params).orgId;
  const { rows } = await body(req, S);
  if (new URL(req.url).searchParams.get("step") === "preview") { await limit(`import-preview:${me}`, 30); return previewImport(me, orgId, rows); }
  await limit(`import:${me}`, 5, 600_000);
  return confirmImport(me, orgId, rows);
});
