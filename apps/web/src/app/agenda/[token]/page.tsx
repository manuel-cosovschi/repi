// D218 · Agenda pública de Captación: el gimnasio que recibió el email elige un horario y queda la reunión (con invitación de
// calendario al titular). Enlace firmado por gimnasio; no muestra datos internos ni de otros gimnasios.
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/access/Wordmark";
import { bookingView } from "@/server/leads/autopilot";
import "@/styles/site.css";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "var(--ui-text)" };
export const metadata: Metadata = { title: "Elegí un horario · REPI", robots: { index: false } };

const day = (s: string) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${s.slice(0, 10)}T12:00:00-03:00`));

export default async function Agenda({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { token } = await params;
  const v = await bookingView(token.slice(0, 200));
  if (!v) notFound();
  const q = await searchParams;
  const byDay = new Map<string, string[]>();
  for (const s of v.slots) byDay.set(s.slice(0, 10), [...(byDay.get(s.slice(0, 10)) ?? []), s]);
  const done = q.ok || v.booked;
  return (
    <div className="st">
      <header className="st-head"><div className="st-wrap"><Link href="/conoce" aria-label="REPI"><Wordmark width={72} /></Link></div></header>
      <main className="st-wrap lg" id="contenido">
        {done ? <>
          <h1>¡Listo! Quedó agendada la reunión</h1>
          <p>{v.booked ? <>Para el <b>{day(v.booked)}</b> a las <b>{v.booked.slice(11)}</b>.</> : null} {v.sender.name} se va a comunicar a la hora acordada. Si necesitás cambiarla, escribí por WhatsApp al {v.sender.whatsapp}.</p>
        </> : <>
          <h1>Elegí un horario para conocer REPI</h1>
          <p>Una charla de {v.minutes} minutos con {v.sender.name} ({v.sender.company}) para ver REPI con el caso de {v.name}. Horarios de Argentina.</p>
          {q.error && <p role="alert" style={{ color: "var(--ui-error-text)" }}>{q.error}</p>}
          {v.slots.length === 0 ? <p>No hay horarios disponibles en este momento. Escribí por WhatsApp al {v.sender.whatsapp} y lo coordinamos.</p> :
            <form method="post" action={`/api/agenda/${encodeURIComponent(token)}`} style={{ display: "grid", gap: 16, maxWidth: 560 }}>
              <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 12 }}>
                <legend style={{ fontWeight: 600, marginBottom: 8 }}>Día y hora</legend>
                {[...byDay.entries()].map(([d, slots]) => (
                  <div key={d}><div style={{ textTransform: "capitalize", fontWeight: 600, marginBottom: 6 }}>{day(d)}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{slots.map((s) => (
                      <label key={s} style={{ border: "1px solid var(--ui-border)", borderRadius: 10, padding: "8px 12px", cursor: "pointer", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input type="radio" name="slot" value={s} required /> {s.slice(11)}
                      </label>))}</div></div>
                ))}
              </fieldset>
              <label style={{ display: "grid", gap: 4 }}>Tu nombre<input name="name" required maxLength={80} autoComplete="name" style={{ minHeight: 44 }} /></label>
              <label style={{ display: "grid", gap: 4 }}>Teléfono o WhatsApp<input name="phone" required maxLength={40} inputMode="tel" autoComplete="tel" style={{ minHeight: 44 }} /></label>
              <label style={{ display: "grid", gap: 4 }}>Email (opcional, para mandarte la invitación)<input name="email" type="email" maxLength={200} autoComplete="email" style={{ minHeight: 44 }} /></label>
              <label style={{ display: "grid", gap: 4 }}>¿Algo que quieras contarnos? (opcional)<textarea name="note" maxLength={300} rows={3} /></label>
              <button type="submit" className="btn pri" style={{ minHeight: 48 }}>Confirmar reunión</button>
              <p style={{ fontSize: 13, opacity: 0.8 }}>Usamos estos datos sólo para coordinar la reunión.</p>
            </form>}
        </>}
      </main>
    </div>
  );
}
