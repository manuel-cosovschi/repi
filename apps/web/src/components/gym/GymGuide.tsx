"use client";
// Guía del gimnasio por rol (D115). Dueño y gerencia ven todo; el resto, lo de sus roles. Texto estático: los rótulos entre
// «» tienen que coincidir con la navegación de GymApp y los botones de cada pantalla.
import type { GymRole } from "@repi/domain";
import { GuideCard, GuideDefs, GuideSteps, type GuideStep } from "@/components/ui/Guide";
import { Head, type Shell } from "./shared";

const START: GuideStep[] = [
  { t: "Seguridad de tu cuenta → «Mi cuenta»", d: "Optativo: activá la verificación en dos pasos para que, además de la contraseña, te pida un código de una app del teléfono. Si la activás, guardá los códigos de respaldo." },
  { t: "QR de cada sede → «Accesos y QR»", d: "Generá el QR, tocá «Descargar» e imprimilo para recepción. Con ese QR los socios piden acceso. Si una sede no aparece, pedíla a REPI." },
  { t: "Cartel para instalar la app", d: "En /instalar/cartel hay un cartel A4 con el QR para agregar REPI al teléfono. Sirve para socios y para tu equipo." },
  { t: "Tu equipo → «Equipo» → «Invitar al equipo»", d: "Email, rol y sede de cada persona. Les llega un correo con enlace y código; crean su cuenta con ese email." },
  { t: "Aprobar socios → «Solicitudes de acceso»", d: "Cada pedido muestra nombre y sede. Confirmá cómo identificaste a la persona y aprobá, o rechazá con motivo." },
  { t: "Tus condiciones → «Condiciones REPI»", d: "Cantidad y precio acordados con REPI y sus cambios. Si algo no coincide, «Pedir corrección»." },
];

const ROLES: [string, string][] = [
  ["Dueño", "Todo el gimnasio: sedes, equipo (incluye gerentes), QR, solicitudes, condiciones con REPI, reseñas, comunidad y configuración. No ve chats privados, notas personales ni salud de los socios."],
  ["Gerente", "Panel de su sede, equipo (invita a todos menos gerentes), turnos, tareas, socios, solicitudes de acceso, QR, reseñas y comunidad."],
  ["Coordinador", "Lo del entrenador de sala más tareas, turnos y desempeño del equipo."],
  ["Entrenador de sala", "Su turno, la cola de asistencia, los socios de su sede y sus programas, mensajes con socios y solicitudes de acceso mientras tiene el turno iniciado."],
  ["Recepción", "Mostrador (ingresos y premios), solicitudes de acceso y catálogo. No ve fichas de entrenamiento."],
];

const FLOOR: GuideStep[] = [
  { t: "«Mi turno»: cargá tu horario", d: "Con tu horario, el turno empieza y termina solo; sin horario, «Iniciar turno». Sin turno no podés tomar pedidos, editar programas ni aprobar socios. Si te vas antes, cerrá el turno con el traspaso." },
  { t: "«Cola de asistencia» → «Tomar»", d: "Pedidos de ayuda, cambios de rutina o técnica de los socios de tu sede. Al tomarlo queda a tu nombre." },
  { t: "«Socios» → ficha → «Crear programa» o «Editar programa»", d: "Días, ejercicios, series, reps y descanso, con el motivo del cambio. El socio lo ve en su app. «Reemplazos» deja aprobadas alternativas si una máquina está ocupada." },
  { t: "«Solicitudes de acceso» → «Mostrar QR de la sede»", d: "Si un socio está con vos y no quiere ir a recepción, mostrale el QR en tu pantalla o mandale el enlace con «Copiar enlace». Después aprobás su pedido ahí mismo (con el turno iniciado)." },
  { t: "«Traspaso de turno»", d: "Pasale lo pendiente a otro entrenador: queda pendiente hasta que lo acepta." },
  { t: "«En sala ahora»", d: "Con el turno iniciado aparecés en la app de los socios de tu sede, con «Disponible» u «Ocupado». Cada socio elige con quién entrena hoy: en «Mi turno» ves quiénes te eligieron. Dueño y gerencia ven quién está en sala en el Ejecutivo o el Panel." },
  { t: "«Mensajes»", d: "Conversaciones con socios de tu sede. Las responde el equipo de sala; gerencia no lee los chats." },
];

// REPI Connect (D126): sólo se muestra si el gimnasio lo tiene activo.
const CONNECT: GuideStep[] = [
  { t: "«Sala» → «Pendientes» → «Tomar»", d: "Los socios piden ayuda desde la app (con motivo y, si lo piden desde un ejercicio, con el ejercicio y sus series). Primero ves lo tuyo y los traspasos que te dejaron; después la cola libre, por prioridad y antigüedad." },
  { t: "«Abrir» → «Atender ahora» → «Registrar»", d: "Contexto del ejercicio, historial del pedido y pedidos anteriores del socio. Registrá qué hiciste: queda para el resto del equipo, no para el socio." },
  { t: "«Dejar seguimiento» o «Transferir»", d: "Qué se hizo, qué falta y el próximo paso. «Lo sigo yo» con fecha, «Para el próximo turno» (queda libre) o «Transferir» a otro profesor, que lo acepta. Nada se pierde entre turnos." },
  { t: "«Resolver»", d: "Registro obligatorio de lo que hiciste y, si querés, un mensaje para el socio. El socio lo ve en «Mis pedidos» y puede contestar si le sirvió." },
  { t: "Disponible u ocupado", d: "En «Sala», con el turno iniciado, indicás si estás disponible u ocupado. Es lo que declarás vos: no es ubicación." },
  { t: "«Seguimiento de sala» (dueño, gerencia y coordinación)", d: "Pedidos, tiempos de primera atención y resolución, seguimientos, traspasos y opinión de los socios. Sólo números: no muestra el texto de los pedidos, notas, chats ni salud." },
];

