# REPI Experience Hub — /conoce y /qr (D205)

Presentación comercial pública para quien escanea el QR de la remera (ATICMA Awards 2026) o recibe el enlace: dueños de gimnasio, entrenadores, deportistas, empresas e inversores. Estado: **en PR, sin publicar**; requiere la migración aditiva 0047 antes de integrar (ver §7).

## 1. Rutas

| Ruta | Qué es | Indexable |
| --- | --- | --- |
| `/conoce` | Presentación completa, estática (no lee sesión ni datos; carga rápida) | Sí, canónica |
| `/conoce/gimnasios`, `/entrenadores`, `/deportistas`, `/aliados` | La misma página con el perfil abierto, título y descripción propios. Para campañas | Sí, cada una canónica |
| `/qr` | QR permanente de la remera → hoy `/conoce?utm_source=qr&utm_medium=remera&utm_campaign=aticma-2026` | No (`noindex`, robots) |
| `/qr/<campaña>` | QR de otros materiales (`folleto`, `stand`, `gimnasios`, `entrenadores`). Clave desconocida → campaña de `/qr` | No |
| `/robots.txt`, `/sitemap.xml` | Nuevos. Indexan `/`, `/conoce*`, `/demo`, `/instalar`; excluyen app, APIs y `/qr` | — |

`/` (sitio público anterior) y `/demo` no cambian.

## 2. QR permanente

- Lo impreso apunta a `repiclub.com/qr`, nunca a `/conoce`. Se puede cambiar el destino sin reimprimir.
- Respuesta **307 temporal** con `Cache-Control: no-store` y `X-Robots-Tag: noindex`: ningún navegador ni proxy memoriza el destino. `Location` es relativa (siempre el mismo dominio).
- **Sin redirección abierta:** los destinos son una lista cerrada en `src/lib/qr.ts` (`QR_DESTINATIONS`). La URL no puede elegir el destino.
- **Cambiar el destino:**
  - Editar `QR_CAMPAIGNS.default.to` en `src/lib/qr.ts` (PR y deploy).
  - Sin tocar código: variable `REPI_QR_DESTINATION` en Vercel (por ejemplo `/demo`) y redeploy. Sólo acepta destinos de la lista y sólo afecta a `/qr`.
- **Nuevo material:** sumar una clave en `QR_CAMPAIGNS` (destino + UTM) e imprimir `repiclub.com/qr/<clave>`. Así cada pieza se mide por separado.
- El escaneo lo cuenta el servidor (funciona aunque el teléfono bloquee scripts). Más de 30 por minuto desde una IP siguen redirigiendo pero no se cuentan.

QR impreso listo en `marketing/qr-remera/` (SVG y PNG, corrección Q, verificado). Probar con iPhone y Android en la tela real antes de la tirada.

## 3. Estructura de la página

1. **Inicio:** «Cada repetición cuenta.», propuesta de valor, captura real de Training Intelligence. CTA «Explorá REPI» y «Probar una demo». Línea de validación: Smart Center Gym, Mar del Plata.
2. **¿Qué querés conocer?:** selector de 4 perfiles (pestañas accesibles, flechas del teclado). Cada perfil:
   - problema, solución y 4 beneficios;
   - su demo real y su captura (o video, cuando exista);
   - CTA contextual (formulario preseleccionado o reunión) y WhatsApp con mensaje precompletado.
   Al elegir un perfil, la URL cambia a `/conoce/<perfil>` para compartirla.
3. **Inteligencia que se explica:** cómo funciona Training Intelligence en cuatro pasos y un **simulador con el motor real** (`recommendExercise` + `adjustAfterSet` de `@repi/domain`). Al lado, la IA generativa real (borradores de programa, «No vino el profe», lectura de historiales y asistente del dueño), con sus límites.
3b. **Mirá cómo funciona:** grabaciones reales de la app (sin audio, con subtítulos). Cargan sólo al tocar «Reproducir». La sección aparece sólo si hay videos con archivo.
4. **No te lo contamos. Probalo.:** las 4 demos guiadas reales (`POST /api/demo`). Cada tarjeta dice qué se ve, para quién es y cuántos pasos tiene.
5. **Lo que REPI ya hace:** 12 funciones con estado («Disponible», «se activa por gimnasio», «primera etapa»), captura real y «Verla en la demo». En el teléfono, carrusel horizontal.
6. **Caso real:** Smart Center Gym, sin cifras ni testimonios.
7. **Cómo se empieza:** los cinco pasos del alta comercial actual.
8. **Preguntas frecuentes.**
9. **Solicitá una demo de REPI:** WhatsApp, email, mensajes rápidos y formulario.

