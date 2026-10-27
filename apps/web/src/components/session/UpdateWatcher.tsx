"use client";
// Actualización de la PWA sin perder datos (D92). Al volver a la app (y cada 30 min) compara la versión de la página con la
// desplegada. Si cambió: primero intenta sincronizar la cola offline; sólo con la cola vacía ofrece «Actualizar». Un
// fragmento de la versión anterior que ya no existe (ChunkLoadError) recarga una vez, también sólo sin pendientes.
import { useEffect, useState } from "react";
import { flush, pendingFor } from "@/lib/offline/queue";

const CHECK_MS = 30 * 60_000;
const current = () => document.querySelector<HTMLMetaElement>('meta[name="repi-version"]')?.content ?? "dev";
async function safeToReload() {
  let pending = await pendingFor().catch(() => 0);
  if (pending && navigator.onLine) { await flush().catch(() => {}); pending = await pendingFor().catch(() => 1); }
  return pending === 0;
}
async function reload() {
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* sin service worker */ }
  window.location.reload();
}

export function UpdateWatcher() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (current() === "dev") return;
    let last = 0, busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible" || !navigator.onLine || Date.now() - last < 60_000) return;
      busy = true; last = Date.now();
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = (await r.json()) as { v: string };
        if (v && v !== current() && await safeToReload()) setReady(true);
      } catch { /* sin red: se reintenta al volver */ } finally { busy = false; }
    };
    const chunkFailed = async (e: PromiseRejectionEvent) => {
      const err = e.reason as { name?: string; message?: string } | undefined;
      if (err?.name !== "ChunkLoadError" && !/Loading chunk|Failed to fetch dynamically imported module/.test(err?.message ?? "")) return;
      const key = `repi:chunk-reload:${current()}`;
      if (sessionStorage.getItem(key) || !await safeToReload()) { setReady(true); return; }
      sessionStorage.setItem(key, "1");
      await reload();
    };
    const t = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    window.addEventListener("unhandledrejection", chunkFailed);
    void check();
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check); window.removeEventListener("unhandledrejection", chunkFailed); };
  }, []);
  if (!ready) return null;
  return (
    <div className="up-bar" role="status">
      <span>Hay una versión nueva de REPI.</span>
      <button type="button" onClick={() => void reload()}>Actualizar</button>
      <button type="button" aria-label="Más tarde" onClick={() => setReady(false)}>×</button>
    </div>
  );
}
