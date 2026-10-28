"use client";
// Guía de uso de REPI Admin (D114): cómo dar de alta un gimnasio o un coach y qué hace cada sección. Texto estático; los
// nombres de botones y secciones tienen que coincidir con AdminApp, GymApp y CoachApp. Si cambia un rótulo, cambiar acá.
import { Head } from "@/components/gym/shared";
import { GuideCard, GuideDefs, GuideSteps as Steps, type GuideStep as Step } from "@/components/ui/Guide";

const BEFORE: Step[] = [
  { t: "Acordá con el cliente fuera de la app", d: "Cantidad de socios o alumnos, precio por unidad, moneda, si hay prueba sin cargo y cómo te paga. REPI no cobra: el pago lo gestionás vos." },
  { t: "Pedí los datos del responsable", d: "Nombre visible, razón social, nombre y email de la persona que va a administrar la cuenta. A ese email le llega la invitación y sólo esa persona puede usarla." },
  { t: "Guardá una evidencia del acuerdo", d: "Un PDF firmado, un email o un mensaje donde acepta las condiciones. En la ficha anotás cuál es." },
];

const GYM: Step[] = [
  { t: "Clientes → Nuevo cliente", d: "Tipo «Gimnasio». Completá nombre visible, razón social, moneda, responsable, su email y las sedes separadas por coma (por ejemplo «Centro, Palermo»). Si el acuerdo cubre sólo algunas sedes, elegí ese alcance." },
  { t: "1 · Acuerdo y habilitación → registrar la aceptación", d: "Escribí la referencia de la evidencia (por ejemplo «PDF firmado 28/10»), la fecha y la versión del acuerdo, y tocá «Registrar aceptación». Después «Habilitar cliente». Si acordaste una prueba sin cargo, poné la fecha de fin antes de habilitar." },
  { t: "3 · Cantidad y precio", d: "«Nueva cantidad» (socios acordados) y «Nuevo precio» (por socio), con fecha desde la que rigen y motivo. Cada cambio queda como versión y el cliente lo ve en «Condiciones REPI»." },
  { t: "2 · Invitación de bienvenida → «Enviar invitación»", d: "Le llega un correo al responsable con un enlace para activar la cuenta. Si dice «Envío rechazado», revisá el email y tocá «Reenviar». Si el email estaba mal o cambió el responsable, usá «Cambiar responsable»: la invitación anterior deja de servir." },
  { t: "El dueño activa su cuenta", d: "Abre el enlace, crea su cuenta con ese mismo email (o entra si ya tenía una) y configura la verificación en dos pasos con una app como Google Authenticator: es obligatoria para dueños." },
  { t: "El dueño arma su gimnasio", d: "En su panel: «Equipo» → «Invitar al equipo» (gerentes, coordinadores, entrenadores de sala y recepción, por email y sede). «Accesos y QR» → genera el QR de cada sede para imprimir o compartir." },
  { t: "Los socios se suman con el QR", d: "El socio escanea, crea su cuenta y pide acceso. El equipo lo aprueba en «Solicitudes de acceso». No hace falta cargar un padrón." },
];

const COACH: Step[] = [
  { t: "Clientes → Nuevo cliente", d: "Tipo «Coach independiente». Nombre comercial, razón social (puede ser su nombre), moneda, responsable (el propio coach) y su email." },
  { t: "1 · Acuerdo, 3 · Cantidad y precio, 2 · Invitación", d: "Igual que en un gimnasio: registrás la aceptación, habilitás, cargás cantidad de alumnos y precio por alumno, y enviás la invitación." },
  { t: "El coach activa su espacio", d: "Abre el enlace del correo y crea su cuenta o entra con ese email. Queda en su panel de coach." },
  { t: "El coach invita a sus alumnos", d: "«Clientes» → «Invitar cliente» (por email) o «Importar CSV». Cada alumno recibe su invitación, crea la cuenta y elige qué compartir." },
  { t: "Arma y asigna rutinas", d: "«Programas»: crea la rutina por días y ejercicios y la asigna. El alumno la ve en su app y empieza a entrenar; el coach ve cada sesión en la ficha del cliente." },
];

