// Service worker de la app del alumno (Etapa 3). Sólo cachea la carcasa: HTML de /app, archivos estáticos con hash
// y la marca. Nunca cachea /api: los datos viven en IndexedDB bajo control de la app (dueño, borrado al salir).
const CACHE = "repi-shell-v1";
const SHELL = /^\/(app|brand\/|_next\/static\/|manifest\.webmanifest)/;
// En desarrollo se registra con ?mode=push: sólo avisos, sin caché (la caché interfiere con la recarga en caliente).
const PUSH_ONLY = new URL(self.location.href).searchParams.get("mode") === "push";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// La página avisa qué recursos ya cargó antes de que el service worker la controlara.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "cache" || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const u of e.data.urls) {
      try {
        const url = new URL(u, self.location.origin);
        if (url.origin !== self.location.origin || !SHELL.test(url.pathname) || url.pathname.startsWith("/api/")) continue;
        const res = await fetch(url, { credentials: "same-origin" });
        if (res.ok && !res.redirected) await c.put(url.pathname === "/app" ? "/app" : url.href, res);
      } catch { /* sin red: se intenta en la próxima carga */ }
    }
  })());
});

self.addEventListener("fetch", (e) => {
  if (PUSH_ONLY) return;
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Navegación a /app o al inicio desde el ícono ("/"): red primero (recibe la versión nueva), carcasa guardada si no hay red.
  if (req.mode === "navigate" && (url.pathname === "/app" || url.pathname === "/")) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (url.pathname === "/app" && res.ok && !res.redirected) (await caches.open(CACHE)).put("/app", res.clone());
        return res;
      } catch {
        const shell = await caches.match("/app");
        if (shell && url.pathname === "/") return Response.redirect(new URL("/app", self.location.origin), 302);
        return shell || new Response("Sin conexión", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }
  // Estáticos con hash y marca: caché primero (no cambian).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/")) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
  }
});

// Push (anexo 26/10 §7). El texto llega mínimo desde el servidor: sin nombres ni datos en la pantalla bloqueada.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const title = typeof d.title === "string" ? d.title : "REPI";
  e.waitUntil(self.registration.showNotification(title, {
    body: typeof d.body === "string" ? d.body : "Tenés una novedad en REPI",
    tag: typeof d.tag === "string" ? d.tag : undefined, renotify: true,
    icon: "/brand/repi_icon.png", badge: "/brand/repi_icon.png",
    data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/acceso?step=workspace" },
  }));
});
// Al tocar el aviso se abre (o enfoca) REPI en la pantalla correspondiente; la sesión y los permisos se revalidan ahí.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = all.find((c) => new URL(c.url).pathname === url.pathname);
    if (same) { await same.focus(); return same.navigate(url.href); }
    return self.clients.openWindow(url.href);
  })());
});
