// Errores que Next captura fuera de nuestras rutas (páginas, componentes de servidor, acciones): mismo registro sin datos
// sensibles y el mismo aviso por email (D149). Las rutas API ya lo hacen en `handle()`.
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logErrorAt } = await import("./server/log");
  logErrorAt(`next.${context.routeType}`, err, `${request.method} ${request.path.split("?")[0]}`);
}
