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

export async function previewHistoryImport<T>(body: unknown, onProgress: (progress: HistoryImportProgress) => void, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/me/history-import", {
    method: "POST", credentials: "same-origin", ...(signal ? { signal } : {}),
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(body),
  });
  return readHistoryImportResponse<T>(response, onProgress);
}

export type HistoryImportPart = { text: string; context: string };
export type HistoryImportJobStatus = { id: string; completed: number[]; total: number; phase: "reading" | "review" };

const aborted = () => new DOMException("Lectura cancelada", "AbortError");
/** Partes en paralelo y su tamaño (09/11): partes más chicas terminan dentro del plazo aunque el historial sea muy denso. */
export const HISTORY_READ_CONCURRENCY = 6;
export const HISTORY_PART_CHARS = 4_000;
/** El servidor tiene hasta 4 min por parte (divide y relee un bloque denso): el teléfono espera un poco más. */
export const HISTORY_PART_TIMEOUT_MS = 285_000;

/** Cada petición tiene un plazo; el historial completo puede continuar en otras peticiones. */
async function requestJson<T>(path: string, body: unknown | undefined, signal?: AbortSignal, timeoutMs = 75_000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw aborted();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", signal: controller.signal,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error ?? "No pudimos terminar esta parte. Podés continuar la lectura.", data?.code ?? "error", response.status);
    if (data == null) throw incomplete();
    return data as T;
  } catch (e) {
    if (signal?.aborted) throw aborted();
    if (controller.signal.aborted) throw new ApiError("Esta parte tardó demasiado. Podés continuar desde lo que ya se leyó.", "timeout", 408);
    if (e instanceof ApiError) throw e;
    throw new ApiError("Se interrumpió la conexión. Podés continuar desde lo que ya se leyó.", "network", 503);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

/** Un borrador por archivo. Sólo guarda en memoria el plan; el servidor confirma qué partes ya recibió. */
export class HistoryImportReadJob<T> {
  private id: string | null = null;
  private finished = false;
  private result: T | undefined;
  private done = new Set<number>();
  constructor(readonly fileName: string, readonly parts: HistoryImportPart[], private readonly sourceText: string, private readonly approx?: { sessions: number; from: string; to: string }) {}

  private status(value: HistoryImportJobStatus): HistoryImportJobStatus {
    if (!value || typeof value.id !== "string" || !value.id || value.total !== this.parts.length || !Array.isArray(value.completed)
      || !["reading", "review"].includes(value.phase) || this.id && value.id !== this.id
      || value.completed.some((index) => !Number.isInteger(index) || index < 0 || index >= this.parts.length)) throw incomplete();
    return value;
  }

  async read(onProgress: (progress: HistoryImportProgress) => void, signal?: AbortSignal): Promise<T> {
    if (this.finished) return this.result as T;
    if (signal?.aborted) throw aborted();
    let status: HistoryImportJobStatus;
    if (this.id) status = this.status(await requestJson<HistoryImportJobStatus>(`/api/me/history-import-job/${encodeURIComponent(this.id)}/status`, undefined, signal));
    else {
      const digest = globalThis.crypto?.subtle ? await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.sourceText)) : null;
      if (signal?.aborted) throw aborted();
      const inputHash = digest ? Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") : undefined;
      status = this.status(await requestJson<HistoryImportJobStatus>("/api/me/history-import-job", { fileName: this.fileName, parts: this.parts.length, ...(inputHash ? { inputHash } : {}), ...(this.approx ? { approx: this.approx } : {}) }, signal));
      this.id = status.id;
    }
    this.done = new Set(status.completed);
    onProgress({ stage: "reading", completed: this.done.size, total: this.parts.length });
    const missing = this.parts.map((_, index) => index).filter((index) => !this.done.has(index));
    let next = 0;
    let failed: unknown;
    const group = new AbortController();
    const abort = () => group.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) group.abort();
    try {
      const worker = async () => {
        while (!group.signal.aborted && next < missing.length) {
          const index = missing[next++];
          try {
            const ack = this.status(await requestJson<HistoryImportJobStatus>(`/api/me/history-import-job/${encodeURIComponent(this.id!)}/part`, { index, ...this.parts[index] }, group.signal, HISTORY_PART_TIMEOUT_MS));
            for (const completed of ack.completed) this.done.add(completed);
            if (!this.done.has(index)) throw incomplete();
            onProgress({ stage: "reading", completed: this.done.size, total: this.parts.length });
          } catch (e) { if (failed === undefined) failed = e; group.abort(); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(HISTORY_READ_CONCURRENCY, missing.length) }, worker));
      if (signal?.aborted) throw aborted();
      if (failed !== undefined) throw failed;
      if (this.done.size !== this.parts.length) throw incomplete();
    } finally { signal?.removeEventListener("abort", abort); }
    onProgress({ stage: "matching" });
    this.result = await requestJson<T>(`/api/me/history-import-job/${encodeURIComponent(this.id!)}/finish`, {}, signal);
    this.finished = true;
    onProgress({ stage: "review" });
    return this.result;
  }

  async remove(): Promise<void> {
    if (!this.id) return;
    await requestJson(`/api/me/history-import-job/${encodeURIComponent(this.id)}/remove`, {}, undefined, 20_000);
    this.id = null;
  }
}
