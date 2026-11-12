// D218 · Baja de mensajes comerciales de REPI (enlace del pie de cada email de Captación). Confirmar con un botón: los
// escáneres de correo abren enlaces solos y no deben dar de baja a nadie. No muestra datos del expediente.
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/access/Wordmark";
import { readUnsubscribeToken } from "@/server/leads/core";
import "@/styles/site.css";

export const viewport: Viewport = { themeColor: "var(--ui-text)" };
export const metadata: Metadata = { title: "Dejar de recibir mensajes · REPI", robots: { index: false } };

export default async function Baja({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  if (!readUnsubscribeToken(token.slice(0, 200))) notFound();
  const done = (await searchParams).ok === "1";
  return (
    <div className="st">
      <header className="st-head"><div className="st-wrap"><Link href="/conoce" aria-label="REPI"><Wordmark width={72} /></Link></div></header>
      <main className="st-wrap lg" id="contenido">
        <h1>{done ? "Listo, no te vamos a escribir más" : "Dejar de recibir mensajes de REPI"}</h1>
        {done ? <p>Registramos tu pedido. No vas a recibir más mensajes comerciales de REPI por ningún canal. Si fue un error, respondé cualquier correo nuestro.</p> : <>
          <p>Si no querés que REPI (Sovare) te vuelva a contactar por mensajes comerciales, confirmá acá. Se aplica a email, WhatsApp e Instagram.</p>
          <form method="post" action={`/api/baja/${encodeURIComponent(token)}`}><button type="submit" className="btn pri">Confirmar la baja</button></form>
        </>}
      </main>
    </div>
  );
}
