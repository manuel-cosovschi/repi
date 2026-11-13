// D205 · Experience Hub (/conoce). Todo el contenido comercial en un solo lugar: perfiles, funciones, videos, demos, preguntas y
// mensajes de contacto. Regla: sólo capacidades presentes en el producto (docs/comercial/ESTADO_Y_LIMITES.md, FEATURE_FLAGS.md).
// Nada de cifras, clientes, testimonios ni integraciones que no existan. Para sumar un video: completar `src` en VIDEOS.
import type { Profile } from "@/lib/site-events";

/** «control»: pantalla de rutinas de REPI Control (kiosco del gimnasio para consultar y registrar, sin recorrido guiado). */
export type DemoRole = "owner" | "floor" | "member" | "coach" | "control";

// ── Videos ──────────────────────────────────────────────────────────────────
// Un video sólo se muestra si tiene `src` (archivo en /public/conoce/videos o URL propia). Sin `src`, la página muestra la
// captura real y el botón a la demo: nunca un reproductor vacío. Guiones de los que faltan: docs/comercial/VIDEOS_PENDIENTES.md.
export type Video = {
  id: string; title: string; audience: string; src: string | null; poster: string | null; captions: string | null;
  /** «0:45». Sólo si el archivo existe. */
  duration: string | null; vertical?: boolean;
  /** Versión 9:16 para teléfonos en vertical (el reproductor la elige al abrir). */
  srcVertical?: string; posterVertical?: string;
  /** Con música. Sin esto, el video es sin audio (con textos en pantalla). */
  audio?: boolean;
  /** Título de la pista de Kevin MacLeod (CC BY 4.0): la atribución está en /creditos, enlazada desde el pie. */
  music?: string;
  /** Qué muestra el video, en una o dos oraciones: es lo único que acompaña al reproductor. */
  summary?: string;
  /** Pista WebVTT de descripciones escena por escena (los films no tienen voz): la usan los lectores de pantalla, no se ve.
   *  Generada desde los guiones con design/films/kit/tools/describe.py. */
  descriptionTrack?: string;
};
// Experience 4.0 (D219): se re-renderizaron film-marca (con versión 9:16 nueva), modo-control, modo-completo, perfil-gimnasios
// y f-intelligence (teléfono grande con cámara sobre la fila que se nombra, sin el parpadeo ni el fogonazo cian).
// Segunda tanda (13/11/2026): con el mismo kit se rehicieron perfil-deportistas (16:9 y 9:16), perfil-aliados, f-progreso,
// f-altas y f-sala: abren con el producto y suman material nuevo de la demo local.
// Experience 3.0 (D208): films de motion graphics con la interfaz real de la demo (datos ficticios), música instrumental con
// licencia comercial y efectos; sin voz ni locución. Se entienden sin sonido. Generados con design/films/kit/build.py
// (HyperFrames); licencias en marketing/videos/LICENCIAS.md. Los masters no van a Git.
const film = (id: string, title: string, audience: string, duration: string, music: string, summary: string, extra: Partial<Video> = {}): Video =>
  ({ id, title, audience, src: `/conoce/videos/${id}.mp4`, poster: `/conoce/videos/${id}.webp`, captions: null, duration, audio: true, music, summary,
    descriptionTrack: `/conoce/videos/${id}.descripcion.vtt`, ...extra });
