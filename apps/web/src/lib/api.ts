// Cliente de las rutas /api/access/*. Lanza Error con el mensaje en español del servidor.
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public data?: Record<string, unknown>) { super(message); }
}
export const SUPERVISED_EVENT = "repi:supervised";
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path.startsWith("/") ? path : `/api/access/${path}`, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  // REPI Control (D213): una pantalla vieja intentó algo que el gimnasio supervisado ya no permite (rutina propia, importar,
  // rutina de REPI). La app del alumno escucha este aviso y vuelve a leer su entrenamiento para ocultar esas opciones.
  if (res.status === 403 && data.code === "supervised" && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SUPERVISED_EVENT));
  if (!res.ok) throw new ApiError(data.error ?? "No pudimos completar la acción. Revisá tu conexión.", data.code ?? "error", res.status, data.data);
  return data as T;
}
