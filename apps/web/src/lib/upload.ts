// Subida de videos (D71): directa al almacenamiento con URL firmada cuando el entorno la ofrece; si no, por /api.
// El progreso se informa de 0 a 1. Los mensajes de error vienen del servidor en español.
import { api } from "./api";

type Begin = { id: string | null; upload: { url: string; method: "PUT"; headers: Record<string, string> } | null };

function send(method: string, url: string, body: XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress?: (p: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => {
      if (x.status < 300) return resolve(x.responseText);
      let msg = "No se pudo subir el video.";
      try { msg = JSON.parse(x.responseText || "{}").error ?? msg; } catch {}
      reject(new Error(msg));
    };
    x.onerror = () => reject(new Error("Se cortó la conexión mientras subía el video. Probá de nuevo."));
    x.send(body);
  });
}

export async function uploadVideo(p: { purpose: "request_video" | "attempt_video"; orgId?: string; file: File; legacyUrl: string; onProgress?: (p: number) => void }): Promise<{ id: string }> {
  const b = await api<Begin>("/api/uploads", { body: { purpose: p.purpose, orgId: p.orgId ?? null, mime: p.file.type, size: p.file.size } });
  if (!b.upload || !b.id) {
    const fd = new FormData(); fd.append("file", p.file);
    return JSON.parse(await send("POST", p.legacyUrl, fd, {}, p.onProgress));
  }
  await send(b.upload.method, b.upload.url, p.file, b.upload.headers, p.onProgress);
  return api<{ id: string }>(`/api/uploads/${b.id}`, { body: {} });
}