export const VIDEOS: Record<string, Video> = {
  "film-marca": film("film-marca", "REPI · Cada repetición cuenta", "Todos", "0:38", "Heroic Age",
    "El socio entrena con su programa en el teléfono y un objetivo para cada serie, el entrenador sabe a quién atender y el gimnasio ve lo que pasa en su sala.",
    { srcVertical: "/conoce/videos/film-marca-vertical.mp4", posterVertical: "/conoce/videos/film-marca-vertical.webp" }),
  "perfil-gimnasios": film("perfil-gimnasios", "REPI para gimnasios", "Dueños y gerencia", "0:47", "Five Armies",
    "Altas por QR con aprobación del equipo, pedidos de ayuda en la sala, un objetivo para cada serie y el Seguimiento de sala del dueño."),
  "perfil-entrenadores": film("perfil-entrenadores", "REPI para entrenadores personales", "Personal trainers", "0:49", "Exciting Trailer",
    "Tus alumnos, sus programas y su progreso en un solo lugar, con borradores de la IA para revisar y mensajes con el contexto a mano."),
  "perfil-deportistas": film("perfil-deportistas", "REPI para alumnos y deportistas", "Quien entrena", "0:38", "Volatile Reaction",
    "Tu rutina lista en el teléfono, cómo llegás hoy en tres toques, un objetivo concreto para cada serie, el descanso que corre solo, tu progreso por ejercicio y tu peso con su objetivo, privado.",
    { srcVertical: "/conoce/videos/perfil-deportistas-vertical.mp4", posterVertical: "/conoce/videos/perfil-deportistas-vertical.webp" }),
  "perfil-aliados": film("perfil-aliados", "REPI, empresa de tecnología deportiva", "Empresas, inversores y aliados", "0:48", "Rising Game",
    "Una plataforma B2B2C: gimnasios y entrenadores la contratan, sus alumnos la usan cada vez que entrenan y un motor propio explica cada recomendación."),
  "f-intelligence": film("f-intelligence", "Training Intelligence en una serie", "Todos", "0:28", "Volatile Reaction",
    "Propone el peso y las repeticiones de cada serie según tu historial, con la razón a la vista, y se ajusta cuando registrás lo que hiciste."),
  "f-progreso": film("f-progreso", "Progreso por ejercicio", "Quien entrena", "0:23", "Clash Defiant",
    "Tus mejores marcas, la evolución de cada ejercicio y el 1RM estimado, armados con las series que registrás; y tu peso con su objetivo, privado."),
  "f-altas": film("f-altas", "Altas por QR con aprobación", "Gimnasios", "0:26", "Five Armies",
    "El gimnasio muestra el QR de la sede, el socio lo escanea y pide acceso, y el equipo confirma quién es socio."),
  "f-sala": film("f-sala", "Seguimiento de sala", "Gimnasios", "0:27", "Clash Defiant",
    "El socio pide ayuda al equipo de sala desde la app, la profesora de turno ve el pedido y lo toma, el socio ve quién lo tomó y el gimnasio sigue cuántos pedidos se resuelven."),
  // Modalidades (escena «Dos formas de entrenar»). Sin `src` el botón del video no se muestra.
  // D215: un film por modalidad (16:9 y 9:16), grabados en la demo real (datos ficticios).
  "modo-completo": film("modo-completo", "REPI Completo · Entrenamiento inteligente", "Gimnasios, entrenadores y socios", "0:53", "Volatile Reaction",
    "El profesor diseña y asigna el programa, el socio lo recibe y registra cada serie con el objetivo de REPI y su razón, ve su progreso por ejercicio, el profesor consulta su evolución y el equipo de sala responde un pedido.",
    { srcVertical: "/conoce/videos/modo-completo-vertical.mp4", posterVertical: "/conoce/videos/modo-completo-vertical.webp" }),
  "modo-control": film("modo-control", "REPI Control · Tu equipo planifica. Tus socios consultan y registran.", "Gimnasios", "1:00", "Clash Defiant",
    "El profesor programa y asigna la rutina; el socio se identifica en la pantalla del gimnasio con su código y su PIN, ve ejercicios, peso sugerido, intensidad y descansos, y registra los pesos y las repeticiones reales. Su historial se actualiza, el profesor ve los resultados y el celular es opcional.",
    { srcVertical: "/conoce/videos/modo-control-vertical.mp4", posterVertical: "/conoce/videos/modo-control-vertical.webp" }),
};
/** Orden del centro audiovisual (sólo se muestran los que tienen archivo). */
export const VIDEO_ORDER = ["film-marca", "f-intelligence", "perfil-deportistas", "perfil-entrenadores", "perfil-gimnasios", "perfil-aliados", "f-progreso", "f-altas", "f-sala", "modo-completo", "modo-control"];

// ── Hero (Experience 3.0) ───────────────────────────────────────────────────
// Variantes preparadas para probar titulares y propuesta en el futuro (`/conoce?v=b`), sin plataforma externa. «a» es la vigente.
export type HeroVariant = "a" | "b";
export const HERO_VARIANTS: Record<HeroVariant, { title: string[]; sub: string; lead: string }> = {
  a: { title: ["Cada repetición", "cuenta."], sub: "El entrenamiento, los entrenadores y tu gimnasio. Todo conectado.",
    lead: "Cada socio con su programa en el teléfono y un objetivo para cada serie. Cada entrenador sabe a quién atender. El dueño ve su sala." },
  b: { title: ["Tu sala,", "conectada."], sub: "Socios, entrenadores y gimnasio alrededor de cada serie.",
    lead: "Programas en el teléfono, registro de cada serie, Training Intelligence con explicación y seguimiento real del equipo." },
};