Barra inferior en el teléfono («Probar la demo» y WhatsApp): aparece después del inicio, se oculta junto al formulario y la página deja su espacio abajo.

**Diseño:** sitio público navy (D188) con secciones claras en el crema de la app (`--ui-page`), Barlow / Barlow Condensed, logo original y tokens existentes. Sin librerías nuevas.

## 4. Contenido editable

Todo el texto comercial está en **`src/content/conoce.ts`**: perfiles, funciones, demos, videos, pasos y preguntas frecuentes. Regla: sólo capacidades presentes y probadas (`ESTADO_Y_LIMITES.md`, `docs/FEATURE_FLAGS.md`). Contacto en `src/lib/contact.ts`, campañas QR en `src/lib/qr.ts`.

- **Capturas** (`public/conoce/shots/*.webp`, 600 px, unos 30 KB cada una): de la demo guiada local, con datos ficticios.
  - Para regenerarlas: build local, `next start` contra `repi_dev` y el script de capturas (Playwright, viewport 390×844, tema claro, sin la píldora de la demo). Ver PROXIMA_SESION.
- **Imagen para compartir:** `public/conoce/og.png` (1200×630). Se generó con la marca y una captura real.
- **Videos:** completar `src`, `poster`, `duration` y, si hay voz, `captions` (.vtt) en `VIDEOS` de `src/content/conoce.ts`. Archivos en `public/conoce/videos/` (MP4 H.264, menos de 8 MB) o una URL propia.
  - Sin `src`, la página muestra la captura real: nunca un reproductor vacío.
  - Con `src`, el video carga sólo al tocar «Reproducir» (`preload="none"`).
  - Guiones de los que faltan: [VIDEOS_PENDIENTES.md](VIDEOS_PENDIENTES.md).

## 5. Contacto y conversión

| Acción | Destino | Medición |
| --- | --- | --- |
| Solicitar una demo (formulario) | `/api/access/lead` → `commercial_lead` → REPI Admin › Contactos | `form_submit`; con reunión, `meeting_request` |
| Hablar por WhatsApp | `wa.me/5492235383082` con mensaje según la intención | `whatsapp_click` |
| Email | `mailto:sovare.studio@gmail.com` | `email_click` |
| Probar una demo | `POST /api/demo` (rol) → la app con la guía abierta | `demo_click`, `demo_start`, `demo_error` |
| Simulador | En la página | `intel_try` |

Formulario:
- Tipo: gimnasio, entrenador, o empresa/alianza (`partner`, nuevo).
- Datos: nombre, gimnasio o marca (opcional para aliados), email **o** WhatsApp, mensaje.
- Antispam: campo trampa invisible, envío en menos de 2 s descartado en silencio y el límite existente de 5 por minuto por IP.
- Guarda el origen anónimo de la visita (`source`, `campaign`, `interest`). REPI Admin lo muestra en cada contacto. Los aliados no tienen «Dar de alta».
- El formulario anterior (`/` y Acceso) sigue igual.

**Demos:** el límite por IP pasó de 6 a 20 por hora. En un evento muchos teléfonos comparten IP (wifi del lugar o CGNAT de la operadora). El tope global de 300 demos abiertas y la purga a las 6 h no cambian.

## 6. Medición

**Sin herramientas nuevas ni de terceros.** Eventos propios en la tabla `site_event` (0047):
- Sin cookies, IP, user agent ni cuenta. Un identificador aleatorio por pestaña (`sessionStorage`) agrupa una visita.
- Origen: `qr` / `utm` / `referral` / `direct`, con sus UTM.
- Si el navegador envía Global Privacy Control o Do Not Track, no se manda nada.
- Retención: 400 días (job diario `purge-media`).
- Por ser anónimo y sin almacenamiento persistente en el dispositivo, no requiere banner de consentimiento. Revisar si cambia la política de privacidad.

