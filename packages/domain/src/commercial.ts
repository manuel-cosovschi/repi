// Alta comercial, condiciones por cliente y acceso por QR (anexo 26/10/2026 «Acceso, altas y facturación»).
// Confirmado: se factura por TODOS los socios/alumnos acordados, no por uso; precio por cliente, editable sólo por Admin.

// ── Contrato y activación ───────────────────────────────────────────────────
export const CONTRACT_STATUS = { draft: "Borrador", accepted: "Aceptado por las partes", enabled: "Habilitado por Admin", suspended: "Suspendido", ended: "Finalizado" } as const;
export type ContractStatus = keyof typeof CONTRACT_STATUS;
/** Hitos separados (anexo §4): contrato, invitación, identidad, configuración y cliente activo no se confunden. */
export type ActivationStage = "draft" | "accepted" | "enabled" | "invited" | "identity_verified" | "setup_pending" | "active" | "suspended";
export const ACTIVATION_LABEL: Record<ActivationStage, string> = {
  draft: "Borrador del acuerdo", accepted: "Aceptación registrada", enabled: "Habilitado comercialmente", invited: "Invitación enviada",
  identity_verified: "Responsable verificado", setup_pending: "Configuración pendiente", active: "Cliente activo", suspended: "Servicio suspendido",
};
export function activationStage(p: { contract: ContractStatus; invitationSent: boolean; ownerJoined: boolean; setupDone: boolean }): ActivationStage {
  if (p.contract === "suspended" || p.contract === "ended") return "suspended";
  if (p.contract === "draft") return "draft";
  if (p.contract === "accepted") return "accepted";
  if (p.ownerJoined) return p.setupDone ? "active" : "setup_pending";
  return p.invitationSent ? "invited" : "enabled";
}
/** ¿La organización admite altas operativas (QR, invitaciones de alumno)? Legacy = cliente previo al anexo, sin suspender por inferencia. */
export const orgOperational = (commercialStatus: string) => commercialStatus === "enabled" || commercialStatus === "legacy";

