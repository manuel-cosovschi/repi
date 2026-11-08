// D205 · Experience Hub (/conoce). Todo el contenido comercial en un solo lugar: perfiles, funciones, videos, demos, preguntas y
// mensajes de contacto. Regla: sólo capacidades presentes en el producto (docs/comercial/ESTADO_Y_LIMITES.md, FEATURE_FLAGS.md).
// Nada de cifras, clientes, testimonios ni integraciones que no existan. Para sumar un video: completar `src` en VIDEOS.
import type { Profile } from "@/lib/site-events";

export type DemoRole = "owner" | "floor" | "member" | "coach";

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
// Experience 3.0 (D208): films de motion graphics con la interfaz real de la demo (datos ficticios), música instrumental con
// licencia comercial y efectos; sin voz ni locución. Se entienden sin sonido. Generados con design/films/kit/build.py
// (HyperFrames); licencias en marketing/videos/LICENCIAS.md. Los masters no van a Git.
const film = (id: string, title: string, audience: string, duration: string, music: string, summary: string, extra: Partial<Video> = {}): Video =>
  ({ id, title, audience, src: `/conoce/videos/${id}.mp4`, poster: `/conoce/videos/${id}.webp`, captions: null, duration, audio: true, music, summary,
    descriptionTrack: `/conoce/videos/${id}.descripcion.vtt`, ...extra });
