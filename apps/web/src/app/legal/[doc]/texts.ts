// Textos legales de REPI (D109). Borrador redactado a partir de cómo funciona hoy la app y de la Ley 25.326 de Protección
// de Datos Personales; pendiente de revisión por un abogado y de completar razón social, CUIT y domicilio del titular.
// No describen funciones que no existan. Si cambia algo de fondo, cambia TERMS_VERSION y se vuelve a pedir la aceptación.
import { CONTACT, SUPPORT } from "@/lib/contact";

export type LegalDoc = { title: string; intro: string; sections: { h: string; p: string[] }[] };

const WHO = "REPI es un producto de Sovare («Sovare», «nosotros»).";
const MAIL = CONTACT.email;

export const LEGAL: Record<"terms" | "privacy" | "dpa", LegalDoc> = {
  terms: {
    title: "Términos y condiciones",
    intro: `${WHO} Estos términos regulan el uso de REPI por personas que entrenan, entrenadores, gimnasios y su equipo. Al crear tu cuenta o seguir usándola los aceptás.`,
    sections: [
      { h: "1. Qué es REPI", p: [
        "Una aplicación web para programar y registrar entrenamientos, hacer seguimiento entre entrenador y alumno y organizar la atención en gimnasios. Se usa desde el navegador y puede agregarse a la pantalla de inicio del teléfono.",
        "Las funciones disponibles son las que ves en la app. Lo que aparece como «próximamente» no está incluido.",
      ] },
      { h: "2. Tu cuenta", p: [
        "La cuenta es personal: no la compartas ni des tu contraseña o tus códigos a nadie. Ni Sovare, ni tu coach ni tu gimnasio te los van a pedir.",
        "Tenés que dar datos verdaderos. Si tenés entre 13 y 17 años, algunas funciones necesitan la aprobación de una persona adulta responsable; menores de 13 años no pueden registrarse.",
        "Para entrenar con un coach necesitás su invitación; para usar un gimnasio, que su equipo apruebe tu acceso. Cada coach o gimnasio decide sobre su propio espacio.",
      ] },
      { h: "3. Salud y entrenamiento", p: [
        "REPI no da consejo médico ni reemplaza la evaluación de un profesional de la salud. Las rutinas las arman tu coach o tu gimnasio; las ayudas de la app (calculadora de discos, entrada en calor sugerida, alternativas de ejercicios) son orientativas.",
        "Entrenás bajo tu responsabilidad y la de quien te indica la rutina. Si sentís dolor, mareo o cualquier síntoma fuera de lo normal, frená y consultá. Consultá a un médico antes de empezar o cambiar tu actividad física si tenés una condición de salud.",
      ] },
      { h: "4. Gimnasios y coaches", p: [
        "Los gimnasios y coaches contratan REPI con un acuerdo propio que fija cantidad de socios o alumnos, precio y alcance. El pago se acuerda con Sovare y se hace por fuera de la app; REPI no cobra cuotas a socios ni procesa pagos.",
        "Son responsables de a quién invitan o aprueban, de mantener al día altas, pausas y bajas, de los permisos de su equipo y del contenido que publican. Para los datos de sus socios y alumnos rige además el Acuerdo de tratamiento de datos para organizaciones.",
        `Soporte: ${SUPPORT.urgent} ${SUPPORT.included} ${SUPPORT.custom}`,
      ] },
      { h: "5. Uso permitido", p: [
        "No uses REPI para molestar, engañar o publicar contenido ilegal, ofensivo o de terceros sin permiso; para acceder a datos o espacios ajenos; ni para interferir con el servicio. Podemos suspender cuentas que lo hagan, avisando cuando sea posible.",
        "Lo que publicás en la comunidad de un gimnasio lo ven las personas de ese gimnasio; participar es voluntario.",
      ] },
      { h: "6. Contenido y propiedad", p: [
        "Tus registros y lo que subís siguen siendo tuyos; nos das permiso para guardarlos y mostrarlos a quien vos o tu organización autorizan, sólo para prestar el servicio.",
        "La marca REPI, el diseño y el software pertenecen a Sovare.",
      ] },
      { h: "7. Disponibilidad y cambios", p: [
        "Trabajamos para que REPI funcione siempre, pero puede haber interrupciones, errores o mantenimiento. Parte del entrenamiento se guarda en el teléfono sin conexión y se sincroniza al volver la red.",
        "Podemos mejorar o cambiar funciones. Si cambian estos términos de forma importante, te lo vamos a avisar antes de que rijan.",
      ] },
      { h: "8. Responsabilidad", p: [
        "En la medida que permite la ley, Sovare no responde por lesiones derivadas de entrenamientos indicados por terceros, por decisiones de coaches o gimnasios, ni por pérdidas causadas por un uso contrario a estos términos. Nada de esto limita los derechos que te reconoce la Ley 24.240 de Defensa del Consumidor.",
      ] },
      { h: "9. Baja", p: [
        "Podés dejar de usar REPI cuando quieras y pedir la eliminación de tu cuenta desde Perfil › Tus datos. Un coach o gimnasio puede darte de baja de su espacio; tu cuenta e historial personal siguen siendo tuyos.",
      ] },
      { h: "10. Ley aplicable y contacto", p: [
        `Se aplican las leyes de la República Argentina. Consultas: ${MAIL} o WhatsApp ${CONTACT.phoneLabel}.`,
      ] },
    ],
  },
  privacy: {
    title: "Política de privacidad",
    intro: `${WHO} Esta política explica qué datos usa REPI, para qué, quién los ve y qué derechos tenés, conforme a la Ley 25.326 de Protección de Datos Personales.`,
    sections: [
      { h: "1. Responsable", p: [
        `Sovare es responsable de los datos de tu cuenta. Cuando entrenás con un gimnasio, ese gimnasio es responsable de los datos de su relación con vos y Sovare los trata por su cuenta (ver Acuerdo para organizaciones). Contacto para privacidad: ${MAIL}.`,
      ] },
      { h: "2. Qué datos usamos", p: [
        "Cuenta: nombre, email, fecha de nacimiento, contraseña (cifrada) y preferencias como la unidad de peso.",
        "Entrenamiento: programas asignados, series, cargas, repeticiones, esfuerzo, notas, cambios de ejercicio, objetivos, agenda e historial.",
        "Seguimiento: check-ins (energía, sueño, ánimo), molestias y lesiones que registres, fotos o videos que subas y mensajes con tu coach o tu gimnasio.",
        "Uso y seguridad: dispositivo y navegador, registros de acceso y de acciones sensibles, y el token de notificaciones si las activás.",
        "Molestias, lesiones y otros datos de salud son datos sensibles: sólo se guardan si los cargás vos y sólo se comparten con quien autorizás.",
      ] },
      { h: "3. Para qué", p: [
        "Para prestar el servicio: mostrar tu rutina, guardar tu entrenamiento, que tu coach o gimnasio te acompañe, enviarte avisos que elegiste y darte soporte. También para mantener la seguridad y prevenir abusos.",
        "No vendemos tus datos ni los usamos para publicidad de terceros. Hoy REPI no usa inteligencia artificial sobre tus datos; si eso cambia, lo vamos a informar antes y pedir tu permiso cuando corresponda.",
      ] },
      { h: "4. Quién los ve", p: [
        "Tu coach ve tus entrenamientos con él y lo que le compartas en Privacidad; tus datos sensibles, sólo si lo activás. Tu gimnasio ve lo necesario para atenderte según el rol de cada persona del equipo; no ve tus mensajes privados con tu coach.",
        "Lo que no compartís con una organización no se pasa a otra, aunque uses el mismo email.",
        "Proveedores que nos ayudan a operar, con acceso limitado a esa tarea: alojamiento de la aplicación (Vercel), base de datos y archivos (Supabase) y envío de correos (Resend). Pueden estar fuera de Argentina: la base de datos está en San Pablo, Brasil. Sólo los usamos con compromisos de confidencialidad y seguridad.",
        "Podemos dar datos a una autoridad sólo cuando la ley lo exige.",
      ] },
      { h: "5. Cuánto tiempo", p: [
        "Mientras tengas la cuenta. Si pedís la eliminación, borramos tus datos o los dejamos anónimos, salvo lo que la ley nos obligue a conservar; te avisamos qué se conservó y por qué. Las copias de seguridad se renuevan solas y pueden tardar en reflejar el borrado.",
      ] },
      { h: "6. Tus derechos", p: [
        `Podés acceder, rectificar, actualizar y pedir la supresión de tus datos. Desde Perfil › Tus datos descargás una copia y pedís la eliminación; también podés escribir a ${MAIL}. Podés retirar permisos compartidos en cualquier momento desde Privacidad.`,
        "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326.",
        "La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
      ] },
      { h: "7. Menores", p: [
        "Menores de 13 años no pueden registrarse. Entre 13 y 17 años, las fotos, los videos y los datos de salud quedan bloqueados hasta que una persona adulta responsable lo apruebe.",
      ] },
      { h: "8. Seguridad", p: [
        "Conexión cifrada, contraseñas cifradas, verificación en dos pasos para quienes administran gimnasios y REPI, archivos privados y registro de acciones sensibles. Ningún sistema es infalible: si detectamos un incidente que te afecte, te avisamos.",
      ] },
      { h: "9. Cambios", p: [
        "Si cambiamos esta política de forma importante, te lo avisamos antes de que rija.",
      ] },
    ],
  },
  dpa: {
    title: "Acuerdo de tratamiento de datos para organizaciones",
    intro: `${WHO} Este acuerdo lo acepta el responsable de cada gimnasio u organización al activar su espacio y se suma a sus condiciones comerciales con Sovare.`,
    sections: [
      { h: "1. Roles", p: [
        "El gimnasio es responsable de los datos de sus socios, alumnos y equipo dentro de su espacio. Sovare actúa como encargado del tratamiento (artículo 25 de la Ley 25.326): trata esos datos sólo para prestar REPI y según las instrucciones del gimnasio que la app permite configurar.",
      ] },
      { h: "2. Obligaciones del gimnasio", p: [
        "Tener una base legítima para tratar los datos de sus socios e informarles el uso de REPI; mantener al día altas, pausas y bajas; otorgar a su equipo sólo los permisos necesarios por rol y sede; no cargar datos sensibles que la persona no haya consentido.",
      ] },
      { h: "3. Obligaciones de Sovare", p: [
        "Usar los datos sólo para el servicio y no para fines propios; mantener confidencialidad, también de su personal y proveedores; aplicar medidas de seguridad (cifrado en tránsito, control de acceso por rol, verificación en dos pasos para administradores, registro de acciones); no ceder los datos salvo obligación legal.",
        "Los datos de salud y los mensajes privados entre alumno y coach no se muestran al gimnasio por ser gimnasio: sólo lo que cada persona autoriza.",
      ] },
      { h: "4. Subencargados", p: [
        "Sovare usa proveedores de alojamiento (Vercel), base de datos y archivos (Supabase, región San Pablo, Brasil) y correo (Resend). Avisará al gimnasio antes de sumar otros que traten estos datos.",
      ] },
      { h: "5. Derechos de las personas", p: [
        "Sovare ayuda al gimnasio a responder pedidos de acceso, rectificación y supresión. Cada persona también puede descargar sus datos y pedir la eliminación desde su perfil.",
      ] },
      { h: "6. Incidentes", p: [
        "Si Sovare detecta un incidente de seguridad que afecte datos del gimnasio, le avisa sin demora indebida con lo que se sepa y las medidas tomadas.",
      ] },
      { h: "7. Fin del servicio", p: [
        "Al terminar el acuerdo, Sovare devuelve los datos del gimnasio en un formato legible si lo pide y después los borra, salvo lo que la ley obligue a conservar. Las cuentas personales de socios y alumnos siguen siendo de cada persona.",
      ] },
      { h: "8. Contacto", p: [`${MAIL} · WhatsApp ${CONTACT.phoneLabel}.`] },
    ],
  },
};