// ── Demos reales (POST /api/demo) ───────────────────────────────────────────
// Los pasos salen del recorrido guiado real (components/demo/DemoTour.tsx). Entorno ficticio propio por visita, se borra a las 6 h.
/** `steps`: pasos del recorrido guiado; null si la demo no tiene guía (la pantalla de rutinas se explora sola). */
export type Demo = { role: DemoRole; title: string; persona: string; forWho: string; sees: string[]; steps: number | null; shot: string };
export const DEMOS: Demo[] = [
  { role: "owner", title: "Explorá REPI como gimnasio", persona: "Martín, dueño de Gym Norte (dos sedes)", forWho: "Dueños, gerencia y recepción",
    sees: ["Tablero por sede: socios en REPI, sesiones registradas y satisfacción", "Altas por QR: aprobás a Camila en un toque", "Ingreso validado con QR que cambia cada 30 s", "Seguimiento de sala, equipo y comunidad"], steps: 10, shot: "/conoce/shots/owner.webp" },
  { role: "floor", title: "El día del entrenador de sala", persona: "Sofía, entrenadora en turno en Palermo", forWho: "Entrenadores de piso y coordinación",
    sees: ["Un socio pide ayuda desde su serie y te llega a la bandeja de sala", "Bandeja de sala y traspaso de turno con historial", "Ficha del socio: programa, notas y molestias"], steps: 7, shot: "/conoce/shots/floor.webp" },
  { role: "member", title: "Viví la experiencia del alumno", persona: "Valentina, socia de Gym Norte y alumna de Agustín", forWho: "Quien entrena (y quien quiere ver qué recibe su socio)",
    sees: ["Training Intelligence: anterior, recomendado y real en cada serie", "Entrenar con descanso automático, incluso sin señal", "Progreso, chat con el coach y el gimnasio en la app"], steps: 8, shot: "/conoce/shots/member.webp" },
  { role: "coach", title: "Las herramientas del personal trainer", persona: "Agustín, personal trainer con tres alumnos", forWho: "Personal trainers y estudios",
    sees: ["Panel: quién entrenó y qué necesita tu atención", "Ficha con rendimiento, 1RM estimado y volumen", "Programas versionados, pedidos, chat y cobros"], steps: 8, shot: "/conoce/shots/coach.webp" },
  { role: "control", title: "La pantalla del gimnasio", persona: "un socio frente a la pantalla de rutinas del gimnasio", forWho: "Gimnasios que planifican con REPI Control",
    sees: ["Te identificás con tu código de socio y tu PIN", "Consultás la rutina que te asignó el equipo o registrás tu entrenamiento", "En cada serie: objetivo del profesor, sugerencia de REPI y resultado real", "En la pantalla no hace falta email, contraseña ni instalar nada"], steps: null, shot: "/conoce/shots/control-rutina.webp" },
];

// ── Funciones (Grupo B del centro audiovisual) ──────────────────────────────
export type FeatureStatus = "available" | "per_gym" | "stage" ;
export const STATUS_LABEL: Record<FeatureStatus, string> = { available: "Disponible", per_gym: "Disponible · se activa por gimnasio", stage: "Disponible · primera etapa" };
export type Feature = {
  id: string; title: string; value: string; points: string[]; status: FeatureStatus; note?: string;
  demo: DemoRole | null; href?: string; shot: string; shotAlt: string; video?: string; profiles: Profile[];
};
export const FEATURES: Feature[] = [
  { id: "intelligence", title: "Training Intelligence", value: "Un objetivo concreto para cada serie, con la razón a la vista.",
    points: ["Compara con tu historial equivalente y propone carga y repeticiones", "Después de cada serie mantiene o baja la exigencia; nunca sube a mitad de sesión", "Respeta lo que indicó el profe y explica cada número"],
    status: "available", demo: "member", shot: "/conoce/shots/intelligence.webp", shotAlt: "Serie con columnas Anterior, REPI recomienda y Real en la app de REPI", video: "f-intelligence", profiles: ["deportistas", "entrenadores", "gimnasios", "aliados"] },
  { id: "registro", title: "Registro de cada serie", value: "Carga, repeticiones, RIR, descanso y sensación con un toque.",
    points: ["El descanso corre solo", "Si la máquina está ocupada, cambiás o salteás el ejercicio", "Lo que ya abriste sigue guardándose sin señal"],
    status: "available", demo: "member", shot: "/conoce/shots/training.webp", shotAlt: "Pantalla de entrenamiento en curso en REPI", profiles: ["deportistas", "gimnasios"] },
  { id: "progreso", title: "Progreso por ejercicio", value: "Fuerza, cargas, repeticiones, volumen y récords desde lo que registrás.",
    points: ["Gráficos por ejercicio y por período", "1RM estimado con la fórmula de Epley (estimación, no medición)", "Tu historial anterior a REPI también suma"],
    status: "available", demo: "member", shot: "/conoce/shots/progress.webp", shotAlt: "Gráfico de evolución de un ejercicio en REPI", video: "f-progreso", profiles: ["deportistas", "entrenadores"] },
  { id: "cuerpo", title: "Mi cuerpo", value: "Peso, objetivo y fotos de progreso privadas, sólo para vos.",
    points: ["Peso corporal y objetivo con su gráfico", "Fotos privadas con comparador", "Calorías estimadas por entrenamiento, como rango"],
    status: "stage", note: "Para adultos. Todavía no registra medidas corporales. No es un diagnóstico.", demo: "member", shot: "/conoce/shots/body.webp", shotAlt: "Objetivo de peso con su avance en Mi cuerpo", profiles: ["deportistas"] },
  { id: "ia", title: "IA que arma borradores", value: "Propuestas de programa y de rutina del día que una persona revisa.",
    points: ["El profe describe objetivo, días y limitaciones; REPI propone un programa para editar", "«No vino el profe»: qué hacer hoy y con qué cargas, y se rearma si una máquina está ocupada", "Lee tu historial desde una planilla, texto, foto o PDF"],
    status: "available", note: "Nada se asigna solo. Si la IA no responde, REPI arma la propuesta con reglas.", demo: "member", shot: "/conoce/shots/adaptive.webp", shotAlt: "Pantalla Entrenar con «No vino el profe, dame mi rutina para hoy»", profiles: ["deportistas", "entrenadores", "gimnasios", "aliados"] },
  { id: "alumnos", title: "Gestión de alumnos", value: "Cada alumno a fondo, en una sola pantalla.",
    points: ["Sesiones, rendimiento, objetivos y salud compartida con permiso", "Invitación personal o importación desde una planilla", "Agenda de sesiones presenciales u online"],
    status: "available", demo: "coach", shot: "/conoce/shots/clients.webp", shotAlt: "Lista de clientes del personal trainer con su adherencia", profiles: ["entrenadores"] },
  { id: "programas", title: "Programas y métodos", value: "Programas por días, con métodos avanzados y versiones.",
    points: ["Series, repeticiones, RIR, descanso y notas", "Drop sets, back-off, rest-pause, cluster, AMRAP y series por tiempo", "Cada cambio queda versionado"],
    status: "available", demo: "coach", shot: "/conoce/shots/programs.webp", shotAlt: "Editor de programas de REPI", profiles: ["entrenadores", "gimnasios"] },
  { id: "mensajes", title: "Mensajes y pedidos", value: "La conversación con cada alumno, con el contexto a mano.",
    points: ["Chat privado por relación, separado de tu WhatsApp", "Pedidos de técnica o de cambios que se resuelven y avisan", "Cobros a alumnos registrados a mano (REPI no mueve dinero)"],
    status: "available", demo: "coach", shot: "/conoce/shots/messages.webp", shotAlt: "Mensajes privados entre el coach y sus alumnos", profiles: ["entrenadores"] },
  { id: "sala", title: "Seguimiento de sala", value: "El socio pide ayuda desde su serie y el equipo responde.",
    points: ["Avisos en vivo y cola de asistencia", "Traspaso de turno con lo que se hizo y lo que falta", "Tiempos de respuesta y si le sirvió al socio"],
    status: "per_gym", demo: "floor", shot: "/conoce/shots/floor.webp", shotAlt: "Turno del entrenador de sala en REPI", video: "f-sala", profiles: ["gimnasios"] },
  { id: "altas", title: "Altas por QR y acceso", value: "Un QR por sede; el equipo confirma quién es socio.",
    points: ["La persona crea su cuenta y pide acceso", "Recepción, gerencia o sala aprueban", "Ingreso validado con un QR que se renueva cada 30 s (opcional)"],
    status: "available", note: "El control de ingreso se activa por gimnasio. REPI no cobra la cuota del gimnasio.", demo: "owner", shot: "/conoce/shots/access.webp", shotAlt: "Solicitudes de acceso por QR en REPI", video: "f-altas", profiles: ["gimnasios"] },
  { id: "tablero", title: "Vista del dueño", value: "Tu gimnasio de un vistazo, por sede.",
    points: ["Socios en REPI, sesiones registradas y satisfacción", "Equipo y servicio: tareas, tiempos y reseñas", "Permisos por rol: dueño, gerencia, recepción y entrenadores"],
    status: "available", demo: "owner", shot: "/conoce/shots/owner.webp", shotAlt: "Tablero ejecutivo del gimnasio en REPI", profiles: ["gimnasios", "aliados"] },
  { id: "comunidad", title: "Comunidad y desafíos", value: "Novedades, descuentos y desafíos que dan motivos para volver.",
    points: ["Desafíos con premio y ranking", "Publicaciones voluntarias con moderación del gimnasio", "Cada socio elige si participa y qué comparte"],
    status: "available", demo: "owner", shot: "/conoce/shots/community.webp", shotAlt: "Comunidad del gimnasio en REPI", profiles: ["gimnasios", "deportistas"] },
];