**Eventos:** `landing_view`, `qr_scan`, `profile_select`, `video_play`, `video_progress` (25/50/75), `video_complete`, `demo_click`, `demo_start`, `demo_error`, `intel_try`, `feature_click`, `whatsapp_click`, `email_click`, `contact_click`, `form_submit` y `meeting_request`.

**Dónde verlo:** REPI Admin › **Sitio y QR** (7, 30, 90 o 365 días). Muestra:
- escaneos por campaña y visitas desde el QR frente a otros orígenes;
- un embudo con QR y resto separados;
- el perfil elegido, las demos iniciadas y fallidas, y los contactos por origen;
- visitas por UTM y por día.

**Cómo interpretarlo:**
- **Escaneos frente a visitas del QR:** si hay muchos más escaneos, la página tarda en cargar o se abre sin JavaScript. Revisar en un teléfono con datos móviles.
- **Visitas QR → perfil elegido:** mide si el inicio despierta interés. Si es bajo (menos del 30 %), probar otro texto o captura en el inicio.
- **Perfil elegido:** qué público trajo la remera. Ajustar el discurso del evento.
- **Demo tocada → demo iniciada:** una caída indica `demo_error` (límite por IP o demasiadas demos abiertas). Si aparece en el evento, revisar el límite.
- **WhatsApp, formulario y reunión:** son las oportunidades. Cruzarlas con REPI Admin › Contactos (origen QR y campaña) y con el WhatsApp recibido.
- **Cautela:** son pestañas, no personas. Quien bloquea scripts o pide no ser rastreado no aparece, salvo en los escaneos. Las cantidades pequeñas no permiten conclusiones.

## 7. Seguridad y publicación

- La página no requiere sesión ni muestra datos reales. Las demos usan el mecanismo existente (entorno ficticio propio por visita, sin credenciales visibles, borrado a las 6 h). La demo abre su propia sesión en ese navegador; la página lo advierte.
- La ruta de eventos aplica la defensa CSRF de siempre (`handle`), un límite de 240 pedidos por minuto por IP (hasta 3 eventos cada uno), un máximo de 4 KB por pedido y un vocabulario cerrado. El escaneo sólo lo registra `/qr`.
- **Migración 0047 (aditiva):**
  - Crea la tabla `site_event` (con RLS) y tres columnas nulas en `commercial_lead`; el email deja de ser obligatorio.
  - `scripts/operations/hosted-0047.sql` se aplica en una transacción como `repi_app`.
  - Ensayo: `verify-0047.sh` (huella idéntica, RLS, sin permisos públicos, reintento que falla entero, reversión que se niega con contactos sólo de WhatsApp).
  - Reversión: `scripts/rollback/0047_experience_hub.down.sql`.
  - El código actual de producción funciona con 0047 aplicada.
- **Orden al aprobar:**
  1. Workflow «Respaldo» en verde.
  2. Aplicar `hosted-0047.sql`.
  3. Integrar el PR.
  4. Comprobar `/api/version`, `/conoce`, `/qr` (307 a `/conoce?...`), el formulario con un contacto de prueba identificado (y descartarlo en Admin), una demo y Admin › Sitio y QR.

## 8. Pendiente

- **Videos:** hay cuatro grabaciones reales de la demo (Training Intelligence, deportistas, entrenadores y gimnasios), en la sección «Mirá cómo funciona», en cada perfil y en la tarjeta de Training Intelligence. Falta el de aliados/inversores y, más adelante, versiones con locución. Ver [VIDEOS_PENDIENTES.md](VIDEOS_PENDIENTES.md).
- **Logo de Smart Center Gym:** autorizado por el gimnasio (07/11/2026) y publicado en «Caso real» (`public/conoce/smart-center-gym.webp`, convertido del SVG del kit con su tipografía). Falta un testimonio real cuando el gimnasio lo dé.
- **QR impreso:** listo en `marketing/qr-remera/`. SVG vectorial y PNG en navy sobre blanco y en blanco sobre navy, corrección Q, verificados con jsQR. Probar en la tela real antes de la tirada.
- **Aviso de nuevos contactos por email:** hoy se ven en REPI Admin (con contador). Un aviso por correo sería un cambio aparte.
