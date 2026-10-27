// Registro de errores del servidor (N-O10). Va a los logs del hosting (Vercel). Nunca cuerpos, parámetros de consultas,
// tokens ni contenido de salud/chat: los errores de Drizzle traen la consulta con sus valores y se recortan antes.
export function logError(scope: string, e: unknown, req?: Request) {
  const err = e instanceof Error ? e : new Error(String(e));
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  const msg = err.message.split(/\nparams:/)[0].replace(/^Failed query: (\w+)[\s\S]*$/, "Failed query: $1").slice(0, 200);
  const where = req ? `${req.method} ${new URL(req.url).pathname}` : "";
  console.error(JSON.stringify({ level: "error", scope, where, name: err.name, msg, pg: cause?.code ?? null }));
}
