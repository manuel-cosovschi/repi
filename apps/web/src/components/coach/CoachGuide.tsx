"use client";
// Guía del coach (D115). Texto estático: los rótulos entre «» tienen que coincidir con la navegación de CoachApp.
import { GuideCard, GuideDefs, GuideSteps, type GuideStep } from "@/components/ui/Guide";

const START: GuideStep[] = [
  { t: "Invitá a tus alumnos → «Clientes» → «Invitar cliente»", d: "Con su email. Le llega un correo con enlace y código; crea su cuenta con ese email y elige qué compartir con vos. Para muchos a la vez, «Importar CSV»." },
  { t: "Que agreguen REPI al teléfono", d: "Pasales repiclub.com/instalar o el cartel con QR de /instalar/cartel: en un minuto queda como una app." },
  { t: "Armá la rutina → «Programas»", d: "Días, ejercicios, series, reps, RIR, descanso e indicaciones. Se guarda sola. «Reemplazos» deja aprobadas alternativas si falta una máquina." },
  { t: "Asignála → «Asignar a clientes»", d: "Cada alumno recibe su propia copia: después ajustás la de uno sin tocar la de los demás." },
  { t: "Seguí el progreso → «Clientes» → ficha", d: "Sesiones, series, cargas, notas, cambios de ejercicio, rendimiento y objetivos. Si editás su programa, cambia para adelante; lo ya hecho queda." },
];

const SECTIONS: [string, string][] = [
  ["Panel", "Pendientes del día: alumnos sin entrenar, pedidos, molestias reportadas y mensajes."],
  ["Clientes", "Lista, búsqueda y ficha de cada alumno. Salud sólo si el alumno la comparte; si no, «Pedir acceso»."],
  ["Agenda", "Turnos con tus alumnos y asistencia."],
  ["Programas", "Plantillas, duplicar, asignar y reemplazos aprobados."],
  ["Mensajes", "Chat privado con cada alumno."],
  ["Solicitudes", "Pedidos de los alumnos (cambio de rutina, revisión de técnica) y respuestas sobre permisos."],
  ["Cobros a alumnos", "Anotás lo que te pagan tus alumnos (fuera de la app). REPI no cobra ni factura."],
  ["Condiciones REPI", "Lo que acordaste con REPI: cantidad de alumnos y precio. Si algo no coincide, pedí una corrección."],
];

export function CoachGuide() {
  return (
    <>
      <div className="co-head"><div><span className="co-kicker">Cómo usar REPI con tus alumnos</span><h1 tabIndex={-1}>Guía</h1></div></div>
      <GuideCard title="Primeros pasos"><GuideSteps items={START} /></GuideCard>
      <GuideCard title="Qué hay en cada sección"><GuideDefs items={SECTIONS} /></GuideCard>
      <GuideCard title="Tus alumnos">
        <GuideDefs items={[
          ["No le llegó la invitación", "Que revise spam. En «Solicitudes» podés reenviarla, o pasale el código para que lo ingrese en «Tengo un código»."],
          ["Ya tiene cuenta", "Entra con su cuenta y acepta: no crea otra."],
          ["Dejar de entrenarlo", "Desde su ficha pausás o terminás la relación. Su historial queda y deja de ver tus rutinas nuevas."],
          ["No puede entrar", "Que toque «¿No podés entrar?» o «Ayuda y soporte» en la pantalla de ingreso. Nadie le va a pedir la contraseña."],
        ]} />
      </GuideCard>
    </>
  );
}