// ── Dinero exacto y versiones ───────────────────────────────────────────────
export const CURRENCIES = { ARS: 2, USD: 2 } as const; // decimales por moneda
export type Currency = keyof typeof CURRENCIES;
export const isCurrency = (x: unknown): x is Currency => typeof x === "string" && x in CURRENCIES;
/** "1.234,56" o "1234.56" → unidades menores enteras; null si no es un importe válido. */
export function parseMoney(input: string, currency: Currency = "ARS"): number | null {
  const t = input.trim().replace(/\s/g, "");
  if (!t) return null;
  // es-AR: «1.234,56» (coma decimal), «150.000» (punto de miles), «150000» o «150.5». Tres dígitos tras un punto = miles.
  const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t.replace(/,/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(norm)) return null;
  const [i, d = ""] = norm.split(".");
  const dec = CURRENCIES[currency];
  return Number(i) * 10 ** dec + Number((d + "00").slice(0, dec));
}
export function fmtMoney(minor: number, currency: Currency = "ARS") {
  const dec = CURRENCIES[currency];
  return `${currency} ${(minor / 10 ** dec).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

export type Term = { id: string; kind: "quantity" | "unit_price"; version: number; value: number; currency: Currency | null; effectiveFrom: string; createdAt: Date | string };
/** Versión vigente en una fecha: la de mayor fecha de efecto ≤ fecha; empate → la más reciente. */
export function termAt(terms: Term[], kind: Term["kind"], dateIso: string): Term | null {
  const cand = terms.filter((t) => t.kind === kind && t.effectiveFrom <= dateIso);
  if (!cand.length) return null;
  return cand.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? b.version - a.version : b.effectiveFrom.localeCompare(a.effectiveFrom)))[0];
}

/**
 * Vista previa de un período con tarifa simple: subtotal = cantidad acordada × precio unitario vigentes al inicio del período.
 * No se agregan mínimos, descuentos, tramos ni extras salvo que estén pactados (anexo §9). Sin cantidad o precio → no se calcula.
 * Si cambian dentro del período, se informa y NO se prorratea (D04 pendiente).
 */
export function previewPeriod(terms: Term[], period: { start: string; end: string }) {
  const q = termAt(terms, "quantity", period.start);
  const p = termAt(terms, "unit_price", period.start);
  const changes = terms.filter((t) => t.effectiveFrom > period.start && t.effectiveFrom <= period.end).map((t) => ({ kind: t.kind, version: t.version, effectiveFrom: t.effectiveFrom }));
  if (!q || !p || !p.currency) return { ok: false as const, reason: !q ? "Falta la cantidad acordada." : "Falta el precio por unidad.", quantity: q, price: p, changes };
  const subtotal = q.value * p.value;
  if (!Number.isSafeInteger(subtotal)) return { ok: false as const, reason: "Importe fuera de rango.", quantity: q, price: p, changes };
  return {
    ok: true as const, quantity: q, price: p, currency: p.currency, subtotal, changes,
    lines: [{ concept: "Socios/alumnos acordados", quantity: q.value, unitMinor: p.value, totalMinor: subtotal }],
    note: changes.length ? "Hay cambios con efecto dentro del período: la vista previa usa los valores vigentes al inicio; el prorrateo está pendiente (D04)." : null,
  };
}
/** Accesos habilitados > total acordado → revisión (nunca cobro extra ni bloqueo automático). */
export const overAgreed = (agreed: number | null, enabled: number) => agreed != null && enabled > agreed;

// ── Acceso del socio por QR (anexo §5–6) ────────────────────────────────────
export const JOIN_REQUEST_TTL_HOURS = 24; // propuesta, visible y configurable
export const JOIN_ESCALATE_MIN = 5; // propuesta: aviso a responsables una vez
export const VALIDATION_METHODS = {
  conocimiento_directo: "Lo conozco: es socio/a",
  recepcion: "Lo confirmé en recepción o en el sistema del gym",
  evidencia_operativa: "Evidencia operativa (cuota, ficha o carnet del gym)",
} as const;
export type ValidationMethod = keyof typeof VALIDATION_METHODS;
export const isValidationMethod = (x: unknown): x is ValidationMethod => typeof x === "string" && x in VALIDATION_METHODS;
export const REJECT_REASONS = {
  not_member: "No pudimos confirmar que seas socio/a de esta sede. Acercate a recepción.",
  wrong_location: "Esta solicitud es para otra sede. Escaneá el QR de tu sede o consultá en recepción.",
  duplicate: "Ya tenías otra cuenta o solicitud. Consultá en recepción para unificarla.",
  other: "No pudimos aprobar tu acceso. Consultá en recepción.",
} as const;
export type RejectReason = keyof typeof REJECT_REASONS;
/** Código corto visible para encontrar la solicitud en la bandeja. No prueba identidad ni pertenencia. */
export const shortCodeOf = (id: string) => id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase();
/** Texto en pantalla bloqueada: mínimo, sin nombre ni datos (anexo §7). */
export const PUSH_JOIN = { title: "REPI", body: "Nueva solicitud de acceso en tu sede" } as const;

// ── Sensación por serie (pedido del usuario 26/10) ──────────────────────────
export const SET_FEEL = { facil: "Fácil", bien: "Bien", dificil: "Difícil", limite: "Al límite", molestia: "Con molestia", ayuda: "Quiero que venga un entrenador" } as const;
export type SetFeel = keyof typeof SET_FEEL;
export const isSetFeel = (x: unknown): x is SetFeel => typeof x === "string" && x in SET_FEEL;
/** [S] Avisan al piso en turno: series duras, molestia o pedido explícito. Fácil/Bien quedan sólo en el registro. */
export const FEEL_ALERTS: SetFeel[] = ["dificil", "limite", "molestia", "ayuda"];
/** [S] Una alerta por socio cada 10 minutos (salvo pedido explícito de ayuda); series sincronizadas tarde no avisan. */
export const FLOOR_ALERT_COOLDOWN_MIN = 10;
export const FLOOR_ALERT_MAX_AGE_MIN = 10;
export const PUSH_FLOOR = { title: "REPI · Sala", body: "Un socio pidió atención en sala" } as const;

// ── Pesos finos ─────────────────────────────────────────────────────────────
/** Pasos elegibles para el ± del peso (discos y mancuernas de 0,25 a 2,5 kg). */
export const WEIGHT_STEPS = [0.25, 0.5, 1, 1.25, 2.5] as const;
/** Peso válido: hasta 2 decimales, entre 0 y 1000 kg. */
export const weightOk = (w: number) => Number.isFinite(w) && w >= 0 && w <= 1000 && Math.round(w * 100) === w * 100;
export const parseWeight = (s: string): number | null => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() !== "" && weightOk(n) ? n : null;
};
