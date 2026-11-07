# Videos del Experience Hub (D205): hechos y pendientes

## Ya publicados en /conoce (07/11/2026)

Grabaciones reales de la demo guiada local (datos ficticios, la app tal cual), en vertical 720×1558, sin audio, con subtítulos y títulos en pantalla (Barlow / Barlow Condensed). H.264, `faststart`, menos de 1,5 MB cada uno. Póster WebP. Están en `apps/web/public/conoce/videos/`.

| Id | Duración | Qué muestra |
| --- | --- | --- |
| `f-intelligence` | 0:33 | Press de banca: «Tu profe indicó», «REPI recomienda 53 kg × 8», «¿Por qué?». La serie sale en 5 repeticiones y el objetivo siguiente baja a 50 kg × 8–10 con su explicación |
| `perfil-deportistas` | 0:42 | Inicio, entrenamiento con registro y descanso, evolución por ejercicio y objetivo de peso privado |
| `perfil-entrenadores` | 0:34 | Panel, clientes, ficha y rendimiento de Valentina, programas versionados y mensajes |
| `perfil-gimnasios` | 0:50 | Ejecutivo, alta de Camila por QR (método de validación y aprobación), comunidad y la sala: «Quiero que venga un entrenador» → «Voy» |

**Regenerarlos:** build local + `next start` sobre `repi_dev`. El guion de grabación (Playwright + screencast de Chrome + ffmpeg) quedó en el checkpoint de PROXIMA_SESION. Si cambia la interfaz, regrabar para que el video siga siendo fiel.

## Pendientes

Antes del 07/11 no había videos de producto. El único archivo era `documentacion/motion/previews/REPI_motion_M01-M05_60fps.mp4`, que es la animación del logo y las transiciones (motion M01–M05). Puede servir de apertura o cierre de estos videos, pero no los reemplaza.

Para cambiar o sumar uno: `VIDEOS` en `apps/web/src/content/conoce.ts`. Al completar `src`, aparece con «Reproducir» en lugar de la captura. Con voz, sumar `captions` (.vtt). Las versiones de abajo con locución, música y animación son una segunda etapa; las grabaciones de arriba ya cubren los perfiles de gimnasio, entrenador y deportista, y Training Intelligence. **Falta el de aliados/inversores (4)**, que necesita una pieza narrativa (no alcanza con la grabación de la app).

## Cómo producirlos

- **Material:** grabación de pantalla de la demo guiada (`repiclub.com/demo` o local), siempre con datos ficticios.
  - Teléfono: 390×844 a 2×, tema claro, guía cerrada (`sessionStorage repi:tour:<rol> = {"i":0,"open":false}`).
  - Escritorio: 1366×860.
  - Playwright graba video del navegador; el proyecto `design/motion` (HyperFrames) compone textos, transiciones y marca.
- **Estilo:**
  - Concepto 2 · G · Atlética: navy `#0B0F14`, cian `#00D1FF`, turquesa `#5DE6D8`, crema `#F4F1EA`.
  - Barlow y Barlow Condensed (títulos en mayúsculas), logo original. Música sin voz o voz en español rioplatense.
- **Formato:** MP4 H.264, 1080p (horizontal) o 1080×1920 (vertical, `vertical: true`), menos de 8 MB, póster en WebP.
  - Si hay voz, subtítulos `.vtt` en español (`captions`). Si no hay voz, textos en pantalla.
- **Reglas de contenido:**
  - Sólo funciones disponibles (`ESTADO_Y_LIMITES.md`). Sin cifras de clientes ni resultados; sin promesas médicas ni de resultados físicos.
  - Body Intelligence sólo en su etapa actual. Smart Center sólo como lugar donde funciona.
  - No mostrar datos ni nombres reales.
- **Cierre común (3 s):** logo y «Probalo sin cuenta en repiclub.com/conoce».

## Grupo A · por tipo de usuario

### 1. REPI para gimnasios (`perfil-gimnasios`)
- **Para:** dueños y gerencia. **Duración:** 60–75 s, horizontal (también un corte vertical de 30 s).
- **Mensaje:** «Que cada socio sienta que tiene un entrenador, y que vos veas lo que pasa en la sala».
- **Guion:**
  1. **Problema (0–8 s):** rutina en papel, el profe no llega a todos, el dueño no ve la sala. Texto sobre navy.
  2. **Alta (8–20 s):** el socio escanea el QR de la sede y recepción aprueba a Camila. *Demo dueño › Solicitudes de acceso.*
  3. **Socio entrenando (20–35 s):** programa del día y serie con «REPI recomienda». *Demo alumno › Entrenar.*
  4. **Ayuda (35–48 s):** el socio marca «Que venga alguien» y Sofía toca «Voy». *Demo entrenador de sala › Mi turno.*
  5. **Visibilidad (48–62 s):** Ejecutivo y Equipo y servicio. *Demo dueño.*
  6. **Cierre:** «Sin instalar equipos ni cargar padrones» + CTA.