const SECTIONS: { t: string; items: [string, string][] }[] = [
  { t: "Resumen", items: [
    ["Qué muestra", "Clientes habilitados y por habilitar, cantidad acordada (lo que se factura), accesos habilitados (uso real, no se factura), pagos externos del mes, contactos nuevos, consultas de soporte, pedidos de privacidad y accesos denegados."],
    ["Para qué", "Es tu tablero de cada día. Cada tarjeta te lleva a la sección correspondiente."],
  ] },
  { t: "Clientes", items: [
    ["Lista", "Cada gimnasio o coach con su etapa (Borrador, Aceptado, Habilitado, Suspendido), lo acordado, el precio y los accesos. «Supera lo acordado» es un aviso para renegociar: no cobra ni bloquea."],
    ["1 · Acuerdo y habilitación", "«Registrar aceptación», «Habilitar cliente», «Guardar prueba» o «Quitar prueba» (el cliente ve el motivo) y «Suspender». Suspender corta el acceso del cliente sin borrar datos; «Rehabilitar» lo reactiva."],
    ["2 · Invitación de bienvenida", "«Enviar invitación», «Reenviar», «Revocar» y «Cambiar responsable». Muestra si el correo fue rechazado."],
    ["3 · Cantidad y precio", "Versiones con fecha de vigencia, motivo y evidencia. «Qué cuenta como vigente» define qué socio o alumno entra en la cantidad."],
    ["4 · Vista previa del período", "Calcula lo que corresponde cobrar en un mes según las versiones vigentes. El cierre es simulado: no genera factura ni cobro."],
    ["5 · Pagos externos registrados", "Anotás un pago que el cliente te hizo por fuera (transferencia, efectivo), con evidencia, y lo asociás a un cierre. Se puede anular con motivo."],
    ["Avisos al cliente", "Historial de lo que el cliente vio sobre cambios de condiciones y si lo leyó."],
    ["Pedidos de corrección", "Si el cliente dice que algo de sus condiciones está mal, aparece acá y le respondés."],
    ["Regularizar", "Para cuentas viejas sin ficha comercial: completa los datos y las pasa al circuito normal."],
  ] },
  { t: "Contactos", items: [
    ["Qué es", "Gimnasios y coaches que dejaron sus datos en repiclub.com o en la pantalla de ingreso."],
    ["Acciones", "«Marcar contactado», «Dar de alta» (abre Nuevo cliente) o «Descartar»."],
  ] },
  { t: "Soporte", items: [
    ["Qué es", "Consultas que llegan desde «Ayuda y soporte», con o sin sesión. Cada una tiene un código S-XXXXXX."],
    ["Acciones", "«Tomar», responder (la persona ve la respuesta si tenía sesión), nota interna, «Marcar como incidente» y «Marcar como respondida». Procedimiento completo en docs/SOPORTE_OPERACION.md."],
    ["Nunca", "Entrar a la cuenta de otra persona, cambiar su email o contraseña, ni pedir contraseñas o códigos."],
  ] },
  { t: "Privacidad", items: [
    ["Qué es", "Pedidos de eliminación de datos que hacen las personas desde su perfil."],
    ["Acciones", "Revisarlo y registrar el resultado (resuelto o rechazado con motivo). La exportación de datos es autoservicio y no pasa por acá."],
  ] },
];

const FAQ: [string, string][] = [
  ["No le llegó el correo de invitación", "Abrí su ficha: si dice «Envío rechazado», corregí el email con «Cambiar responsable» (manda una invitación nueva). Si dice enviado, que revise spam o promociones."],
  ["Cambió el dueño o el responsable", "Ficha → 2 · Invitación → «Cambiar responsable». La invitación vieja deja de servir y se manda una nueva."],
  ["No pagó", "Ficha → 1 · Acuerdo → «Suspender», con motivo. Cuando pague, «Rehabilitar». No se borra nada."],
  ["Quiere más socios o alumnos", "Ficha → 3 · Nueva cantidad, con la fecha desde la que rige. El cliente recibe el aviso."],
  ["Un socio o alumno no puede entrar", "Que use «¿No podés entrar?» o «Ayuda y soporte» en la pantalla de ingreso. Lo ves en Soporte."],
  ["Mostrar REPI sin crear nada", "La demo guiada en repiclub.com/demo usa datos de ejemplo aislados."],
];