// ── Perfiles ────────────────────────────────────────────────────────────────
export type ProfileContent = {
  id: Profile; label: string; short: string; kicker: string; headline: string; intro: string;
  problem: string; solution: string[]; benefits: { title: string; text: string }[];
  demo: DemoRole; video: string; leadKind: "gym" | "coach" | "partner" | null; whatsapp: string; cta: string;
  meta: { title: string; description: string };
  /** Mención breve de las modalidades (sólo gimnasios): enlaza a la escena #modos. */
  modes?: string;
};
export const PROFILE_CONTENT: Record<Profile, ProfileContent> = {
  gimnasios: {
    id: "gimnasios", label: "Tengo un gimnasio", short: "Gimnasios", kicker: "Para dueños y gerencia",
    headline: "Que cada socio sienta que tiene un entrenador.",
    intro: "REPI lleva la rutina, el registro y el seguimiento al teléfono de cada socio, y le da a tu equipo de sala las herramientas para atender mejor.",
    problem: "La rutina en papel se pierde, el profe no llega a todos y el dueño no ve qué pasa en la sala hasta que alguien se da de baja.",
    solution: ["Cada socio entrena con su programa en el teléfono y registra cada serie", "Training Intelligence le propone un objetivo por serie, con la razón", "El socio pide ayuda desde su ejercicio y el equipo responde con seguimiento", "Vos ves las sesiones registradas y el servicio del equipo, por sede"],
    benefits: [
      { title: "Un servicio que se nota", text: "Programa, progreso y comunidad en la app: un diferencial concreto frente a otros gimnasios." },
      { title: "Tu equipo rinde más", text: "Avisos en vivo, cola de pedidos y traspaso de turno: nadie queda sin atender." },
      { title: "Altas sin papeles", text: "QR por sede, la persona pide acceso y tu equipo confirma. Sin cargar padrones." },
      { title: "Visibilidad real", text: "Socios en REPI, sesiones registradas y respuesta del equipo por sede, con permisos por rol." },
    ],
    demo: "owner", video: "perfil-gimnasios", leadKind: "gym",
    whatsapp: "Hola, conocí REPI y me interesa implementarlo en mi gimnasio. Quisiera coordinar una demostración.", cta: "Consultar para mi gimnasio",
    modes: "Dos modalidades: REPI Completo, con la app de cada socio, o REPI Control, con planificación supervisada y una pantalla en el gimnasio donde el socio consulta y registra.",
    meta: { title: "REPI para gimnasios · Entrenamiento y seguimiento de cada socio", description: "REPI Completo, con la app de cada socio y Training Intelligence, o REPI Control, con planificación supervisada y una pantalla en el gimnasio para consultar y registrar el entrenamiento." },
  },
  entrenadores: {
    id: "entrenadores", label: "Soy entrenador personal", short: "Entrenadores", kicker: "Para personal trainers",
    headline: "Tus alumnos, sus programas y sus resultados en un solo lugar.",
    intro: "Armás programas en minutos, ves cómo entrena cada alumno y respondés con contexto. REPI se ocupa de lo repetitivo.",
    problem: "Planillas, capturas y mensajes sueltos: cuesta saber quién entrenó, cómo rindió y qué ajustar.",
    solution: ["Programas por días con métodos avanzados, versionados y asignados", "Cada alumno registra sus series y vos ves rendimiento y volumen", "Training Intelligence propone el objetivo de cada serie respetando tu plan", "Pedidos, chat y cobros ordenados por alumno"],
    benefits: [
      { title: "Menos tareas repetitivas", text: "Duplicás programas, importás alumnos desde una planilla y pedís a la IA un borrador para editar." },
      { title: "Seguimiento individual", text: "Rendimiento con 1RM estimado, volumen, objetivos y salud compartida con permiso." },
      { title: "Un servicio profesional", text: "Tu alumno tiene su app, su progreso y un canal con vos separado de tu WhatsApp." },
      { title: "Tu trabajo ordenado", text: "Agenda de sesiones y registro de cobros: quién pagó y quién debe." },
    ],
    demo: "coach", video: "perfil-entrenadores", leadKind: "coach",
    whatsapp: "Hola, soy entrenador personal y quiero usar REPI con mis alumnos. ¿Me cuentan cómo empezar?", cta: "Soy entrenador y quiero usarlo",
    meta: { title: "REPI para entrenadores personales · Alumnos, programas y seguimiento", description: "Gestioná alumnos, programas versionados, rendimiento, mensajes y cobros. Training Intelligence propone cada serie respetando tu plan." },
  },
  deportistas: {
    id: "deportistas", label: "Entreno y quiero conocer REPI", short: "Deportistas", kicker: "Para quien entrena",
    headline: "Sabé qué hacer en cada serie y mirá cómo progresás.",
    intro: "Tu rutina en el teléfono, cada serie registrada en segundos y un objetivo claro para la próxima.",
    problem: "Entrenar sin saber cuánto levantaste la última vez ni si estás progresando.",
    solution: ["Tu programa del día, con el descanso que corre solo", "Anterior, REPI recomienda y Real en cada serie", "Gráficos de fuerza, cargas, volumen y récords", "Si no vino el profe, REPI te dice qué hacer hoy"],
    benefits: [
      { title: "Cada serie con objetivo", text: "Training Intelligence mira tu historial y te propone carga y repeticiones, con la explicación." },
      { title: "Tu progreso a la vista", text: "Récords, evolución por ejercicio y tu peso con su objetivo, en privado." },
      { title: "Funciona en la sala", text: "Sin señal, lo que abriste sigue guardándose y se sincroniza después." },
      { title: "Tus datos son tuyos", text: "Elegís qué compartís con tu coach o tu gimnasio. Descargás o pedís borrar tus datos." },
    ],
    demo: "member", video: "perfil-deportistas", leadKind: null,
    whatsapp: "Hola, conocí REPI y me gustaría que mi gimnasio lo use. ¿Cómo lo hacemos?", cta: "Quiero REPI en mi gimnasio",
    meta: { title: "REPI para deportistas · Tu rutina, cada serie y tu progreso", description: "Rutina en el teléfono, objetivo por serie con Training Intelligence, progreso por ejercicio y entrenamiento sin señal." },
  },
  aliados: {
    id: "aliados", label: "Soy empresa, inversor o aliado", short: "Aliados", kicker: "Para empresas, inversores y aliados",
    headline: "Tecnología de entrenamiento que ya se usa en una sala real.",
    intro: "REPI es una plataforma B2B2C: gimnasios y entrenadores la contratan y sus alumnos la usan cada vez que entrenan.",
    problem: "Muchos gimnasios y entrenadores independientes gestionan el entrenamiento con papel, planillas y mensajería, sin datos de lo que pasa en la sala.",
    solution: ["Gimnasios y personal trainers como clientes; socios y alumnos como usuarios", "Suscripción por cliente según socios o alumnos acordados", "Motor propio de recomendaciones explicables (Training Intelligence) más IA generativa para borradores", "Web app instalable: funciona en iPhone y Android, sin tiendas"],
    benefits: [
      { title: "Producto en operación", text: "En funcionamiento en Mar del Plata y en proceso de implementación en varios gimnasios más de Mar del Plata, Balcarce y Tandil." },
      { title: "Diferencial técnico", text: "Recomendaciones deterministas con explicación, registro sin conexión y privacidad por permisos." },
      { title: "Modelo claro", text: "Un acuerdo por cliente con cantidad y precio unitario; no depende de descargas." },
      { title: "Abierto a alianzas", text: "Cadenas, equipamiento, salud y distribución: conversemos cómo sumar valor." },
    ],
    demo: "owner", video: "perfil-aliados", leadKind: "partner",
    whatsapp: "Hola, conocí REPI y me interesa conversar sobre una alianza o inversión. ¿Podemos coordinar una reunión?", cta: "Proponer una alianza",
    meta: { title: "REPI · Empresa de tecnología para el entrenamiento", description: "Plataforma B2B2C para gimnasios, entrenadores y alumnos, en operación en Mar del Plata. Alianzas e inversión." },
  },
};

