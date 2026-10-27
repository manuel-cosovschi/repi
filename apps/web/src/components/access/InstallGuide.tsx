"use client";
// Guía para agregar REPI a inicio (anexo 26/10 «Lanzamiento web y guía para agregar a inicio»; confirmado: web primero
// y guía antes del alta o login en el teléfono). Explica los controles del navegador sin dibujar botones del sistema:
// el único botón que instala es el evento real del navegador (beforeinstallprompt). «Ya lo agregué» sólo registra lo que
// dice la persona; no acredita instalación ni concede acceso. Decisión del usuario 27/10 (D82): en el teléfono no se ofrece
// seguir en el navegador; sólo agregar a inicio o ver cómo hacerlo.
import { useEffect, useMemo, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { ArrowLeft, Copy, DotsThreeVertical, Export, PlusSquare, CheckCircle, DeviceMobile } from "@phosphor-icons/react";
import { Ic } from "@/components/ui/Ic";
import { Wordmark } from "./Wordmark";
import { detectEnv, forgetInstallEvent, installEvent, markGuide, type Env, type InstallEvent, type Platform } from "@/lib/platform";
import type { EntryKind } from "@/lib/entry";

type Props = {
  /** Destino público del ingreso, si ya se conoce (p. ej. gimnasio y sede del QR). Nunca datos del destinatario. */
  context?: { title: string; detail?: string } | null;
  /** Qué mostrar para retomar el alta desde el ícono. La bienvenida comercial no se muestra: es un enlace personal. */
  recovery?: { k: EntryKind; v: string } | null;
  onContinue: () => void;
  /** Ayuda posterior (/instalar): sin pasos de alta y con QR para abrir en el teléfono desde la computadora. */
  help?: boolean;
};

export function InstallGuide({ context, recovery, onContinue, help = false }: Props) {
  const [env, setEnv] = useState<Env | null>(null);
  const [platform, setPlatform] = useState<Platform>("ios");
  const [step, setStep] = useState(0);
  const [bip, setBip] = useState<InstallEvent | null>(null);
  const [outcome, setOutcome] = useState<"accepted" | "dismissed" | null>(null);
  const [added, setAdded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    const e = detectEnv();
    setEnv(e);
    setPlatform(e.platform === "other" ? (help ? "other" : "ios") : e.platform);
    setBip(installEvent());
    const on = () => setBip(installEvent());
    window.addEventListener("repi:bip", on);
    return () => window.removeEventListener("repi:bip", on);
  }, [help]);
  useEffect(() => { if (first.current) { first.current = false; return; } head.current?.focus(); window.scrollTo(0, 0); }, [step]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(null); }
  };
  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    const r = await bip.userChoice;
    forgetInstallEvent(); // el navegador entrega el evento una sola vez: no se vuelve a ofrecer
    setBip(null);
    setOutcome(r.outcome);
    if (r.outcome === "accepted") markGuide("added");
  };

  const total = help ? 2 : 3;
  const label = `${step + 1} de ${total}`;
  const plat = (
    <div className="ig-plat" role="group" aria-label="Tu teléfono">
      {([["ios", "iPhone o iPad"], ["android", "Android"], ...(env?.platform === "other" ? [["other", "Computadora"]] as const : [])] as const).map(([p, t]) => (
        <button key={p} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)}>{t}</button>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (step === 0) {
    body = (
      <>
        <div className="ac-head">
          <img className="ig-icon" src="/brand/repi_icon.png" width={72} height={72} alt="" />
          <h1 ref={head} tabIndex={-1}>{help ? "Cómo agregar Repi a inicio" : "Agregá Repi a tu pantalla de inicio"}</h1>
          <p className="ac-sub">Entrás con un toque desde el ícono, a pantalla completa, como una app.{help ? "" : " Después seguís con tu alta."}</p>
        </div>
        {context && <div className="ac-info"><span className="ac-ini" aria-hidden="true">{initials(context.title)}</span><span><strong>{context.title}</strong>{context.detail && <small>{context.detail}</small>}</span></div>}
        {env?.inApp && <p className="ac-note">Estás en el navegador de otra app, que no permite agregar a inicio. Abrí este enlace en Safari o Chrome: tocá el menú (⋯ o ⋮) y elegí «Abrir en el navegador».</p>}
        {bip && !help && <button type="button" className="ac-cta" onClick={install}>Agregar Repi a inicio</button>}
        {outcome === "accepted" && <p className="ac-note" role="status">Tu teléfono está agregando REPI. Cuando aparezca el ícono, abrilo desde ahí.</p>}
        <button type="button" className={bip && !help ? "ac-sec" : "ac-cta"} onClick={() => setStep(1)}>Ver cómo hacerlo</button>
        {env?.inApp && <button type="button" className="ac-sec" onClick={() => copy(location.href, "link")}><Ic i={Copy} size={18} /> {copied === "link" ? "Enlace copiado" : "Copiar enlace"}</button>}
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        <div className="ac-head">
          <h1 ref={head} tabIndex={-1}>{platform === "other" ? "Abrilo en tu teléfono" : platform === "ios" ? "En Safari" : "En Chrome"}</h1>
          <p className="ac-sub">{platform === "other"
            ? "En la computadora usás REPI desde el navegador. Para el teléfono, escaneá este código con la cámara."
            : "Seguí estos pasos con los controles de tu navegador. Si no coinciden, elegí tu teléfono."}</p>
        </div>
        {plat}
        {platform === "other" && <PhoneQr />}
        {platform === "ios" && (
          <ol className="ig-steps">
            <Li i={Export} t="Tocá Compartir" d="El cuadrado con la flecha hacia arriba: abajo en Safari o junto a la dirección en otros navegadores." />
            <Li i={PlusSquare} t="Elegí «Agregar a inicio»" d="Si no la ves, deslizá la lista hacia arriba o tocá «Ver más»." />
            <Li i={CheckCircle} t="Tocá «Agregar»" d="Si aparece «Abrir como app web», dejala activada." />
          </ol>
        )}
        {platform === "android" && (bip || outcome ? (
          <>
            {bip && <button type="button" className="ac-cta" onClick={install}>Agregar Repi a inicio</button>}
            {outcome === "accepted" && <p className="ac-note" role="status">Tu teléfono está agregando REPI. Cuando aparezca el ícono, abrilo desde ahí.</p>}
            {outcome === "dismissed" && <p className="ac-note" role="status">No pasa nada: podés agregarla después desde el menú del navegador.</p>}
          </>
        ) : (
          <ol className="ig-steps">
            <Li i={DotsThreeVertical} t="Abrí el menú del navegador" d="Los tres puntos, arriba a la derecha en Chrome." />
            <Li i={PlusSquare} t="Tocá «Agregar a la pantalla principal» o «Instalar app»" d="El nombre cambia según el navegador y la versión." />
            <Li i={CheckCircle} t="Confirmá con «Agregar» o «Instalar»" d="El ícono de REPI aparece en tu pantalla de inicio." />
          </ol>
        ))}
        {platform !== "other" && <button type="button" className="ac-cta" onClick={() => { if (help) { markGuide("added"); setAdded(true); } else setStep(2); }}>{help ? "Ya lo agregué" : "Siguiente"}</button>}
        {help && added && <p className="ac-note" role="status">Listo. Abrí REPI desde tu pantalla de inicio cuando quieras.</p>}
        {help && <button type="button" className="ac-sec" onClick={onContinue}>Volver</button>}
      </>
    );
  } else {
    const code = recovery && recovery.k !== "activate" ? recovery.v : null;
    body = (
      <>
        <div className="ac-head">
          <h1 ref={head} tabIndex={-1}>Al abrir REPI desde el ícono</h1>
          <p className="ac-sub">{recovery?.k === "activate"
            ? "Seguís con la bienvenida de tu espacio. Si no aparece, volvé a abrir el enlace del email: sigue vigente hasta su vencimiento."
            : code
              ? `Seguís con tu ${recovery!.k === "join" ? "pedido de acceso" : "invitación"}. Si no aparece, tocá «¿Venís de un QR o una invitación?» e ingresá este código:`
              : "Ingresá con tu cuenta. Si estabas en un alta, tené a mano el enlace o el código de tu invitación o del QR de tu sede."}</p>
        </div>
        {code && (
          <div className="ig-code">
            <span><small>{recovery!.k === "join" ? "Código de tu sede" : "Código de invitación"}</small><strong>{code}</strong></span>
            <button type="button" className="ac-sec" onClick={() => copy(code, "code")} aria-label={`Copiar código ${code}`}><Ic i={Copy} size={18} /> {copied === "code" ? "Copiado" : "Copiar"}</button>
          </div>
        )}
        <p className="ac-note">Agregar REPI a inicio no confirma tu acceso: {recovery?.k === "join" ? "el equipo del gimnasio lo aprueba." : "seguís con los mismos pasos y permisos."}</p>
        {added
          ? <p className="ac-note" role="status">Listo. Cerrá esta pestaña y abrí REPI desde el ícono de tu pantalla de inicio para seguir.</p>
          : <button type="button" className="ac-cta" onClick={() => { markGuide("added"); setAdded(true); }}>Ya lo agregué</button>}
      </>
    );
  }

  return (
    <div className="ac-form ig">
      <div className="ac-top">
        {step > 0
          ? <button type="button" className="ac-back" onClick={() => setStep(step - 1)} aria-label="Volver"><Ic i={ArrowLeft} size={22} /></button>
          : <Wordmark width={62} />}
        <span className="ac-step">{label}</span>
      </div>
      {body}
      {copied && <div aria-live="polite" className="sr-only">{copied === "code" ? "Código copiado" : "Enlace copiado"}</div>}
    </div>
  );
}

function Li({ i, t, d }: { i: typeof Export; t: string; d: string }) {
  return (
    <li>
      <span className="ig-num" aria-hidden="true"><Ic i={i} size={20} color="#00D1FF" /></span>
      <span><strong>{t}</strong><small>{d}</small></span>
    </li>
  );
}

function PhoneQr() {
  const url = typeof location === "undefined" ? "" : `${location.origin}/instalar`;
  const svg = useMemo(() => (url ? renderSVG(url, { border: 1 }) : ""), [url]);
  return (
    <>
      <div className="ac-qr" role="img" aria-label="Código QR para abrir REPI en el teléfono" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="ac-note"><Ic i={DeviceMobile} size={16} /> O abrí {url.replace(/^https?:\/\//, "")} en el navegador del teléfono.</p>
    </>
  );
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
