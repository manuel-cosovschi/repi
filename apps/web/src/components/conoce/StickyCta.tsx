"use client";
// Barra inferior en el teléfono (D205): aparece después del inicio y se oculta cuando el formulario está a la vista, para no
// tapar contenido. La página deja espacio abajo para que nunca cubra el último elemento.
import { useEffect, useState } from "react";
import { ChatCircle } from "@phosphor-icons/react";
import { CONTACT } from "@/lib/contact";
import { track } from "@/lib/site-track";

export function StickyCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("cn-hero"), contact = document.getElementById("contacto");
    if (!hero || !contact || typeof IntersectionObserver === "undefined") return;
    let pastHero = false, atContact = false;
    const upd = () => setShow(pastHero && !atContact);
    const a = new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; upd(); });
    const b = new IntersectionObserver(([e]) => { atContact = e.isIntersecting; upd(); }, { rootMargin: "0px 0px -20% 0px" });
    a.observe(hero); b.observe(contact);
    return () => { a.disconnect(); b.disconnect(); };
  }, []);
  return (
    <aside className={`cn-sticky${show ? " on" : ""}`} aria-label="Accesos rápidos" aria-hidden={!show}>
      <a href="#demos" className="cn-btn pri" tabIndex={show ? 0 : -1} onClick={() => track("demo_click", { target: "sticky" })}>Probar la demo</a>
      <a href={`${CONTACT.whatsapp}?text=${encodeURIComponent("Hola, conocí REPI y quiero saber más.")}`} target="_blank" rel="noreferrer" className="cn-btn wa" tabIndex={show ? 0 : -1}
        aria-label="Hablar por WhatsApp" onClick={() => track("whatsapp_click", { target: "sticky" })}>
        <ChatCircle size={20} weight="bold" aria-hidden="true" />WhatsApp
      </a>
    </aside>
  );
}
