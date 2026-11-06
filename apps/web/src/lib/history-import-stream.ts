import { ApiError } from "./api";

export type HistoryImportProgress = { stage: "reading" | "matching" | "review"; completed?: number; total?: number };
export type HistoryImportEvent<T> = { type: "progress"; progress: HistoryImportProgress } | { type: "result"; data: T } | { type: "error"; error: string; code: string };

const incomplete = () => new ApiError("La lectura se interrumpió antes de terminar. Probá de nuevo; no se cargó el historial.", "incomplete", 422);
const validProgress = (p: HistoryImportProgress | undefined): p is HistoryImportProgress => !!p && ["reading", "matching", "review"].includes(p.stage)
  && (p.completed === undefined || Number.isInteger(p.completed) && p.completed >= 0)
  && (p.total === undefined || Number.isInteger(p.total) && p.total > 0)
  && (p.completed === undefined || p.total === undefined || p.completed <= p.total);

/** Lee hasta el final: una respuesta parcial, un error tardío o un corte nunca se presentan como una vista previa válida. */
export async function readHistoryImportResponse<T>(response: Response, onProgress: (progress: HistoryImportProgress) => void): Promise<T> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error ?? "No pudimos leer el historial. Probá de nuevo.", data?.code ?? "error", response.status);
    if (data == null) throw incomplete();
    return data as T; // Compatibilidad con clientes/servidores JSON.
  }
  if (!response.body) throw incomplete();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let result: T | undefined;
  let received = false;
  const line = (text: string) => {
    if (!text.trim()) return;
    let event: HistoryImportEvent<T>;
    try { event = JSON.parse(text) as HistoryImportEvent<T>; } catch { throw incomplete(); }
    if (event.type === "error") throw new ApiError(event.error || "No pudimos leer todo el historial.", event.code || "error", 422);
    if (event.type === "progress" && !received && validProgress(event.progress)) { onProgress(event.progress); return; }
    if (event.type === "result" && !received && event.data != null) { result = event.data; received = true; return; }
    throw incomplete();
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) { line(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
      if (done) break;
    }
    if (buffer.trim()) line(buffer);
    if (!received) throw incomplete();
    return result as T;
  } catch (e) {
    void reader.cancel().catch(() => {});
    if (e instanceof ApiError) throw e;
    throw incomplete();
  } finally { reader.releaseLock(); }
}

export async function previewHistoryImport<T>(body: unknown, onProgress: (progress: HistoryImportProgress) => void): Promise<T> {
  const response = await fetch("/api/me/history-import", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(body),
  });
  return readHistoryImportResponse<T>(response, onProgress);
}