- **CTA:** «Consultá para tu gimnasio».

### 2. REPI para entrenadores personales (`perfil-entrenadores`)
- **Para:** personal trainers. **Duración:** 60 s.
- **Mensaje:** «Tus alumnos, sus programas y sus resultados en un solo lugar».
- **Guion:**
  1. **Problema:** planillas, capturas y chats.
  2. **Panel:** quién entrenó y qué atender. *Demo coach › Panel.*
  3. **Programa:** armar o duplicar; métodos (drop set) y versión. *Programas.*
  4. **Alumno:** la serie con objetivo. *Demo alumno.*
  5. **Ficha:** rendimiento con 1RM estimado y volumen. *Clientes › Valentina.*
  6. **Organización:** pedido de técnica, chat y registro de cobro. *Solicitudes, Mensajes, Cobros.*
- **CTA:** «Soy entrenador y quiero usarlo».

### 3. REPI para alumnos y deportistas (`perfil-deportistas`)
- **Para:** quien entrena. **Duración:** 30–45 s, **vertical**.
- **Mensaje:** «Sabé qué hacer en cada serie y mirá cómo progresás».
- **Guion:**
  1. Inicio: «Hola, Valentina».
  2. Comenzar el entrenamiento: check-in y «Saltar».
  3. Serie: Anterior · REPI recomienda · Real; completar la serie y ver el descanso.
  4. Progreso: gráfico y récord.
  5. Mi cuerpo: objetivo de peso (privado).
  6. «Funciona sin señal».
- **CTA:** «Pedile REPI a tu gimnasio» o «Probá la demo».

### 4. REPI, empresa de tecnología (`perfil-aliados`)
- **Para:** empresas, inversores y aliados. **Duración:** 75–90 s, horizontal.
- **Mensaje:** «Tecnología de entrenamiento que ya funciona en un gimnasio real».
- **Guion:**
  1. **Problema del mercado:** gimnasios y entrenadores independientes sin datos de la sala.
  2. **Modelo B2B2C:** clientes (gimnasios y coaches) y usuarios (socios y alumnos). Suscripción por cantidad acordada, sin cifras.
  3. **Diferencial:** Training Intelligence explicable (simulador de `/conoce`), IA para borradores, offline y privacidad por permisos.
  4. **Evidencia:** en funcionamiento en Smart Center Gym, Mar del Plata (sin números).
  5. **Equipo y visión:** Sovare, «Cada repetición cuenta».
- **CTA:** «Agendá una reunión».

## Grupo B · funciones

| Id sugerido | Función | Duración | Material de la demo | Mensaje |
| --- | --- | --- | --- | --- |
| `f-intelligence` (ya reservado) | Training Intelligence | 30 s vertical | Alumno › Entrenar › Press de banca: 53 kg × 8, «¿Por qué?»; completar 5 reps → mensaje «bajá un poco la carga» | Un objetivo por serie, con la razón; nunca sube a mitad de sesión |
| `f-registro` | Registro de cada serie | 20 s | Alumno: completar series, descanso automático, «Molestia», cambiar ejercicio | Carga, reps y RIR con un toque |
| `f-progreso` | Progreso por ejercicio | 20 s | Alumno › Progreso › Evolución por ejercicio | Fuerza, cargas y récords desde lo que registrás |
| `f-cuerpo` | Mi cuerpo (etapa 1) | 20 s | Alumno › Progreso › Mi cuerpo: peso, objetivo y comparador de fotos | Privado; medidas en desarrollo |
| `f-ia` | IA para borradores | 30 s | Coach › Nuevo programa › «Armar con REPI»; alumno › «No vino el profe» (con la clave de IA configurada) | Una propuesta que una persona revisa |
| `f-alumnos` | Gestión de alumnos | 25 s | Coach › Clientes › Valentina (Resumen, Rendimiento) | Cada alumno a fondo |
| `f-sala` | Seguimiento de sala | 25 s | Entrenador de sala › Mi turno → «Voy» → Sala → Traspaso | El equipo responde con seguimiento |
| `f-altas` | Altas por QR y acceso | 20 s | Dueño › Solicitudes de acceso → Aprobar; Accesos y QR | Sin papeles ni padrones |

Para sumar uno de la tabla: agregarlo a `VIDEOS` y poner `video: "<id>"` en la función correspondiente de `FEATURES`.