export const VIDEOS: Record<string, Video> = {
  "film-marca": film("film-marca", "REPI · Cada repetición cuenta", "Todos", "0:48", "Heroic Age",
    "El socio entrena con su programa en el teléfono y un objetivo para cada serie, el entrenador sabe a quién atender y el gimnasio ve lo que pasa en su sala."),
  "perfil-gimnasios": film("perfil-gimnasios", "REPI para gimnasios", "Dueños y gerencia", "1:02", "Five Armies",
    "Altas por QR con aprobación del equipo, el programa de cada socio en su teléfono, pedidos de ayuda en la sala y la vista del dueño por sede."),
  "perfil-entrenadores": film("perfil-entrenadores", "REPI para entrenadores personales", "Personal trainers", "0:49", "Exciting Trailer",
    "Tus alumnos, sus programas y su progreso en un solo lugar, con borradores de la IA para revisar y mensajes con el contexto a mano."),
  "perfil-deportistas": film("perfil-deportistas", "REPI para alumnos y deportistas", "Quien entrena", "0:40", "Volatile Reaction",
    "Tu programa en el teléfono, un objetivo concreto para cada serie y tu progreso por ejercicio, armado con lo que registrás.",
    { srcVertical: "/conoce/videos/perfil-deportistas-vertical.mp4", posterVertical: "/conoce/videos/perfil-deportistas-vertical.webp" }),
  "perfil-aliados": film("perfil-aliados", "REPI, empresa de tecnología deportiva", "Empresas, inversores y aliados", "1:06", "Rising Game",
    "Una plataforma B2B2C: gimnasios y entrenadores la contratan, sus alumnos la usan todos los días y un motor propio explica cada recomendación."),
  "f-intelligence": film("f-intelligence", "Training Intelligence en una serie", "Todos", "0:33", "Volatile Reaction",
    "Propone el peso y las repeticiones de cada serie según tu historial, con la razón a la vista, y se ajusta cuando registrás lo que hiciste."),
  "f-progreso": film("f-progreso", "Progreso por ejercicio", "Quien entrena", "0:23", "Clash Defiant",
    "Cargas, repeticiones, volumen y récords de cada ejercicio, armados con las series que registrás."),
  "f-altas": film("f-altas", "Altas por QR con aprobación", "Gimnasios", "0:24", "Five Armies",
    "El socio escanea el QR de su sede y pide acceso; el equipo confirma quién es socio con un toque."),
  "f-sala": film("f-sala", "Seguimiento de sala", "Gimnasios", "0:24", "Clash Defiant",
    "El socio pide ayuda desde su serie y el entrenador de turno la recibe, la toma y le responde."),
};
/** Orden del centro audiovisual (sólo se muestran los que tienen archivo). */
export const VIDEO_ORDER = ["film-marca", "f-intelligence", "perfil-deportistas", "perfil-entrenadores", "perfil-gimnasios", "perfil-aliados", "f-progreso", "f-altas", "f-sala"];

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
export type Demo = { role: DemoRole; title: string; persona: string; forWho: string; sees: string[]; steps: number; shot: string };
export const DEMOS: Demo[] = [
  { role: "owner", title: "Explorá REPI como gimnasio", persona: "Martín, dueño de Gym Norte (dos sedes)", forWho: "Dueños, gerencia y recepción",
    sees: ["Tablero por sede: socios activos, asistencia y alertas", "Altas por QR: aprobás a Camila en un toque", "Ingreso validado con QR que cambia cada 30 s", "Seguimiento de sala, equipo y comunidad"], steps: 10, shot: "/conoce/shots/owner.webp" },
  { role: "floor", title: "El día del entrenador de sala", persona: "Sofía, entrenadora en turno en Palermo", forWho: "Entrenadores de piso y coordinación",
    sees: ["Un socio pide ayuda desde su serie y te llega al instante", "Bandeja de sala y traspaso de turno con historial", "Ficha del socio: programa, notas y molestias"], steps: 7, shot: "/conoce/shots/floor.webp" },
  { role: "member", title: "Viví la experiencia del alumno", persona: "Valentina, socia de Gym Norte y alumna de Agustín", forWho: "Quien entrena (y quien quiere ver qué recibe su socio)",
    sees: ["Training Intelligence: anterior, recomendado y real en cada serie", "Entrenar con descanso automático, incluso sin señal", "Progreso, chat con el coach y el gimnasio en la app"], steps: 8, shot: "/conoce/shots/member.webp" },
  { role: "coach", title: "Las herramientas del personal trainer", persona: "Agustín, personal trainer con tres alumnos", forWho: "Personal trainers y estudios",
    sees: ["Panel: quién entrenó y qué necesita tu atención", "Ficha con rendimiento, 1RM estimado y volumen", "Programas versionados, pedidos, chat y cobros"], steps: 8, shot: "/conoce/shots/coach.webp" },
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
  { id: "registro", title: "Registro de cada serie", value: "Carga, repeticiones, RIR o RPE, descanso y sensación con un toque.",
    points: ["El descanso corre solo", "Si la máquina está ocupada, cambiás o salteás el ejercicio", "Lo que ya abriste sigue guardándose sin señal"],
    status: "available", demo: "member", shot: "/conoce/shots/training.webp", shotAlt: "Pantalla de entrenamiento en curso en REPI", profiles: ["deportistas", "gimnasios"] },
  { id: "progreso", title: "Progreso por ejercicio", value: "Fuerza, cargas, repeticiones, volumen y récords desde lo que registrás.",
    points: ["Gráficos por ejercicio y por período", "1RM estimado con la fórmula de Epley (estimación, no medición)", "Tu historial anterior a REPI también suma"],
    status: "available", demo: "member", shot: "/conoce/shots/progress.webp", shotAlt: "Gráfico de evolución de un ejercicio en REPI", video: "f-progreso", profiles: ["deportistas", "entrenadores"] },
  { id: "cuerpo", title: "Mi cuerpo · Body Intelligence", value: "Peso, objetivo y fotos de progreso privadas, sólo para vos.",
    points: ["Peso corporal y objetivo con su gráfico", "Fotos privadas con comparador", "Calorías estimadas por entrenamiento, como rango"],
    status: "stage", note: "Para adultos. Medidas corporales y análisis más completos: en desarrollo. No es un diagnóstico.", demo: "member", shot: "/conoce/shots/body.webp", shotAlt: "Objetivo de peso con su avance en Mi cuerpo", profiles: ["deportistas"] },
  { id: "ia", title: "IA que arma borradores", value: "Propuestas de programa y de rutina del día que una persona revisa.",
    points: ["El profe describe objetivo, días y limitaciones; REPI propone un programa para editar", "«No vino el profe»: qué hacer hoy y con qué cargas, y se rearma si una máquina está ocupada", "Lee tu historial desde una planilla, texto, foto o PDF"],
    status: "available", note: "Nada se asigna solo. No recibe nombres ni datos de salud. Si la IA no responde, REPI arma la propuesta con reglas.", demo: "member", shot: "/conoce/shots/adaptive.webp", shotAlt: "Pantalla Entrenar con «No vino el profe, dame mi rutina para hoy»", profiles: ["deportistas", "entrenadores", "gimnasios", "aliados"] },
  { id: "alumnos", title: "Gestión de alumnos", value: "Cada alumno a fondo, en una sola pantalla.",
    points: ["Sesiones, rendimiento, objetivos y salud compartida con permiso", "Invitación personal o importación desde una planilla", "Agenda de sesiones presenciales u online"],
    status: "available", demo: "coach", shot: "/conoce/shots/clients.webp", shotAlt: "Lista de clientes del personal trainer con su adherencia", profiles: ["entrenadores"] },
  { id: "programas", title: "Programas y métodos", value: "Programas por días, con métodos avanzados y versiones.",
    points: ["Series, repeticiones, RIR, descanso y notas", "Drop sets, back-off, rest-pause, cluster, AMRAP y series por tiempo", "Cada cambio queda versionado y el alumno ve qué cambió"],
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
    points: ["Socios activos, asistencia y alertas", "Equipo y servicio: tareas, tiempos y reseñas", "Permisos por rol: dueño, gerencia, recepción y entrenadores"],
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
};
export const PROFILE_CONTENT: Record<Profile, ProfileContent> = {
  gimnasios: {
    id: "gimnasios", label: "Tengo un gimnasio", short: "Gimnasios", kicker: "Para dueños y gerencia",
    headline: "Que cada socio sienta que tiene un entrenador.",
    intro: "REPI lleva la rutina, el registro y el seguimiento al teléfono de cada socio, y le da a tu equipo de sala las herramientas para atender mejor.",
    problem: "La rutina en papel se pierde, el profe no llega a todos y el dueño no ve qué pasa en la sala hasta que alguien se da de baja.",
    solution: ["Cada socio entrena con su programa en el teléfono y registra cada serie", "Training Intelligence le propone un objetivo por serie, con la razón", "El socio pide ayuda desde su ejercicio y el equipo responde con seguimiento", "Vos ves asistencia, servicio del equipo y alertas por sede"],
    benefits: [
      { title: "Un servicio que se nota", text: "Programa, progreso y comunidad en la app: un diferencial concreto frente a otros gimnasios." },
      { title: "Tu equipo rinde más", text: "Avisos en vivo, cola de pedidos y traspaso de turno: nadie queda sin atender." },
      { title: "Altas sin papeles", text: "QR por sede, la persona pide acceso y tu equipo confirma. Sin cargar padrones." },
      { title: "Visibilidad real", text: "Socios activos, asistencia y respuesta del equipo por sede, con permisos por rol." },
    ],
    demo: "owner", video: "perfil-gimnasios", leadKind: "gym",
    whatsapp: "Hola, conocí REPI y me interesa implementarlo en mi gimnasio. Quisiera coordinar una demostración.", cta: "Consultar para mi gimnasio",
    meta: { title: "REPI para gimnasios · Entrenamiento y seguimiento de cada socio", description: "Rutinas en el teléfono, registro de cada serie, Training Intelligence, seguimiento de sala y altas por QR para gimnasios." },
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
    headline: "Tecnología de entrenamiento que ya funciona en gimnasios reales.",
    intro: "REPI es una plataforma B2B2C: gimnasios y entrenadores la contratan y sus alumnos la usan todos los días.",
    problem: "La mayoría de los gimnasios y entrenadores independientes gestionan el entrenamiento con papel, planillas y mensajería, sin datos de lo que pasa en la sala.",
    solution: ["Gimnasios y personal trainers como clientes; socios y alumnos como usuarios", "Suscripción por cliente según socios o alumnos acordados", "Motor propio de recomendaciones explicables (Training Intelligence) más IA generativa para borradores", "Web app instalable: funciona en cualquier teléfono, sin tiendas"],
    benefits: [
      { title: "Producto en operación", text: "En funcionamiento en varios gimnasios de Mar del Plata: socios que piden acceso por QR y entrenan con su rutina." },
      { title: "Diferencial técnico", text: "Recomendaciones deterministas con explicación, registro sin conexión y privacidad por permisos." },
      { title: "Modelo claro", text: "Un acuerdo por cliente con cantidad y precio unitario; no depende de descargas." },
      { title: "Abierto a alianzas", text: "Cadenas, equipamiento, salud y distribución: conversemos cómo sumar valor." },
    ],
    demo: "owner", video: "perfil-aliados", leadKind: "partner",
    whatsapp: "Hola, conocí REPI y me interesa conversar sobre una alianza o inversión. ¿Podemos coordinar una reunión?", cta: "Proponer una alianza",
    meta: { title: "REPI · Empresa de tecnología para el entrenamiento", description: "Plataforma B2B2C para gimnasios, entrenadores y alumnos, en operación en gimnasios de Mar del Plata. Alianzas e inversión." },
  },
};

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
  ["¿Qué necesita un gimnasio para implementarlo?", "Definir las sedes, quién aprueba las altas y la cantidad de socios del acuerdo. REPI habilita el espacio, el equipo se suma con invitación y cada sede tiene su QR. No hace falta cargar el padrón ni instalar equipos."],
  ["¿Los alumnos lo usan desde el teléfono?", "Sí, en iPhone y Android. Se agrega a la pantalla de inicio desde el navegador, sin pasar por las tiendas, y el entrenamiento que ya abriste sigue guardándose aunque te quedes sin señal."],
  ["¿Qué hace la inteligencia artificial?", "Hay dos partes. Training Intelligence es un motor de reglas explicables: propone el objetivo de cada serie según tu historial y nunca sube la exigencia a mitad de sesión. Además, la IA arma borradores (un programa para que el profe revise, la rutina del día si no vino el profe) y lee historiales desde una foto o un PDF. No da diagnósticos ni garantiza resultados."],
  ["¿Cómo conozco los precios?", "No publicamos una lista: el precio por socio o por alumno se acuerda con cada cliente según la cantidad acordada, no según quién descarga la app. Escribinos y te armamos una propuesta."],
  ["¿Puedo pedir una demostración?", "Sí. Podés probar ahora la demo guiada (datos ficticios, sin cuenta) o pedirnos una presentación para tu gimnasio o tu equipo."],
  ["¿Cómo contacto al equipo?", "Por WhatsApp, por email o con el formulario de esta página. Te respondemos para conocer tu operación."],
];