// ── Modalidades: un mismo REPI, dos formas de entrenar (D215) ───────────────
// No son perfiles: son dos maneras de implementar REPI en un gimnasio, con la misma plataforma y otra política. REPI configura
// la modalidad de cada gimnasio. Sólo capacidades presentes en el producto (FEATURES de src/lib/features.ts y REPI Control,
// D213). Nada de precios ni de «más barato»: el precio sale de una propuesta personalizada.
export const MODE_IDS = ["completo", "control"] as const;
export type ModeId = (typeof MODE_IDS)[number];
/** Lo que el formulario manda y se guarda en commercial_lead.product_mode (sólo para gimnasios). */
export const PRODUCT_MODES = ["completo", "control", "undecided"] as const;
export type ProductMode = (typeof PRODUCT_MODES)[number];
/** Cómo se lee la modalidad elegida en REPI Admin (Contactos, Sitio y QR) y en las notas del prospecto de ventas. */
export const PRODUCT_MODE_LABEL: Record<string, string> = { completo: "REPI Completo", control: "REPI Control", undecided: "Todavía no sabe" };
export const isModeId = (x: unknown): x is ModeId => typeof x === "string" && (MODE_IDS as readonly string[]).includes(x);
/** `portrait`: captura de teléfono dentro del marco apaisado (se muestra entera, sin recortar). */
export type ModeScreen = { src: string; alt: string; label: string; portrait?: boolean };
export type ModeContent = {
  id: ModeId; name: string; tag: string; claim: string; pitch: string; features: string[]; benefits: { title: string; text: string }[];
  /** Equipo principal del escenario: el teléfono del socio (Completo) o la pantalla del gimnasio, apaisada (Control). */
  device: "phone" | "screen";
  /** Pantallas reales del escenario, en el orden del recorrido. */
  screens: ModeScreen[];
  /** El teléfono que acompaña, con su leyenda. */
  aside: ModeScreen & { caption: string };
  film: string; demo: DemoRole; demoLabel: string; cta: string; whatsapp: string;
  /** Cómo se habilita, si no viene encendida para todos. */
  availability?: string;
};
export const MODES: Record<ModeId, ModeContent> = {
  completo: {
    id: "completo", name: "REPI Completo", tag: "Entrenamiento inteligente", claim: "Toda la experiencia de entrenamiento inteligente.",
    pitch: "Cada socio tiene REPI en su teléfono: entrena con el programa que le arma el equipo, registra cada serie y ve cómo progresa. Training Intelligence le propone un objetivo para cada serie y el equipo sigue a cada uno.",
    features: [
      "Programas diseñados y asignados por el equipo, con cada cambio versionado",
      "App del socio: programa del día, registro de cada serie y descanso que corre solo",
      "Historial y progreso por ejercicio",
      "Training Intelligence y el Asistente REPI, con «No vino el profe»",
      "Rutinas propias del socio e importación desde planilla, texto, foto o PDF",
      "Herramientas para profesores, seguimiento de sala y gestión del gimnasio",
      "Comunidad, desafíos y las demás funciones que el gimnasio active",
    ],
    benefits: [
      { title: "Un servicio que se nota", text: "Programa, progreso y comunidad en el teléfono de cada socio." },
      { title: "Más autonomía", text: "El socio sabe qué hacer en cada serie, aunque no esté el profe." },
      { title: "El equipo llega a todos", text: "Ve quién entrenó, cómo rindió y quién pide ayuda." },
    ],
    device: "phone",
    screens: [
      { src: "/conoce/shots/training.webp", alt: "Sesión de entrenamiento en la app de REPI", label: "Programa del día" },
      { src: "/conoce/shots/intelligence.webp", alt: "Serie con Anterior, REPI recomienda y Real en la app de REPI", label: "Objetivo por serie" },
      { src: "/conoce/shots/progress.webp", alt: "Evolución de un ejercicio en REPI", label: "Progreso" },
      { src: "/conoce/shots/adaptive.webp", alt: "«No vino el profe, dame mi rutina para hoy» en REPI", label: "No vino el profe" },
    ],
    aside: { src: "/conoce/shots/programs.webp", alt: "Editor de programas del equipo en REPI", label: "El equipo planifica", caption: "El equipo arma y asigna cada programa" },
    film: "modo-completo", demo: "member", demoLabel: "Probar la app del socio", cta: "Quiero REPI Completo",
    whatsapp: "Hola, quiero conocer REPI Completo para mi gimnasio.",
  },
  control: {
    id: "control", name: "REPI Control", tag: "Planificación supervisada", claim: "Tu equipo planifica. Tus socios consultan y registran.",
    pitch: "Los programas los arma y los cambia sólo el personal autorizado. En una pantalla del gimnasio, con su código de socio y un PIN personal, el socio consulta su rutina y registra lo que hizo en cada serie: en la pantalla no hace falta email, contraseña ni instalar nada. Consulta y registra, pero no modifica lo programado. La app es opcional.",
    features: [
      "Programas a cargo exclusivo del personal autorizado, con historial de versiones y permisos por rol",
      "Pantalla de rutinas en el gimnasio: una tablet o un monitor",
      "Acceso con código de socio y PIN personal: en la pantalla no hace falta email, contraseña ni instalar nada",
      "En cada serie: objetivo del profesor, sugerencia de REPI y resultado real",
      "Lo registrado va al mismo historial: progreso del socio y seguimiento del profesor",
      "El socio no crea, importa ni modifica rutinas ni lo programado (series, cargas y descansos), ni le pide a la IA un programa propio",
      "La IA ayuda al profesor a preparar borradores; nada se asigna solo",
      "App opcional: la misma rutina y el mismo historial en el teléfono",
    ],
    benefits: [
      { title: "Criterio profesional", text: "Cada rutina la arma y la ajusta tu equipo; el socio no la puede cambiar." },
      { title: "Simple para cualquier socio", text: "Consulta y registra con código y PIN en la pantalla del gimnasio. Sin descargas ni contraseñas que recordar." },
      { title: "Datos para tu equipo", text: "Lo que hace cada socio queda en su historial y el profesor lo ve." },
    ],
    device: "screen",
    screens: [
      { src: "/conoce/shots/control-bienvenida.webp", alt: "Pantalla de rutinas de REPI Control en el gimnasio: bienvenida", label: "Bienvenida" },
      { src: "/conoce/shots/control-identificar.webp", alt: "El socio ingresa su código de socio y su PIN en la pantalla de rutinas", label: "Código y PIN" },
      { src: "/conoce/shots/control-rutina.webp", alt: "La rutina del socio en la pantalla de rutinas del gimnasio: en cada serie, el objetivo del profesor, la sugerencia de REPI y la última vez", label: "Su rutina" },
      { src: "/conoce/shots/control-registro.webp", alt: "El socio carga en la pantalla del gimnasio el peso y las repeticiones reales de su serie de Sentadilla, junto a lo que indicó el profesor y lo que sugiere REPI", label: "Registra lo que hizo" },
      { src: "/conoce/shots/control-equipo.webp", alt: "El equipo del gimnasio en REPI: ficha del socio con su programa y el historial de versiones", label: "El equipo planifica", portrait: true },
    ],
    aside: { src: "/conoce/shots/training.webp", alt: "La rutina del socio en la app de REPI", label: "App opcional", caption: "App opcional: la misma rutina y el mismo historial en el teléfono" },
    film: "modo-control", demo: "control", demoLabel: "Probar la pantalla del gimnasio", cta: "Quiero REPI Control",
    whatsapp: "Hola, quiero conocer REPI Control para mi gimnasio.",
    availability: "Disponible · REPI la activa por gimnasio, con la pantalla que ponga la sede",
  },
};
/** «Qué cambia y qué no»: `same` = igual en las dos (un solo texto); `policy` = cambia según la política del gimnasio. */
export type ModeRow = { label: string } & ({ kind: "same"; both: string } | { kind: "policy"; completo: string; control: string });
export const MODE_ROWS: ModeRow[] = [
  { label: "Quién crea las rutinas", kind: "policy", completo: "El equipo; el socio también puede armar las suyas", control: "Sólo el personal autorizado" },
  { label: "Quién puede modificarlas", kind: "policy", completo: "El equipo, y cada socio sus rutinas propias", control: "Sólo el personal autorizado; el socio consulta y registra, pero no modifica lo programado" },
  { label: "Cómo accede el socio", kind: "policy", completo: "Con su cuenta en la app", control: "Código de socio y PIN personal, después de un alta única como socio" },
  { label: "Consulta en pantalla compartida", kind: "policy", completo: "App de cada socio", control: "Pantalla del gimnasio, para consultar y registrar, y app opcional" },
  { label: "Consulta en la app", kind: "policy", completo: "Sí: es el centro de la experiencia", control: "Opcional: la misma rutina y el mismo historial" },
  { label: "Registro de entrenamientos", kind: "policy", completo: "Cada serie, desde la app", control: "Cada serie, en la pantalla del gimnasio o en la app opcional, sin cambiar lo programado" },
  { label: "Rutinas de la IA para el socio, por su cuenta", kind: "policy", completo: "Sí, como propuesta: «No vino el profe» y la rutina del día", control: "No: el socio no genera ni se asigna programas" },
  { label: "Permisos institucionales", kind: "policy", completo: "Roles del equipo: dueño, gerencia, recepción y entrenadores", control: "Los mismos roles; sólo quien tiene permiso de programar cambia una rutina" },
  { label: "Seguimiento del progreso", kind: "same", both: "Historial y progreso por ejercicio, con lo que se registra" },
  { label: "Herramientas para profesores", kind: "same", both: "Programas por días, métodos avanzados, versiones y ficha de cada socio" },
  { label: "IA asistiendo al profesor", kind: "same", both: "Prepara borradores que el profesor revisa; nada se asigna solo" },
  { label: "Herramientas de gestión", kind: "same", both: "Equipo, sedes, permisos por rol y seguimiento por sede" },
];

