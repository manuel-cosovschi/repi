"use client";
// REPI Acceso. Pasos, textos y jerarquía de handoff/.../REPI Acceso.dc.html; cada acción llama al servidor real.
// Diferencias con el prototipo: docs/DESIGN_CONTRACT.md §Acceso.
// Anexo 26/10: coach y gym no se dan de alta solos (contacto comercial → alta en Admin → invitación de bienvenida);
// el socio entra por el QR de su sede y el equipo de sala o recepción confirma el acceso.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSVG } from "uqr";
import {
  CONSENT_CATALOG, OTP_RE, classifyAge, isCodeShape, isEmail, localDate, normalizeCode, parseBirthDate, passwordHint, passwordOk, passwordRules,
} from "@repi/domain";
import { consentOffered } from "@/lib/features";
import { authClient } from "@/lib/auth-client";
import { signOutSafely } from "@/lib/session-cleanup";
import { api, ApiError } from "@/lib/api";
import { Wordmark } from "./Wordmark";
import { InstallGuide, InstallSteps } from "./InstallGuide";
import { clearEntry, entryHref, parseEntryInput, readEntry, saveEntry, type Entry } from "@/lib/entry";
import { detectEnv, guideDone } from "@/lib/platform";
import { Ic } from "@/components/ui/Ic";
import { ArrowLeft, Barbell, CaretRight, EnvelopeSimple, Play, QrCode, Storefront, type Icon } from "@phosphor-icons/react";

const IC = { coach: Barbell, gym: Storefront, invite: EnvelopeSimple, member: QrCode };

type Step =
  | "login" | "choose" | "coach1" | "gym1" | "leadDone" | "verify"
  | "code" | "invite" | "inv1" | "tutor" | "tutorWait" | "consent" | "member1" | "join" | "joinAcct" | "joinStatus"
  | "activate" | "actAcct" | "consentGym" | "appDone" | "rec1" | "rec2" | "rec3" | "twofa" | "twofaSetup" | "workspace" | "recover" | "pendingInv" | "ready";
type Flow = "login" | "coach" | "gym" | "invite" | "member" | "join" | "activate";
type Fields = Record<string, string | boolean | number | undefined>;
type Invite = { code: string; kind: "coach_client" | "gym_staff"; orgName: string; orgInitials: string; detail: string; inviter: string | null };
type JoinInfo = { orgName: string; locationName: string; operational: boolean };
type JoinReq = { id: string; code: string; kind: string; status: "pending" | "approved" | "rejected" | "cancelled" | "expired"; orgName: string; locationName: string; reason: string | null; message: string | null };
type ActInfo = { state: string; orgName: string; kind: "gym" | "coach"; emailHint: string };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
type Workspace = { key: string; ini: string; title: string; detail: string; href: string; needs2fa: boolean };
type Me = { user: { name: string; email: string; twoFactorEnabled: boolean }; minor: boolean; guardian: "approved" | "pending" | "none" | null;
  member: { step: "consentGym" | "memberPending" | null; orgId?: string; orgName?: string; locationName?: string }; workspaces: Workspace[];
  invitations: { code: string; kind: string; orgName: string; orgInitials: string; detail: string }[] };

type FieldV = { k: string; label: string; type?: string; ph?: string; mode?: "text" | "email" | "numeric"; ac?: string; max?: number; code?: boolean; hint?: string; hintOk?: boolean; bad?: boolean };
type Chip = { k: string; label: string; opts: [string, string][] };
type Toggle = { k: string; title: string; desc: string; locked?: boolean; disabledReason?: string };
type Row = { ini: string; title: string; detail: string; go?: () => void; badge?: string; badgeKind?: "cyan" | "warn"; on?: boolean };
type Btn = { label: string; go: () => void | Promise<void>; disabled?: boolean };
type View = {
  title: string; sub?: string; stepLabel?: string; info?: { ini: string; t: string; d: string };
  options?: { t: string; d: string; icon: Icon; go: () => void }[]; fields?: FieldV[]; chips?: Chip[]; toggles?: Toggle[];
  list?: Row[]; listLabel?: string; checks?: { k: string; t: string }[]; note?: string; cta?: Btn & { ready?: boolean };
  social?: boolean; secondary?: Btn[]; links?: { pre: string; label: string; go: () => void }[]; extra?: React.ReactNode;
};

export type AccessInitial = { code?: string; sede?: string; step?: string; next?: string; join?: string; activate?: string };

