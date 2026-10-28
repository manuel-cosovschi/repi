"use client";
// Guía del gimnasio por rol (D115). Dueño y gerencia ven todo; el resto, lo de sus roles. Texto estático: los rótulos entre
// «» tienen que coincidir con la navegación de GymApp y los botones de cada pantalla.
import type { GymRole } from "@repi/domain";
import { GuideCard, GuideDefs, GuideSteps, type GuideStep } from "@/components/ui/Guide";
import { Head, type Shell } from "./shared";

const START: GuideStep[] = [
  { t: "Verificación en dos pasos", d: "Ya la configuraste al entrar. Guardá los códigos de respaldo: sin ellos y sin la app del código no podés entrar." },
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
  { t: "«Mi turno» → «Iniciar turno»", d: "Sin turno iniciado no podés tomar pedidos, editar programas ni aprobar socios. Al irte, «Cerrar turno» o dejá el traspaso." },
  { t: "«Cola de asistencia» → «Tomar»", d: "Pedidos de ayuda, cambios de rutina o técnica de los socios de tu sede. Al tomarlo queda a tu nombre." },
  { t: "«Socios» → ficha → «Crear programa» o «Editar programa»", d: "Días, ejercicios, series, reps y descanso, con el motivo del cambio. El socio lo ve en su app. «Reemplazos» deja aprobadas alternativas si una máquina está ocupada." },
  { t: "«Traspaso de turno»", d: "Pasale lo pendiente a otro entrenador: queda pendiente hasta que lo acepta." },
  { t: "«Mensajes»", d: "Conversaciones con socios de tu sede. Las responde el equipo de sala; gerencia no lee los chats." },
];

const RECEPTION: GuideStep[] = [
  { t: "«Solicitudes de acceso»", d: "Socios que escanearon el QR. Verificá su identidad y su membresía y aprobá o rechazá con motivo." },
  { t: "«Recepción»", d: "Registrá ingresos y la entrega de premios de desafíos." },
];

const MEMBERS: [string, string][] = [
  ["Cómo se suma un socio", "Escanea el QR de su sede, agrega REPI a su teléfono, crea su cuenta y pide acceso. Cuando lo aprueban, entra a su app y ve el programa que le arme el equipo de sala."],
  ["No encuentra el QR", "Mandale el enlace de la sede («Accesos y QR» → «Copiar enlace»)."],
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
      {desk && <GuideCard title="Recepción"><GuideSteps items={RECEPTION} /></GuideCard>}
      <GuideCard title="Socios"><GuideDefs items={MEMBERS} /></GuideCard>
      <GuideCard title="Ayuda">
        <p className="muted">¿Algo no funciona? «Ayuda» junto a «Cerrar sesión», o escribí a REPI. Nadie del equipo de REPI te va a pedir tu contraseña ni tus códigos.</p>
      </GuideCard>
    </>
  );
}