// Gym Access (D127): sólo con el control de acceso activo.
const ACCESS: GuideStep[] = [
  { t: "«Acceso y presencia» → «Política»", d: "Abierto (no pide nada), Híbrido (recomendado: rutina e historial desde cualquier lugar; para iniciar y registrar el entrenamiento del gimnasio se valida el ingreso) o Estricto (suma pedir ayuda o desafíos). Cuánto dura el QR y cuántas horas vale el ingreso." },
  { t: "«Pantallas y sedes» → «Crear pantalla»", d: "Abrí el enlace una sola vez en la tablet o TV de recepción: muestra el QR de la sede, que se renueva solo. Si se pierde el equipo, «Revocar»." },
  { t: "«Mostrar QR de ingreso»", d: "Recepción, dueño o gerencia muestran el mismo QR desde su pantalla, sin tablet." },
  { t: "«Validar a mano»", d: "Para quien no tiene batería, datos o cámara: buscás al socio y validás. Entrenadores de sala, desde «Mi turno» con el turno iniciado. Queda registrado quién lo hizo." },
  { t: "«Accesos» → «Vigente hasta»", d: "Fecha de la cuota. Vencida, el socio sigue viendo su rutina e historial pero no inicia entrenamientos del gimnasio. Pausar o dar de baja revoca los ingresos vigentes." },
  { t: "«Panel»", d: "Ingresos validados, socios distintos, rechazos por motivo, ingresos vigentes (con «Revocar») e intentos. No hay mapa ni rastreo: sólo validaciones." },
  { t: "Ubicación del teléfono", d: "Opcional y apagada por defecto. Antes de activarla, revisión legal (Ley 25.326) y aviso a los socios. Se lee una vez al validar y no se guardan coordenadas." },
];

const RECEPTION: GuideStep[] = [
  { t: "«Solicitudes de acceso» → «Mostrar QR de la sede»", d: "Para que el socio lo escanee en el mostrador o te pida el enlace por WhatsApp." },
  { t: "«Solicitudes de acceso»", d: "Socios que escanearon el QR. Verificá su identidad y su membresía y aprobá o rechazá con motivo." },
  { t: "«Recepción»", d: "Registrá ingresos y la entrega de premios de desafíos." },
];

const MEMBERS: [string, string][] = [
  ["Cómo se suma un socio", "Escanea el QR de su sede, crea su cuenta y pide acceso (después ve cómo agregar REPI a su inicio). Cuando lo aprueban, entra a su app y ve el programa que le arme el equipo de sala."],
  ["No encuentra el QR", "Cualquiera del equipo se lo muestra desde «Solicitudes de acceso» → «Mostrar QR de la sede», o le manda el enlace con «Copiar enlace»."],
  ["Ya entrena con un coach", "Puede tener las dos relaciones; en su app elige con cuál entrena. El coach no ve lo del gimnasio ni al revés."],
  ["Se da de baja", "Desde su ficha. Su historial queda; deja de ver lo del gimnasio."],
  ["No puede entrar", "Que toque «¿No podés entrar?» o «Ayuda y soporte» en la pantalla de ingreso."],
];

export function GymGuide({ shell }: { shell: Shell }) {
  const r = shell.ctx.roles as GymRole[];
  const all = r.includes("owner") || r.includes("manager");
  const floor = all || r.includes("floor_trainer") || r.includes("coordinator");
  const desk = all || r.includes("reception");
  return (
    <>
      <Head kicker={shell.ctx.org.name} title="Guía" />
      {all && <GuideCard title="Primeros pasos del gimnasio"><GuideSteps items={START} /></GuideCard>}
      <GuideCard title="Quién hace qué"><GuideDefs items={ROLES} /></GuideCard>
      {floor && <GuideCard title="Entrenador de sala y coordinación"><GuideSteps items={FLOOR} /></GuideCard>}
      {shell.ctx.connect && (floor || r.includes("owner")) && <GuideCard title="REPI Connect · seguimiento de sala"><GuideSteps items={CONNECT} /></GuideCard>}
      {shell.ctx.accessControl && (floor || desk) && <GuideCard title="Acceso y presencia · ingreso validado"><GuideSteps items={ACCESS} /></GuideCard>}
      {desk && <GuideCard title="Recepción"><GuideSteps items={RECEPTION} /></GuideCard>}
      <GuideCard title="Socios"><GuideDefs items={MEMBERS} /></GuideCard>
      <GuideCard title="Ayuda">
        <p className="muted">¿Algo no funciona? «Ayuda» junto a «Cerrar sesión», o escribí a REPI. Nadie del equipo de REPI te va a pedir tu contraseña ni tus códigos.</p>
      </GuideCard>
    </>
  );
}