export function AccessFlow({ initial, social }: { initial: AccessInitial; social: { google: boolean; apple: boolean } }) {
  const [step, setStep] = useState<Step>("login");
  const [hist, setHist] = useState<Step[]>([]);
  const [flow, setFlow] = useState<Flow>("login");
  const [f, setF] = useState<Fields>({});
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [joinReq, setJoinReq] = useState<JoinReq | null>(null);
  const [actInfo, setActInfo] = useState<ActInfo | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [totp, setTotp] = useState<{ uri: string; backup: string[] } | null>(null);
  const [next, setNext] = useState<string | null>(initial.next && /^\/(?!\/)/.test(initial.next) && !/[\\\r\n]/.test(initial.next) ? initial.next : null);
  const [backupMode, setBackupMode] = useState(false);
  // Anexo PWA: guía antes del alta/login en el teléfono y contexto de entrada recuperable al abrir desde el ícono.
  const [guide, setGuide] = useState(false);
  const [readyHref, setReadyHref] = useState<string | null>(null);
  const [resume, setResume] = useState<Entry | null>(null);
  const entry = initial.join ? { k: "join" as const, v: initial.join } : initial.code ? { k: "code" as const, v: normalizeCode(initial.code) }
    : initial.activate ? { k: "activate" as const, v: initial.activate } : null;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const headRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const flash = useCallback((t: string) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  const to = useCallback((s: Step, fl?: Flow) => {
    setHist((h) => [...h, step]);
    setStep(s);
    setErr(null);
    if (fl) setFlow(fl);
  }, [step]);
  // Tras verificar el email o crear un espacio no se vuelve atrás: el paso previo ya no aplica.
  const toFresh = useCallback((s: Step, fl?: Flow) => { setHist([]); setStep(s); setErr(null); if (fl) setFlow(fl); }, []);
  const start = useCallback((s: Step, fl: Flow, fields: Fields = {}) => {
    setHist([]); setStep(s); setFlow(fl); setF(fields); setErr(null);
  }, []);
  const fail = (m: string) => setErr(m);
  const set = (k: string, v: string | boolean | number | undefined) => { setF((x) => ({ ...x, [k]: v })); setErr(null); };
  const s = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");

  // Envuelve acciones asíncronas: estado ocupado y error visible (role="alert").
  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) {
      fail(e instanceof ApiError || e instanceof Error ? e.message : "Algo falló. Probá de nuevo.");
    } finally { setBusy(false); }
  };
  const authErr = (e: { message?: string; code?: string; status?: number } | null | undefined, fallback: string) => {
    if (!e) return;
    if (e.status === 429) throw new Error("Demasiados intentos. Esperá un minuto y probá de nuevo.");
    throw new Error(fallback);
  };

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headRef.current?.focus();
    window.scrollTo(0, 0);
  }, [step]);

  const loadMe = useCallback(async () => { const m = await api<Me>("me"); setMe(m); return m; }, []);

  // Después de autenticarse: invitación pendiente → pasos del alta de socio → selector de espacio.
  // Función simple (no memorizada): lee siempre el flujo y los campos vigentes (QR y activación dependen de ellos).
  async function afterAuth(code: string | null = pendingCode) {
    setSignedIn(true);
    if (initial.join && flow === "join") { await requestJoin(); return; }
    if (initial.activate && flow === "activate") { await acceptActivation(); return; }
    if (code) {
      const inv = await api<Invite>(`invitations/${code}`);
      setInvite(inv);
      setPendingCode(null);
      if (inv.kind === "gym_staff") {
        await api("invitations/accept", { body: { code: inv.code } });
        flash(`${inv.orgName} se sumó como un espacio nuevo.`);
      } else {
        const m = await loadMe();
        setF((x) => ({ ...x, minor: m.minor }));
        setFlow("invite");
        setHist([]); setStep(m.minor && m.guardian === "none" ? "tutor" : "consent");
        return;
      }
    }
    const m = await loadMe();
    setHist([]);
    if (next) { window.location.assign(next); return; }
    if (m.member.step === "consentGym") { setFlow("member"); setStep("consentGym"); return; }
    if (m.member.step === "memberPending") {
      const reqs = await api<JoinReq[]>("/api/me/gym/joins");
      const p = reqs.find((r) => r.status === "pending");
      if (p) { setJoinReq(p); setFlow("join"); setStep("joinStatus"); return; }
    }
    // Invitaciones del mismo email verificado que quedaron sin abrir (p. ej. se perdió el enlace al agregar a inicio).
    if (!code && m.invitations?.length) { setStep("pendingInv"); return; }
    setStep("workspace");
  }

  // Parámetros de entrada: ?code= (enlace de invitación), ?sede= (QR de recepción), ?step=workspace|twofaSetup|rec1.
  useEffect(() => {
    if (entry) saveEntry(entry.k, entry.v);
    else { const e = readEntry(); if (e) setResume(e); }
    const env = detectEnv();
    if (!entry || !env.mobile || env.standalone || guideDone()) return;
    // La guía va antes de registrarse o ingresar; con sesión abierta no se interrumpe.
    authClient.getSession().then((r) => { if (!r.data) setGuide(true); }).catch(() => setGuide(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (initial.code) {
          const code = normalizeCode(initial.code);
          setF({ code });
          setFlow("invite");
          setStep("code");
          if (isCodeShape(code)) { const inv = await api<Invite>(`invitations/${code}`); setInvite(inv); setHist(["code"]); setStep("invite"); }
          return;
        }
        // QR anterior al anexo (?sede=): ya no hay alta por DNI; se explica cómo pedir el QR vigente.
        if (initial.sede) { setFlow("member"); setStep("member1"); return; }
        if (initial.join) {
          setFlow("join"); setStep("join");
          const [info, session] = await Promise.all([api<JoinInfo>(`/api/join/${initial.join}`), authClient.getSession()]);
          setJoinInfo(info);
          saveEntry("join", initial.join, `${info.orgName} · ${info.locationName}`);
          if (session.data) { setSignedIn(true); await loadMe(); }
          return;
        }
        if (initial.activate) {
          setFlow("activate"); setStep("activate");
          const [info, session] = await Promise.all([api<ActInfo>(`/api/activate/${initial.activate}`), authClient.getSession()]);
          setActInfo(info);
          if (session.data) { setSignedIn(true); await loadMe(); }
          return;
        }
        const session = await authClient.getSession();
        if (session.data) {
          if (initial.step === "twofaSetup") { await loadMe(); setStep("twofaSetup"); return; }
          await afterAuth(null);
        } else if (initial.step === "rec1") { setHist(["login"]); setStep("rec1"); } // desde Ayuda: «Olvidé mi contraseña»
      } catch (e) { fail(e instanceof Error ? e.message : "No pudimos cargar tu sesión."); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras la solicitud espera, el estado se actualiza solo (la bandeja del gym puede resolverla en cualquier momento).
  useEffect(() => {
    if (step !== "joinStatus" || joinReq?.status !== "pending") return;
    const t = setInterval(() => { refreshJoin().catch(() => {}); }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, joinReq?.status]);

  useEffect(() => { if (step === "workspace" || step === "tutorWait") loadMe().catch(() => {}); }, [step, loadMe]);

  const pwHintField = (label = "Contraseña"): FieldV => ({ k: "pw", label, type: "password", ac: "new-password", hint: passwordHint(s("pw")), hintOk: passwordOk(s("pw")) });
  async function requestJoin() {
    const r = await api<{ state: "already" | "pending" | "created"; href?: string; request?: JoinReq }>(`/api/join/${initial.join}`, { body: { name: s("name") || undefined, terms: true } });
    if (r.state === "already") { clearEntry(); enter(r.href ?? "/app"); return; }
    setJoinReq(r.request ?? null); setHist([]); setStep("joinStatus"); setErr(null);
  }
  async function refreshJoin() {
    const reqs = await api<JoinReq[]>("/api/me/gym/joins");
    const cur = reqs.find((r) => r.id === joinReq?.id) ?? reqs[0] ?? null;
    setJoinReq(cur);
    return cur;
  }
  async function acceptActivation() {
    const r = await api<{ href: string }>(`/api/activate/${initial.activate}`, { body: {} });
    clearEntry();
    const m = await loadMe();
    const w = m.workspaces.find((x) => x.href === r.href);
    if (w) return goWorkspace(w);
    enter(r.href);
  }
  const leadView = (kind: "coach" | "gym"): View => {
    const ready = s("gname").trim().length >= 2 && s("name").trim().length >= 2 && isEmail(s("email"));
    return {
      title: kind === "coach" ? "Sumate a REPI como coach" : "Sumá tu gimnasio a REPI",
      sub: "El alta la hace el equipo de REPI después de acordar las condiciones con vos. Dejanos tus datos y te escribimos.",
      fields: [
        { k: "gname", label: kind === "coach" ? "Nombre comercial" : "Nombre del gimnasio", ph: kind === "coach" ? "Ej.: Agustín Pérez Coach" : "Ej.: Gym Norte" },
        { k: "name", label: "Tu nombre y apellido", ac: "name" },
        { k: "email", label: "Email de contacto", mode: "email", ac: "email", bad: !!s("email") && !isEmail(s("email")) },
        { k: "phone", label: "Teléfono (opcional)", ac: "tel" },
        { k: "msg", label: kind === "coach" ? "¿Cuántos alumnos tenés? (opcional)" : "Sedes y socios aproximados (opcional)", max: 300 },
      ],
      cta: { label: "Quiero que me contacten", ready, go: run(async () => {
        if (!ready) return fail("Completá el nombre, tu nombre y un email válido.");
        await api("lead", { body: { kind, orgName: s("gname"), contactName: s("name"), email: s("email"), phone: s("phone") || null, message: s("msg") || null } });
        toFresh("leadDone");
      }) },
      note: "No se crea ningún espacio ni se cobra nada hasta que el acuerdo esté registrado y REPI lo habilite.",
    };
  };
  const signIn = async (email: string, password: string) => {
    const r = await authClient.signIn.email({ email, password });
    if (r.error) {
      if (r.error.code === "EMAIL_NOT_VERIFIED" || r.error.status === 403) { setF((x) => ({ ...x, email, otp: "" })); setFlow("login"); to("verify"); return; }
      authErr(r.error, "Revisá el email y la contraseña.");
    }
    if ((r.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) { to("twofa"); return; }
    await afterAuth();
  };
  // Al terminar un alta que vino de un enlace (invitación, QR de sede, bienvenida), antes de entrar se muestran los pasos
  // para agregar REPI a inicio (D123). Con la app abierta desde el ícono, o sin enlace de entrada, se entra directo.
  const enter = (href: string) => {
    if (entry && !detectEnv().standalone) { setReadyHref(href); setHist([]); setStep("ready"); return; }
    window.location.href = href;
  };
  const goWorkspace = (w: Workspace) => {
    if (w.needs2fa) { setNext(w.href); to("twofaSetup"); flash("Este espacio exige verificación en dos pasos."); return; }
    enter(w.href);
  };
  const socialGo = (provider: "google" | "apple" | "magic") => run(async () => {
    if (provider === "magic") {
      if (!isEmail(s("email"))) return fail("Escribí tu email arriba y te mandamos el enlace.");
      const r = await authClient.signIn.magicLink({ email: s("email"), callbackURL: "/acceso?step=workspace" });
      authErr(r.error, "No pudimos enviar el enlace.");
      flash("Si tenés cuenta, te mandamos un enlace para entrar sin contraseña.");
      return;
    }
    if (!social[provider]) { flash(`${provider === "google" ? "Google" : "Apple"} no está disponible en este entorno.`); return; }
    await authClient.signIn.social({ provider, callbackURL: "/acceso?step=workspace" });
  });

  const minorRestricted = !!f.minor && me?.guardian !== "approved";
  const toggles = (scope: "coach_client" | "gym_member"): Toggle[] =>
    // Lo que pertenece a un módulo apagado no se ofrece (D117): compartir medidas o nutrición sin pantalla que las use confunde.
    CONSENT_CATALOG[scope].filter((it) => consentOffered(it.key)).map((it) => ({
      k: `${scope}:${it.key}`, title: it.title, locked: it.locked,
      desc: it.unavailable ? it.unavailable : (minorRestricted && it.minorRestricted ? "No disponible para menores sin autorización explícita." : it.desc),
      disabledReason: it.unavailable ?? (minorRestricted && it.minorRestricted ? "minor" : undefined),
    }));
  const picked = (scope: string) => Object.keys(f).filter((k) => k.startsWith(scope + ":") && f[k]).map((k) => k.slice(scope.length + 1));

  const birthCls = classifyAge(parseBirthDate(s("birth")), localDate(new Date()));
  // Qué falta en un alta, en el orden de los campos: un mensaje que dice exactamente qué corregir.
  const signupGap = (birth: boolean) =>
    !s("name") ? "Falta tu nombre y apellido."
    : !isEmail(s("email")) ? "Revisá el email: no parece válido."
    : birth && birthCls === "invalid" ? "Escribí la fecha de nacimiento como DD/MM/AAAA."
    : !passwordOk(s("pw")) ? `La contraseña necesita ${passwordRules(s("pw")).filter((r) => !r.ok).map((r) => r.label).join(", ")}.`
    : !f.terms ? "Aceptá los términos para continuar." : null;
  const chipsOpts = (xs: string[]): [string, string][] => xs.map((x) => [x, x]);

  const V: Record<Step, () => View> = {
    login: () => ({
      title: "Ingresá a REPI", sub: "Con la misma cuenta entrás a tu app, a tu panel de coach o a tu gimnasio.",
      fields: [{ k: "email", label: "Email", ph: "tu@email.com", mode: "email", ac: "email" }, { k: "pw", label: "Contraseña", type: "password", ac: "current-password" }],
      cta: { label: "Ingresar", go: run(async () => {
        if (!isEmail(s("email")) || !s("pw")) return fail("Revisá el email y la contraseña.");
        await signIn(s("email"), s("pw"));
      }) },
      social: true,
      extra: !resume ? (
        <button type="button" className="ac-opt" onClick={() => { window.location.href = "/demo"; }}>
          <span className="ac-opt-ic" aria-hidden="true"><Ic i={Play} size={22} color="#00D1FF" /></span>
          <span><strong>Probá REPI sin cuenta</strong><small>Demo guiada para dueños, entrenadores, alumnos y personal trainers.</small></span>
          <Ic i={CaretRight} size={16} style={{ color: "var(--t-muted)" }} />
        </button>
      ) : resume ? (
        <button type="button" className="ac-opt" onClick={() => { window.location.href = entryHref(resume); }}>
          <span className="ac-opt-ic" aria-hidden="true"><Ic i={resume.k === "join" ? QrCode : EnvelopeSimple} size={22} color="#00D1FF" /></span>
          <span><strong>Retomá tu alta</strong><small>{resume.label ?? (resume.k === "join" ? "Tu pedido de acceso al gimnasio" : resume.k === "code" ? "Tu invitación" : "La bienvenida de tu espacio")}</small></span>
          <Ic i={CaretRight} size={16} style={{ color: "var(--t-muted)" }} />
        </button>
      ) : undefined,
      links: [
        { pre: "", label: "Olvidé mi contraseña", go: () => to("rec1") },
        { pre: "¿No tenés cuenta?", label: "Crear cuenta", go: () => to("choose") },
        { pre: "¿Te invitaron?", label: "Tengo un código", go: () => to("code", "invite") },
        { pre: "", label: "¿Venís de un QR o una invitación?", go: () => to("recover") },
        { pre: "¿Querés conocer REPI?", label: "Probá la demo guiada", go: () => { window.location.href = "/demo"; } },
        { pre: "¿No podés entrar?", label: "Ayuda y soporte", go: () => { window.location.href = "/ayuda?desde=/acceso"; } },
      ],
    }),
    recover: () => ({
      title: "Retomá tu alta", sub: "Pegá el enlace del QR de tu sede o de tu invitación, o escribí el código que te mostramos al agregar REPI a inicio.",
      fields: [{ k: "rec", label: "Enlace o código", ph: "R7K2QX", ac: "off", max: 300 }],
      cta: { label: "Continuar", ready: s("rec").trim().length >= 4, go: () => {
        const e = parseEntryInput(s("rec"));
        if (!e) return fail("No reconocemos ese enlace o código. Escaneá de nuevo el QR de tu sede o pedí otra vez la invitación.");
        window.location.href = entryHref(e);
      } },
      note: "El código sólo ubica tu sede o tu invitación: el gimnasio o tu entrenador siguen confirmando tu acceso.",
      secondary: [{ label: "Escanear el QR de nuevo", go: () => flash("Abrí la cámara del teléfono y apuntá al QR de recepción: se abre REPI con tu sede.") }],
    }),
    pendingInv: () => ({
      title: "Tenés invitaciones pendientes", sub: `Son para ${me?.user.email ?? "tu email"}. Elegí una para seguir.`,
      listLabel: "Invitaciones", list: (me?.invitations ?? []).map((i) => ({ ini: i.orgInitials, title: i.orgName, detail: i.detail, go: run(async () => { await afterAuth(i.code); }) })),
      links: [{ pre: "", label: "Ahora no", go: () => { setHist([]); setStep("workspace"); } }],
    }),
    choose: () => ({
      title: "¿Cómo vas a usar REPI?", sub: "REPI es cerrado: se entra por invitación, por el QR de tu gimnasio o con un acuerdo con REPI.",
      options: [
        { t: "Me invitó mi coach o mi gimnasio", d: "Tenés un enlace o un código de invitación.", icon: IC.invite, go: () => to("code", "invite") },
        { t: "Soy socio de un gimnasio", d: "Escaneá el QR de tu sede y el equipo confirma tu acceso.", icon: IC.member, go: () => to("member1", "member") },
        { t: "Soy entrenador independiente", d: "Te contactamos para acordar las condiciones. El alta la hace REPI.", icon: IC.coach, go: () => to("coach1", "coach") },
        { t: "Tengo un gimnasio", d: "Sedes, equipo de sala y socios. Te contactamos para el alta.", icon: IC.gym, go: () => to("gym1", "gym") },
      ],
    }),
    coach1: () => leadView("coach"),
    gym1: () => leadView("gym"),
    leadDone: () => ({
      title: "Gracias, te vamos a escribir",
      sub: `Recibimos tus datos. El equipo de REPI te contacta a ${s("email") || "tu email"} para acordar las condiciones.`,
      list: [["1", "Acordamos las condiciones", "Cantidad y precio por socio o alumno"], ["2", "REPI habilita tu espacio", "Con la aceptación registrada"], ["3", "Recibís la invitación de bienvenida", "En el email del responsable"]].map(([ini, t, d]) => ({ ini, title: t, detail: d })),
      cta: { label: "Volver al inicio", go: () => start("login", "login") },
    }),
    verify: () => ({
      title: "Revisá tu email", sub: `Te mandamos un código de 6 dígitos a ${s("email") || "tu email"}.`, stepLabel: flow === "join" ? "2 de 3" : "",
      fields: [{ k: "otp", label: "Código", mode: "numeric", ac: "one-time-code", max: 6, code: true, ph: "······" }],
      cta: { label: "Verificar", ready: OTP_RE.test(s("otp")), go: run(async () => {
        if (!OTP_RE.test(s("otp"))) return fail("El código tiene 6 dígitos.");
        const r = await authClient.emailOtp.verifyEmail({ email: s("email"), otp: s("otp") });
        authErr(r.error, "El código no es correcto o venció. Pedí uno nuevo.");
        if (flow === "join") { setSignedIn(true); return requestJoin(); }
        if (flow === "activate") { setSignedIn(true); return acceptActivation(); }
        if (flow === "invite" && invite) {
          if (invite.kind === "gym_staff") { await api("invitations/accept", { body: { code: invite.code } }); return afterAuth(null); }
          const m = await loadMe(); setF((x) => ({ ...x, minor: m.minor }));
          return toFresh(m.minor ? "tutor" : "consent");
        }
        await afterAuth();
      }) },
      links: [{ pre: "¿No llegó?", label: "Reenviar código", go: run(async () => {
        const r = await authClient.emailOtp.sendVerificationOtp({ email: s("email"), type: "email-verification" });
        authErr(r.error, "No pudimos reenviar el código.");
        flash("Código reenviado.");
      }) }],
    }),
    code: () => ({
      title: "Ingresá tu código", sub: "Está en el mensaje o el email de invitación. También podés abrir el enlace directamente.",
      fields: [{ k: "code", label: "Código de invitación", max: 6, code: true, ph: "R7K2QX" }],
      cta: { label: "Continuar", ready: normalizeCode(s("code")).length === 6, go: run(async () => {
        const code = normalizeCode(s("code"));
        if (code.length !== 6) return fail("El código tiene 6 caracteres.");
        setInvite(await api<Invite>(`invitations/${code}`));
        to("invite", "invite");
      }) },
      secondary: [{ label: "Escanear QR", go: () => flash("Escaneá el QR con la cámara del teléfono: abre este paso con el código cargado.") }],
    }),
    invite: () => invite?.kind === "gym_staff"
      ? {
        title: `${invite.orgName} te invitó`, info: { ini: invite.orgInitials, t: invite.detail, d: invite.inviter ?? "" },
        sub: "Vas a ver la cola de asistencia, los socios de tu sede y tus métricas. No vas a ver mensajes privados ni datos de salud de socios sin permiso.",
        cta: { label: "Crear mi cuenta", go: () => to("inv1") },
        secondary: [{ label: "Ya tengo cuenta REPI", go: () => { setPendingCode(invite.code); to("login"); flash(`Al ingresar, ${invite.orgName} se suma como un espacio nuevo.`); } }],
      }
      : {
        title: `${invite?.orgName ?? "Tu coach"} te invitó`, info: invite ? { ini: invite.orgInitials, t: invite.orgName, d: invite.detail } : undefined,
        sub: "Vas a recibir tus programas, registrar tus entrenamientos y hablar con tu coach. Vos elegís qué otros datos compartir.",
        cta: { label: "Crear mi cuenta", go: () => to("inv1") },
        secondary: [{ label: "Ya tengo cuenta REPI", go: () => { if (invite) setPendingCode(invite.code); to("login"); flash("Al ingresar, tu coach se suma a tu cuenta. Tu historial se mantiene."); } }],
      },
    inv1: () => {
      const staffInv = invite?.kind === "gym_staff";
      const ready = !!s("name") && isEmail(s("email")) && passwordOk(s("pw")) && !!f.terms && (staffInv || birthCls !== "invalid");
      return {
        title: "Tus datos", stepLabel: staffInv ? "1 de 2" : "1 de 3",
        fields: [
          { k: "name", label: "Nombre y apellido", ac: "name" },
          { k: "email", label: "Email", mode: "email", ac: "email", bad: !!s("email") && !isEmail(s("email")) },
          ...(staffInv ? [] : [{ k: "birth", label: "Fecha de nacimiento", mode: "numeric" as const, ph: "DD/MM/AAAA", max: 10, hint: "Si sos menor de 18, le pedimos permiso a un adulto responsable." }]),
          pwHintField(),
        ],
        checks: [{ k: "terms", t: "Acepto los Términos y la Política de privacidad." }],
        cta: { label: "Continuar", ready, go: () => {
          const gap = signupGap(!staffInv);
          if (gap) return fail(gap);
          if (!staffInv && birthCls === "blocked") return fail("Para menores de 13 años la cuenta la crea un adulto responsable.");
          setF((x) => ({ ...x, minor: birthCls === "minor" }));
          return run(async () => {
            await api("sign-up", { body: { flow: "invite", name: s("name"), email: s("email"), password: s("pw"), terms: !!f.terms, birth: staffInv ? undefined : s("birth"), code: invite?.code } });
            to("verify");
          })();
        } },
      };
    },
    tutor: () => ({
      title: "Necesitamos un adulto responsable", sub: "Como sos menor de 18, un padre, madre o tutor tiene que autorizar tu cuenta.", stepLabel: "2 de 3",
      fields: [{ k: "tname", label: "Nombre del adulto" }, { k: "temail", label: "Email del adulto", mode: "email", hint: "Por ahora sólo por email." }],
      chips: [{ k: "trel", label: "Vínculo", opts: chipsOpts(["Madre", "Padre", "Tutor/a legal"]) }],
      cta: { label: "Enviar pedido de autorización", ready: !!s("tname") && isEmail(s("temail")) && !!s("trel"), go: run(async () => {
        if (!(s("tname") && isEmail(s("temail")) && s("trel"))) return fail("Completá los datos del adulto.");
        await api("guardian", { body: { name: s("tname"), email: s("temail"), relation: s("trel") } });
        to("tutorWait");
      }) },
    }),
    tutorWait: () => {
      const ok = me?.guardian === "approved";
      return {
        title: ok ? "Autorización recibida" : "Esperando la autorización",
        sub: ok ? "Tu adulto responsable aprobó tu cuenta." : `Le mandamos a ${s("tname") || "tu adulto responsable"} un enlace para aprobar.`,
        list: [["✓", "Podés ver tu programa y registrar entrenamientos", "Ya disponible"], [ok ? "✓" : "—", "Fotos, videos de récords y datos de salud", ok ? "Habilitados según lo que compartas" : "Desactivados hasta la autorización"], [ok ? "✓" : "—", "Desafíos y rankings del gym", "Con nombre visible solo si el adulto lo permite"]].map(([ini, t, d]) => ({ ini, title: t, detail: d })),
        cta: { label: "Continuar", go: () => to("consent") },
        secondary: ok ? [] : [{ label: "Actualizar estado", go: run(async () => { const m = await loadMe(); flash(m.guardian === "approved" ? "Autorización recibida y registrada." : "Todavía no hay respuesta."); }) }],
      };
    },
    consent: () => ({
      title: `¿Qué compartís con ${invite?.orgName ?? "tu coach"}?`, sub: "Podés cambiarlo cuando quieras desde Perfil › Privacidad.", stepLabel: f.minor ? "3 de 3" : "2 de 3",
      toggles: toggles("coach_client"),
      cta: { label: "Entrar a la app", go: run(async () => {
        if (!invite) return fail("Volvé a abrir el enlace de invitación.");
        await api("invitations/accept", { body: { code: invite.code, grants: picked("coach_client") } });
        clearEntry();
        toFresh("appDone");
      }) },
    }),
    member1: () => ({
      title: "Escaneá el QR de tu sede", sub: "Tu gimnasio tiene un QR fijo en recepción. Al escanearlo con la cámara se abre REPI con tu sede.",
      list: [["1", "Escaneá el QR en recepción", "Con la cámara del teléfono"], ["2", "Creá tu cuenta o ingresá", "Verificamos tu email"], ["3", "El equipo confirma que sos socio/a", "Sala o recepción, en el momento"]].map(([ini, t, d]) => ({ ini, title: t, detail: d })),
      note: "No hace falta DNI. Si tu gimnasio todavía no usa REPI, consultá en recepción.",
      secondary: [{ label: "Ya tengo cuenta REPI", go: () => to("login", "login") }],
    }),
    join: () => {
      const info = joinInfo;
      if (!info) return { title: "Cargando tu sede…" };
      const base = { info: { ini: initials(info.orgName), t: info.orgName, d: info.locationName } };
      if (!info.operational) return { ...base, title: "Este gimnasio todavía no habilitó REPI", sub: "Consultá en recepción cuándo va a estar disponible." };
      if (signedIn) {
        const needName = !me?.user.name;
        return {
          ...base, title: "Pedí tu acceso", stepLabel: "1 de 2",
          sub: `Vas a entrar con ${me?.user.email ?? "tu cuenta"}. El equipo de sala o recepción confirma que sos socio/a.`,
          fields: needName ? [{ k: "name", label: "Nombre y apellido", ac: "name" }] : undefined,
          checks: [{ k: "terms", t: "Acepto los Términos y la Política de privacidad." }],
          cta: { label: "Pedir acceso", ready: !!f.terms && (!needName || s("name").trim().length >= 2), go: run(async () => {
            if (!f.terms) return fail("Aceptá los términos para continuar.");
            await requestJoin();
          }) },
          links: [{ pre: "¿No sos vos?", label: "Usar otra cuenta", go: run(async () => { if (!await signOutSafely()) return; setSignedIn(false); setMe(null); }) }],
        };
      }
      return {
        ...base, title: "Pedí tu acceso a REPI", stepLabel: "1 de 3",
        sub: "Creá tu cuenta con tu email. Después el equipo de sala o recepción confirma que sos socio/a. No hace falta DNI.",
        cta: { label: "Crear mi cuenta", go: () => to("joinAcct") },
        secondary: [{ label: "Ya tengo cuenta REPI", go: () => to("login") }],
      };
    },
    joinAcct: () => {
      const ready = !!s("name") && isEmail(s("email")) && passwordOk(s("pw")) && !!f.terms && birthCls !== "invalid";
      return {
        title: "Tus datos", stepLabel: "1 de 3",
        fields: [
          { k: "name", label: "Nombre y apellido", ac: "name" },
          { k: "email", label: "Email", mode: "email", ac: "email", bad: !!s("email") && !isEmail(s("email")) },
          { k: "birth", label: "Fecha de nacimiento", mode: "numeric", ph: "DD/MM/AAAA", max: 10, hint: "Si sos menor de 18, le pedimos permiso a un adulto responsable." },
          pwHintField(),
        ],
        checks: [{ k: "terms", t: "Acepto los Términos y la Política de privacidad." }],
        cta: { label: "Continuar", ready, go: () => {
          const gap = signupGap(true);
          if (gap) return fail(gap);
          if (birthCls === "blocked") return fail("Para menores de 13 años la cuenta la crea un adulto responsable.");
          return run(async () => {
            await api("sign-up", { body: { flow: "member", name: s("name"), email: s("email"), password: s("pw"), terms: !!f.terms, birth: s("birth") } });
            to("verify");
          })();
        } },
      };
    },
    joinStatus: () => {
      const r = joinReq;
      if (!r) return { title: "No encontramos tu solicitud", secondary: [{ label: "Volver al inicio", go: () => start("login", "login") }] };
      const info = { ini: r.code, t: `${r.orgName} · ${r.locationName}`, d: r.kind === "expansion" ? "Ampliación a otra sede" : r.kind === "reactivation" ? "Reactivación del acceso" : "Código de tu solicitud" };
      if (r.status === "approved") return { info, title: "¡Acceso aprobado!", sub: "Ya podés entrar. Antes, elegí qué ve tu gimnasio.", cta: { label: "Continuar", go: run(async () => { await afterAuth(null); }) } };
      if (r.status === "pending") return {
        info, title: "Tu solicitud llegó a la sede", stepLabel: "", sub: r.message ?? "", // espera, no un paso: el contador no retrocede (F-13)
        list: [["✓", "Solicitud enviada", "Al equipo de sala en turno y a recepción"], ["2", "Confirman que sos socio/a", "Mostrá este código si te lo piden"], ["3", "Entrás a la app", "Con tu programa del gym"]].map(([ini, t, d]) => ({ ini, title: t, detail: d })),
        cta: { label: "Actualizar estado", go: run(async () => { const c = await refreshJoin(); if (c?.status === "pending") flash("Todavía está pendiente."); }) },
        secondary: [{ label: "Cancelar solicitud", go: run(async () => { await api(`/api/me/gym/joins/${r.id}/cancel`, { body: {} }); await refreshJoin(); }) }],
        note: "La solicitud vence a las 24 horas. Este código no prueba que seas socio/a: lo confirma una persona del equipo.",
        extra: <InstallSteps />,
      };
      return {
        info, title: r.status === "rejected" ? "No pudimos aprobar tu acceso" : r.status === "expired" ? "La solicitud venció" : "Solicitud cancelada",
        sub: r.reason ?? r.message ?? "Podés volver a pedirla escaneando el QR de tu sede.",
        secondary: [{ label: "Volver al inicio", go: () => start("login", "login") }],
      };
    },
    activate: () => {
      const a = actInfo;
      if (!a) return { title: "Cargando tu invitación…" };
      const info = { ini: initials(a.orgName), t: a.orgName, d: a.kind === "gym" ? "Gimnasio" : "Coach" };
      if (a.state !== "pending") return { info, title: a.state === "accepted" ? "Esta invitación ya se usó" : "La invitación no está vigente", sub: a.state === "accepted" ? "Ingresá con tu cuenta para entrar a tu espacio." : "Pedí una nueva al equipo de REPI.", secondary: [{ label: "Ir a ingresar", go: () => start("login", "login") }] };
      if (signedIn) return {
        info, title: "Activá tu espacio", sub: `La invitación es para ${a.emailHint}. Tenés que estar con la cuenta de ese email.`,
        note: a.kind === "gym" ? "Como responsable vas a configurar sedes, equipo y el QR de recepción." : undefined,
        cta: { label: "Aceptar y entrar", go: run(acceptActivation) },
        links: [{ pre: "¿Otra cuenta?", label: "Cerrar sesión", go: run(async () => { if (!await signOutSafely()) return; setSignedIn(false); setMe(null); }) }],
      };
      return {
        info, title: "Bienvenido/a a REPI", sub: `REPI habilitó ${a.orgName}. La invitación es para ${a.emailHint}: creá tu cuenta o ingresá con ese email.`,
        cta: { label: "Crear mi cuenta", go: () => to("actAcct") },
        secondary: [{ label: "Ya tengo cuenta REPI", go: () => to("login") }],
      };
    },
    actAcct: () => {
      const ready = !!s("name") && isEmail(s("email")) && passwordOk(s("pw")) && !!f.terms;
      return {
        title: "Tu cuenta de responsable",
        fields: [{ k: "name", label: "Nombre y apellido", ac: "name" }, { k: "email", label: "Email (el de la invitación)", mode: "email", ac: "email", bad: !!s("email") && !isEmail(s("email")) }, pwHintField()],
        checks: [{ k: "terms", t: actInfo?.kind === "gym" ? "Acepto los Términos, la Política de privacidad y el Acuerdo de tratamiento de datos para organizaciones." : "Acepto los Términos y la Política de privacidad." }],
        cta: { label: "Crear cuenta", ready, go: () => {
          const gap = signupGap(false);
          if (gap) return fail(gap);
          return run(async () => {
            await api("sign-up", { body: { flow: "owner", name: s("name"), email: s("email"), password: s("pw"), terms: !!f.terms } });
            to("verify");
          })();
        } },
      };
    },
    consentGym: () => ({
      title: `Qué ve ${me?.member.orgName ?? "tu gimnasio"}`, sub: "Tu gimnasio ve solo lo necesario para atenderte en sala.", stepLabel: "3 de 3",
      toggles: toggles("gym_member"),
      note: `El gym nunca ve tus mensajes con un coach privado, tu salud ni tu nutrición, salvo que lo autorices.`,
      cta: { label: "Entrar a la app", go: run(async () => {
        const m = me ?? (await loadMe());
        if (!m.member.orgId) return fail("No encontramos tu membresía.");
        await api("gym-consent", { body: { orgId: m.member.orgId, grants: picked("gym_member") } });
        clearEntry();
        toFresh("appDone");
      }) },
    }),
    appDone: () => ({ title: "¡Listo!", sub: "Tu cuenta está creada. Abrí la app para ver tu programa.", extra: <InstallSteps />, cta: { label: "Abrir la app", go: () => { window.location.href = "/app"; } } }),
    ready: () => ({
      title: "¡Tu cuenta está lista!", sub: "Antes de entrar, agregá REPI a tu pantalla de inicio: la próxima vez entrás con un toque desde el ícono.",
      extra: <InstallSteps />,
      cta: { label: "Entrar a REPI", go: () => { window.location.href = readyHref ?? "/acceso?step=workspace"; } },
    }),
    rec1: () => ({
      title: "Recuperá tu contraseña", sub: "Te mandamos un código al email de tu cuenta.",
      fields: [{ k: "email", label: "Email", mode: "email", ac: "email" }],
      cta: { label: "Enviar código", go: run(async () => {
        if (!isEmail(s("email"))) return fail("Escribí un email válido.");
        const r = await authClient.emailOtp.requestPasswordReset({ email: s("email") });
        authErr(r.error, "No pudimos enviar el código.");
        setF((x) => ({ ...x, otp: "" }));
        to("rec2");
      }) },
      note: "Por seguridad, mostramos el mismo mensaje exista o no la cuenta.",
    }),
    rec2: () => ({
      title: "Ingresá el código", sub: `Si ${s("email") || "tu email"} tiene cuenta, te llegó un código. Vence en 15 minutos.`,
      fields: [{ k: "otp", label: "Código", mode: "numeric", ac: "one-time-code", max: 6, code: true, ph: "······" }],
      cta: { label: "Continuar", ready: OTP_RE.test(s("otp")), go: run(async () => {
        if (!OTP_RE.test(s("otp"))) return fail("El código tiene 6 dígitos.");
        const r = await authClient.emailOtp.checkVerificationOtp({ email: s("email"), otp: s("otp"), type: "forget-password" });
        authErr(r.error, "El código no es correcto o venció.");
        setF((x) => ({ ...x, pw: "" }));
        to("rec3");
      }) },
    }),
    rec3: () => ({
      title: "Nueva contraseña", fields: [pwHintField("Contraseña nueva")],
      cta: { label: "Guardar y entrar", ready: passwordOk(s("pw")), go: run(async () => {
        if (!passwordOk(s("pw"))) return fail("La contraseña no cumple los requisitos.");
        const r = await authClient.emailOtp.resetPassword({ email: s("email"), otp: s("otp"), password: s("pw") });
        authErr(r.error, "El código venció. Pedí uno nuevo.");
        flash("Contraseña actualizada. Cerramos tus otras sesiones.");
        await signIn(s("email"), s("pw"));
      }) },
    }),
    twofa: () => ({
      title: "Verificación en dos pasos",
      sub: backupMode ? "Ingresá uno de tus 10 códigos de respaldo. Cada uno sirve una sola vez." : "Obligatoria para administración de REPI y dueños. Ingresá el código de tu app de autenticación.",
      fields: [backupMode ? { k: "backup", label: "Código de respaldo", ac: "one-time-code", max: 20 } : { k: "otp2", label: "Código", mode: "numeric", ac: "one-time-code", max: 6, code: true, ph: "······" }],
      checks: [{ k: "trust", t: "Confiar en este dispositivo por 30 días" }],
      cta: { label: "Verificar", ready: backupMode ? s("backup").length >= 6 : OTP_RE.test(s("otp2")), go: run(async () => {
        if (backupMode) {
          const r = await authClient.twoFactor.verifyBackupCode({ code: s("backup").trim(), trustDevice: !!f.trust });
          authErr(r.error, "El código de respaldo no es válido.");
        } else {
          if (!OTP_RE.test(s("otp2"))) return fail("El código tiene 6 dígitos.");
          const r = await authClient.twoFactor.verifyTotp({ code: s("otp2"), trustDevice: !!f.trust });
          authErr(r.error, "El código no es correcto. Revisá la hora del teléfono y probá de nuevo.");
        }
        await afterAuth();
      }) },
      links: [{ pre: backupMode ? "" : "¿Perdiste el acceso?", label: backupMode ? "Usar la app de autenticación" : "Usar un código de respaldo", go: () => { setBackupMode((b) => !b); setErr(null); } }],
    }),
    twofaSetup: () => totp
      ? {
        title: "Escaneá el código", sub: "Usá Google Authenticator, 1Password u otra app compatible. Después ingresá el código de 6 dígitos.",
        extra: <TotpCard uri={totp.uri} backup={totp.backup} />,
        fields: [{ k: "otp2", label: "Código", mode: "numeric", ac: "one-time-code", max: 6, code: true, ph: "······" }],
        cta: { label: "Activar y entrar", ready: OTP_RE.test(s("otp2")), go: run(async () => {
          if (!OTP_RE.test(s("otp2"))) return fail("El código tiene 6 dígitos.");
          const r = await authClient.twoFactor.verifyTotp({ code: s("otp2") });
          authErr(r.error, "El código no es correcto. Revisá la hora del teléfono y probá de nuevo.");
          flash("Verificación en dos pasos activada.");
          window.location.href = next ?? "/acceso?step=workspace";
        }) },
      }
      : {
        title: "Activá la verificación en dos pasos", sub: "Opcional: además de tu contraseña, te pide un código de una app del teléfono. Confirmá tu contraseña para generar tu código.",
        fields: [{ k: "pw2", label: "Tu contraseña", type: "password", ac: "current-password" }],
        cta: { label: "Generar código", ready: !!s("pw2"), go: run(async () => {
          if (!s("pw2")) return fail("Escribí tu contraseña.");
          const r = await authClient.twoFactor.enable({ password: s("pw2") });
          authErr(r.error, "La contraseña no es correcta.");
          if (r.data?.method !== "totp") return fail("No pudimos generar el código. Probá de nuevo.");
          setTotp({ uri: r.data.totpURI, backup: r.data.backupCodes });
          setF((x) => ({ ...x, pw2: "", otp2: "" }));
        }) },
        links: [{ pre: "", label: next ? "Ahora no" : "Elegir otro espacio", go: () => (next ? (window.location.href = next) : start("workspace", "login")) }],
      },
    workspace: () => {
      const ws = me?.workspaces ?? [];
      return {
        title: "¿A dónde querés entrar?", sub: ws.length > 1 ? "Tu cuenta tiene varios espacios. Los datos de cada uno no se mezclan." : ws.length ? "Elegí tu espacio. Si sumás otro, sus datos no se mezclan." : "Tu cuenta todavía no tiene espacios.",
        listLabel: "Espacios", list: ws.map((w) => ({ ini: w.ini, title: w.title, detail: w.detail, go: () => goWorkspace(w), badge: w.needs2fa ? "Requiere 2 pasos" : undefined, badgeKind: "warn" as const })),
        note: me && !ws.length ? "Si te invitaron, ingresá el código. Si sos socio, escaneá el QR de tu sede. Si sos coach o tenés un gimnasio, escribinos para el alta." : undefined,
        secondary: me && !ws.length ? [
          ...(resume ? [{ label: "Retomar mi alta", go: () => { window.location.href = entryHref(resume); } }] : []),
          { label: "Tengo un código", go: () => to("code", "invite") }, { label: "Quiero usar REPI", go: () => to("choose") },
        ] : undefined,
        links: [{ pre: "", label: "Cerrar sesión", go: run(async () => { if (!await signOutSafely()) return; setMe(null); start("login", "login"); }) }],
      };
    },
  };

  if (guide) {
    const ctx = joinInfo ? { title: joinInfo.orgName, detail: joinInfo.locationName } : invite ? { title: invite.orgName, detail: invite.detail } : actInfo ? { title: actInfo.orgName, detail: "Bienvenida a REPI" } : null;
    return <InstallGuide context={ctx} recovery={entry} onContinue={() => { setGuide(false); window.scrollTo(0, 0); }} />;
  }
  const v = V[step]();
  const canBack = hist.length > 0;
  const back = () => { setStep(hist[hist.length - 1]); setHist((h) => h.slice(0, -1)); setErr(null); };
  const errId = "ac-err";

  return (
    <>
      <form className="ac-form" key={step} data-anim={hist.length ? "1" : "0"} noValidate aria-describedby={err ? errId : undefined}
        onSubmit={(e) => { e.preventDefault(); v.cta?.go(); }}>
        <div className="ac-top">
          {canBack
            ? <button type="button" className="ac-back" onClick={back} aria-label="Volver"><Ic i={ArrowLeft} size={22} /></button>
            : <Wordmark width={62} />}
          <span className="ac-step">{v.stepLabel ?? ""}</span>
        </div>
        <div className="ac-head">
          <h1 ref={headRef} tabIndex={-1}>{v.title}</h1>
          {v.sub && <p className="ac-sub">{v.sub}</p>}
        </div>
        {v.info && <div className="ac-info"><span className="ac-ini" aria-hidden="true">{v.info.ini}</span><span><strong>{v.info.t}</strong>{v.info.d && <small>{v.info.d}</small>}</span></div>}
        {v.options?.map((o) => (
          <button type="button" key={o.t} className="ac-opt" onClick={o.go}>
            <span className="ac-opt-ic" aria-hidden="true"><Ic i={o.icon} size={22} color="#00D1FF" /></span>
            <span><strong>{o.t}</strong><small>{o.d}</small></span>
            <Ic i={CaretRight} size={16} style={{ color: "var(--t-muted)" }} />
          </button>
        ))}
        {v.extra}
        {v.fields?.map((fd) => {
          const hintId = `h-${fd.k}`;
          return (
            <div key={fd.k} className="ac-field"><label htmlFor={`f-${fd.k}`}>{fd.label}</label>
              <input id={`f-${fd.k}`} className={fd.code ? "code" : undefined} type={fd.type ?? "text"} value={s(fd.k)} placeholder={fd.ph} inputMode={fd.mode ?? "text"}
                autoComplete={fd.ac ?? "off"} maxLength={fd.max ?? 120} aria-invalid={fd.bad || undefined} aria-describedby={fd.hint ? hintId : undefined}
                onChange={(e) => set(fd.k, fd.k === "code" ? normalizeCode(e.target.value) : fd.code ? e.target.value.replace(/\D/g, "") : e.target.value)} />
              {fd.hint && <span id={hintId} className={`ac-hint${fd.hintOk ? " ok" : ""}`}>{fd.hint}</span>}
            </div>
          );
        })}
        {v.chips?.map((g) => (
          <fieldset key={g.k} className="ac-chips"><legend>{g.label}</legend>
            <div>{g.opts.map(([val, lab]) => <button type="button" key={val} className="ac-chip" aria-pressed={f[g.k] === val} onClick={() => set(g.k, val)}>{lab}</button>)}</div>
          </fieldset>
        ))}
        {v.toggles?.map((t) => {
          const on = t.locked ? true : t.disabledReason ? false : !!f[t.k];
          return (
            <button type="button" key={t.k} role="switch" aria-checked={on} aria-disabled={t.locked || !!t.disabledReason || undefined} className="ac-toggle"
              onClick={() => {
                if (t.locked) return flash(t.k.startsWith("gym") ? "La asistencia y los entrenamientos se comparten con el gym: son parte del servicio." : "Tus entrenamientos siempre se comparten: son parte del plan.");
                if (t.disabledReason) return flash(t.desc);
                set(t.k, !f[t.k]);
              }}>
              <span><strong>{t.title}</strong><small>{t.desc}</small></span><span className="ac-track" aria-hidden="true" />
            </button>
          );
        })}
        {v.list && v.list.length > 0 && (
          <ul aria-label={v.listLabel} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            {v.list.map((l, i) => {
              const inner = <><span className="ac-ini" aria-hidden="true">{l.ini}</span><span><strong>{l.title}</strong><small>{l.detail}</small></span>{l.badge && <span className={`ac-badge${l.badgeKind ? " " + l.badgeKind : ""}`}>{l.badge}</span>}</>;
              return <li key={l.title + i}>{l.go
                ? <button type="button" className="ac-row" aria-pressed={l.on === undefined ? undefined : l.on} onClick={l.go}>{inner}</button>
                : <div className="ac-row">{inner}</div>}</li>;
            })}
          </ul>
        )}
        {v.checks?.map((c) => (
          <div key={c.k} className="ac-check"><input id={`c-${c.k}`} type="checkbox" checked={!!f[c.k]} onChange={(e) => set(c.k, e.target.checked)} /><label htmlFor={`c-${c.k}`}>{c.t}</label></div>
        ))}
        {v.note && <p className="ac-note">{v.note}</p>}
        <div aria-live="assertive">{err && <p role="alert" id={errId} className="ac-error">{err}</p>}</div>
        {v.cta && <button type="submit" className="ac-cta" data-dim={v.cta.ready === false ? "1" : "0"} aria-busy={busy || undefined}>{busy ? "Un momento…" : v.cta.label}</button>}
        {v.social && (
          <>
            <div className="ac-or">o</div>
            {/* Google y Apple fuera hasta que el titular decida activarlos (D113); el adaptador del servidor sigue listo. */}
            {step === "login" && <button type="button" className="ac-sec" onClick={socialGo("magic")}>Recibir enlace por email</button>}
          </>
        )}
        {v.secondary?.map((b) => <button type="button" key={b.label} className="ac-sec" onClick={b.go}>{b.label}</button>)}
        {v.links?.map((l) => <div key={l.label} className="ac-link">{l.pre && <span>{l.pre}</span>}<button type="button" onClick={l.go}>{l.label}</button></div>)}
      </form>
      <div aria-live="polite" className="sr-only">{toast}</div>
      {toast && <div className="ac-toast" aria-hidden="true">{toast}</div>}
    </>
  );
}

function TotpCard({ uri, backup }: { uri: string; backup: string[] }) {
  const svg = useMemo(() => renderSVG(uri, { border: 1 }), [uri]);
  const secret = useMemo(() => new URL(uri).searchParams.get("secret") ?? "", [uri]);
  return (
    <>
      <div className="ac-qr" role="img" aria-label="Código QR para tu app de autenticación" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="ac-note">¿No podés escanear? Ingresá esta clave a mano:<br /><span className="ac-secret">{secret}</span></p>
      <p className="ac-note">Guardá estos códigos de respaldo en un lugar seguro. Cada uno sirve una sola vez.</p>
      <ul className="ac-codes" aria-label="Códigos de respaldo">{backup.map((c) => <li key={c}>{c}</li>)}</ul>
    </>
  );
}