// ── Implementación (proceso real del anexo comercial) ───────────────────────
export const STEPS: [string, string][] = [
  ["Conversamos", "Nos contás cómo trabajás: sedes, equipo o cantidad de alumnos. Te mostramos la demo."],
  ["Acordamos", "Alcance, cantidad de socios o alumnos y precio por cada uno. Sin letra chica."],
  ["Habilitamos", "REPI registra el acuerdo, habilita tu espacio e invita al responsable."],
  ["Preparás", "Sumás a tu equipo; en un gimnasio, armás las sedes y sus QR."],
  ["A entrenar", "Los alumnos se suman con tu invitación y los socios con el QR de su sede."],
];

// ── Preguntas frecuentes ────────────────────────────────────────────────────
export const FAQ: [string, string][] = [
  ["¿Qué es REPI?", "Una plataforma de entrenamiento y gestión para gimnasios, entrenadores personales y sus alumnos. El alumno entrena con su programa en el teléfono y registra cada serie; el entrenador y el gimnasio siguen su progreso y atienden mejor."],
  ["¿Sirve para gimnasios y para entrenadores independientes?", "Sí. Un gimnasio tiene sedes, equipo con permisos por rol, altas por QR y seguimiento de sala. Un personal trainer gestiona sus alumnos, programas, mensajes y cobros. Una misma persona puede entrenar con su coach y con su gimnasio desde la misma cuenta."],
  ["¿Qué necesita un gimnasio para implementarlo?", "Definir las sedes, quién aprueba las altas y la cantidad de socios del acuerdo. REPI habilita el espacio, el equipo se suma con invitación y cada sede tiene su QR. No hace falta cargar el padrón. En REPI Control, el gimnasio pone la pantalla: una tablet o un monitor."],
  ["¿Qué diferencia hay entre REPI Completo y REPI Control?", "Es la misma plataforma con otra política. En REPI Completo cada socio usa la app: entrena con su programa, registra cada serie, ve su progreso y también puede armar sus rutinas. En REPI Control los programas los arma y los cambia sólo el personal autorizado; el socio los consulta y registra lo que hizo en una pantalla del gimnasio con su código y su PIN, o en la app, que es opcional. Puede registrar su entrenamiento, pero no modificar lo programado."],
  ["¿El socio tiene que instalar una app en REPI Control?", "No. En la pantalla del gimnasio (una tablet o un monitor), con su código de socio y un PIN personal, consulta su rutina y registra su entrenamiento, sin email ni contraseña. Lo registrado va a su historial y lo ve el profesor. El alta como socio se hace una sola vez. La app es opcional: muestra la misma rutina y el mismo historial."],
  ["¿Se puede cambiar de modalidad?", "Sí. REPI configura la modalidad de cada gimnasio según lo que acordemos, y se puede cambiar después: cambiarla no borra programas, entrenamientos ni historial. Escribinos y lo vemos con tu caso."],
  ["¿Los alumnos lo usan desde el teléfono?", "Sí, en iPhone y Android. Se agrega a la pantalla de inicio desde el navegador, sin pasar por las tiendas, y el entrenamiento que ya abriste sigue guardándose aunque te quedes sin señal."],
  ["¿Qué hace la inteligencia artificial?", "Hay dos partes. Training Intelligence es un motor de reglas explicables: propone el objetivo de cada serie según tu historial y nunca sube la exigencia a mitad de sesión. Además, la IA arma borradores (un programa para que el profe revise, la rutina del día si no vino el profe) y lee historiales desde una foto o un PDF. No da diagnósticos ni garantiza resultados."],
  ["¿Cómo conozco los precios?", "No publicamos una lista: se acuerdan con cada cliente según la modalidad y la cantidad de socios o alumnos acordada, no según quién descarga la app. Pedí una propuesta personalizada."],
  ["¿Puedo pedir una demostración?", "Sí. Podés probar ahora la demo guiada (datos ficticios, sin cuenta) o pedirnos una presentación para tu gimnasio o tu equipo."],
  ["¿Cómo contacto al equipo?", "Por WhatsApp, por email o con el formulario de esta página. Te respondemos para conocer tu operación."],
];
