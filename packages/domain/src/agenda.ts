// Agenda coach ↔ alumno (F-CO-10 / F-HX-07, D98). Sesiones presenciales u online como entidad propia: el estado del
// turno (agendada, cancelada, realizada, no asistió) y la respuesta del alumno (confirmó, no puede) van separados, y la
// asistencia la marca el coach: nunca se deduce de haber registrado un entrenamiento. Hora de Argentina (UTC−3 fijo).

export const APPT_STATUS = { scheduled: "Agendada", cancelled: "Cancelada", done: "Realizada", no_show: "No asistió" } as const;
export type ApptStatus = keyof typeof APPT_STATUS;
export const APPT_RESPONSE = { pending: "Sin confirmar", confirmed: "Confirmó", declined: "No puede" } as const;
export type ApptResponse = keyof typeof APPT_RESPONSE;
export const APPT_MODALITY = { presencial: "Presencial", online: "Online" } as const;
export type ApptModality = keyof typeof APPT_MODALITY;
export const APPT_DURATIONS = [30, 45, 60, 75, 90, 120] as const;

/** «AAAA-MM-DD» + «HH:MM» en hora argentina → instante UTC; null si no es una fecha/hora real. */
export function arToUtc(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  // Rechaza fechas que JS «corrige» (31/02 → 03/03).
  const back = new Date(d.getTime() - 3 * 3_600_000).toISOString();
  return back.slice(0, 10) === date && back.slice(11, 16) === time ? d : null;
}

/** Instante → partes en hora argentina. */
export function arParts(d: Date) {
  const x = new Date(d.getTime() - 3 * 3_600_000).toISOString();
  return { date: x.slice(0, 10), time: x.slice(11, 16) };
}

/** ¿Dos turnos [inicio, inicio + duración) se pisan? */
export const overlaps = (a: Date, aMin: number, b: Date, bMin: number) =>
  a.getTime() < b.getTime() + bMin * 60_000 && b.getTime() < a.getTime() + aMin * 60_000;

const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Archivo iCalendar (RFC 5545) de un turno, para agregarlo al calendario del teléfono. Sin datos de salud. */
export function appointmentIcs(p: { id: string; startsAt: Date; durationMin: number; title: string; place?: string | null; description?: string | null; cancelled?: boolean; now?: Date }) {
  const end = new Date(p.startsAt.getTime() + p.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//REPI//Agenda//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${p.id}@repiclub.com`, `DTSTAMP:${icsTime(p.now ?? new Date())}`, `DTSTART:${icsTime(p.startsAt)}`, `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsEsc(p.title)}`, ...(p.place ? [`LOCATION:${icsEsc(p.place)}`] : []), ...(p.description ? [`DESCRIPTION:${icsEsc(p.description)}`] : []),
    `STATUS:${p.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