// Quién invita a quién (D115). Nadie recibe una contraseña: cada persona crea la suya con el email invitado.
const ACCESS: [string, string][] = [
  ["Coach", "Lo invitás vos desde Admin (ficha → «Enviar invitación»). Le llega un email de bienvenida y activa su espacio con ese email."],
  ["Dueño del gimnasio", "Igual que el coach: lo invitás vos desde Admin. Además configura la verificación en dos pasos, obligatoria para dueños."],
  ["Gerente", "Lo invita el dueño desde su panel: «Equipo» → «Invitar al equipo», rol Gerente."],
  ["Coordinador, entrenador de sala, recepción", "Los invita el dueño o un gerente desde «Equipo» → «Invitar al equipo», con rol y sede. Les llega un email con enlace y código."],
  ["Alumno de un coach", "Lo invita el coach desde «Clientes» → «Invitar cliente» (o «Importar CSV»). Le llega un email con enlace y código; crea su cuenta con ese email y elige qué compartir."],
  ["Socio de un gimnasio", "No se invita por email: escanea el QR de su sede (el dueño o gerente lo genera en «Accesos y QR» y lo pone en recepción), crea su cuenta y pide acceso. Lo aprueba recepción, gerencia, el dueño o un entrenador de sala con turno activo en «Solicitudes de acceso»."],
  ["Si ya tiene cuenta", "Entra con su cuenta de siempre y acepta la invitación nueva: una misma persona puede ser alumno de un coach y socio de un gimnasio, o trabajar en un gimnasio y entrenar con un coach."],
];

const DOWNLOADS: [string, string, string][] = [
  ["Cartel A4 para imprimir (PDF)", "/marketing/repi-cartel-instalar.pdf", "Para recepción o el vestuario. Lleva el QR y los pasos de iPhone y Android."],
  ["Cartel en imagen (PNG)", "/marketing/repi-cartel-instalar.png", "Para mandar por WhatsApp o publicar."],
  ["QR solo (PNG)", "/marketing/repi-qr-instalar.png", "Para sumar a un diseño propio del gimnasio o del coach."],
  ["QR solo (SVG)", "/marketing/repi-qr-instalar.svg", "Vectorial, para imprenta."],
];

export function AdminGuide() {
  return (
    <>
      <Head kicker="Cómo vender, dar de alta y operar REPI desde Admin" title="Guía" />
      <GuideCard title="Antes de dar de alta"><Steps items={BEFORE} /></GuideCard>
      <GuideCard title="Dar de alta un gimnasio"><Steps items={GYM} /></GuideCard>
      <GuideCard title="Dar de alta un coach"><Steps items={COACH} /></GuideCard>
      <GuideCard title="Cómo entra cada persona">
        <p className="muted">Nadie recibe usuario y contraseña por email: cada persona crea la suya con el email al que la invitaron. Al gimnasio y al coach los invitás vos; ellos invitan a su gente.</p>
        <GuideDefs items={ACCESS} />
      </GuideCard>
      <GuideCard title="Cómo se descarga la app">
        <p className="muted">REPI no está en App Store ni Google Play: se agrega a la pantalla de inicio desde el navegador y queda como una app. Hay un solo QR para todos (alumnos, socios, coaches y equipo) que abre repiclub.com/instalar con los pasos de cada teléfono. El QR de cada sede del gimnasio es otro: sirve para que el socio pida acceso, y también le muestra estos pasos.</p>
        <ul className="ag-dl">{DOWNLOADS.map(([t, href, d]) => <li key={href}><a className="btn sm" href={href} download>{t}</a><span className="muted">{d}</span></li>)}</ul>
        <p className="muted">El cartel también se puede abrir e imprimir desde <a href="/instalar/cartel" target="_blank" rel="noreferrer">repiclub.com/instalar/cartel</a>.</p>
      </GuideCard>
      <GuideCard title="Qué hace cada sección de Admin">
        {SECTIONS.map((x) => <div key={x.t} className="ag-sec"><h3>{x.t}</h3><GuideDefs items={x.items} /></div>)}
      </GuideCard>
      <GuideCard title="Situaciones comunes"><GuideDefs items={FAQ} /></GuideCard>
      <GuideCard title="Lo que REPI no hace (todavía)">
        <p className="muted">No cobra ni emite facturas: el cobro lo gestionás vos y lo registrás en «Pagos externos». No crea gimnasios ni coaches por su cuenta: siempre pasan por esta pantalla. No da acceso a chats privados ni a datos de salud por ser Admin o dueño.</p>
      </GuideCard>
    </>
  );
}
