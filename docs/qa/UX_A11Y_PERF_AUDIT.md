# UX, accesibilidad, responsive, PWA y rendimiento — Auditoría QA 29/10/2026

Este archivo consolida UX_AUDIT, ACCESSIBILITY_AUDIT, RESPONSIVE_AUDIT, PWA_AUDIT y PERFORMANCE_REPORT. Las fichas de cada defecto están en [BUG_REGISTER.md](BUG_REGISTER.md).

## UX

- **Corregidos:**
  - Cinco P1: UX-1, 2, 4, 5 y 6.
  - Cinco P2: UX-7 a 11.
  - Tres P3: UX-12 a 14.
  - QR-1 (P1, reportado por el titular): el QR de la sede ahora lleva directo a pedir el acceso (D152).
- **Falso positivo:** UX-3.
- **Patrón dominante:** acciones destructivas sin confirmación y dobles toques. Ahora:
  - Toda baja o revocación pide confirmación.
  - Un botón con `aria-busy` no acepta otro toque (regla global).
- **Verificado correcto:**
  - Los errores de API se muestran con el mensaje del servidor.
  - Los estados vacíos tienen texto.
  - No queda «IA» en la interfaz: se dice «REPI» (D141).
  - Los enlaces internos del sitio público responden (E2E).

## Accesibilidad (WCAG 2.2 A/AA)

- **Herramienta:** axe-core 4.11 dentro de Playwright. Falla con cualquier violación **seria o crítica** en:
  - 8 páginas públicas.
  - 4 pestañas principales del alumno.
  - Todas las secciones del menú de coach, dueño y profe de sala.
  - Cada página se mide en teléfono (Pixel 7) y en escritorio (1366×860).
- **Resultado final:** 0 violaciones serias o críticas en las pantallas recorridas. Las moderadas y menores se guardan como adjunto JSON de cada prueba en `apps/web/e2e-results/` (no se versiona).
- **Corregidos por axe:** AXE-1 a 6.
- **Corregidos por revisión:** A11Y-1 a 4.
- **A11Y-5** (el fondo se desplazaba en iOS con una hoja abierta) quedó corregido con `useScrollLock`.
- **No cubierto:**
  - Lector de pantalla real (VoiceOver/TalkBack).
  - Contenido detrás de interacciones que el recorrido no abre: hojas, modales, formularios llenos y estados de error.
  - Las pruebas corren con movimiento reducido, para medir sin animaciones a medio camino.

## Responsive

- **Automático (E2E):** sin scroll horizontal accidental en todas las pantallas recorridas, a 412 px (Pixel 7) y 1366 px.
  - La comprobación ignora elementos fijos y contenedores con `overflow` propio.
  - Las tablas anchas se desplazan dentro de su tarjeta.
- **Arreglos:**
  - Barra del chat sobre el área segura del iPhone (UX-10).
  - Campos a 16 px en táctil, sin zoom de iOS (A11Y-2).
- **No probado:** dispositivos físicos (LB-03), 320 px, horizontal y tablets.

## PWA

- **E2E:**
  - `manifest.webmanifest` con `name: REPI`, `display: standalone`, `scope: /` y `start_url` relativa. Todos los íconos responden 200.
  - `sw.js` responde y excluye `/api/` de la caché.
- **Revisión:** al cerrar sesión se borran las cachés y IndexedDB. El aviso de versión nueva es D92.
- **Offline:**
  - La cola de IndexedDB guarda inicio, series, pausas, sensación y cambios.
  - Después de DATA-7 ya no pierde un entrenamiento rechazado.
  - La reconexión recarga la app (UX-8).
- **No probado:** instalación real en Android/iOS y modo avión en un teléfono físico.

## Rendimiento

- **Medición:** build de producción local (`pnpm start`) con Chrome del sistema emulando un Pixel 7. Red «4G lento» (150 ms, 1,6 Mbps) y CPU ×4.
  - La primera página se midió con la caché vacía. Las siguientes reutilizan los chunks compartidos.
  - Evidencia de tipo **emulación**: no es campo real ni Lighthouse.

| Página | TTFB | FCP | load | JS transferido |
|---|---|---|---|---|
| `/` (caché fría) | 15 ms | 900 ms | 2,15 s | 165 KB |
| `/acceso` | 7 ms | 276 ms | 0,59 s | 185 KB |
| `/demo` | 4 ms | 232 ms | 0,36 s | 159 KB |

- **Interpretación:**
  - Bien para una PWA en teléfono de gama media.
  - El TTFB local no refleja Vercel ni Supabase (São Paulo/US).
  - En producción, D142 midió 2,3–3,8 s para la primera sugerencia de IA.
- **No medido:** LCP/INP de campo y la app autenticada con datos grandes (un gym con más de 200 socios ahora muestra un aviso: DATA-10).
