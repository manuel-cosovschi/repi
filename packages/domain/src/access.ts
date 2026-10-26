// Reglas de Acceso (registro, ingreso, invitaciones, menores, consentimientos).
// Fuente: handoff/.../project/REPI Acceso.dc.html. Las mismas funciones validan en cliente y servidor.

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (e: unknown): e is string => typeof e === "string" && EMAIL_RE.test(e.trim());
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export type PasswordRule = { ok: boolean; label: string };
export function passwordRules(p: string | undefined | null): PasswordRule[] {
  const s = p ?? "";
  return [
    { ok: s.length >= 8, label: "8+ caracteres" },
    { ok: /[0-9]/.test(s), label: "un número" },
    { ok: /[A-Za-z]/.test(s), label: "una letra" },
  ];
}
export const passwordOk = (p: string | undefined | null) => passwordRules(p).every((r) => r.ok);
export const passwordHint = (p: string | undefined | null) =>
  "Necesita " + passwordRules(p).map((r) => (r.ok ? "✓ " : "") + r.label).join(" · ");

/** Fecha DD/MM/AAAA → ISO AAAA-MM-DD, o null si no es una fecha real. */
export function parseBirthDate(input: string | undefined | null): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((input ?? "").trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Edad cumplida en años a la fecha `today` (ISO). Calendario, no 365,25 días. */
export function ageOn(birthIso: string, todayIso: string): number {
  const [by, bm, bd] = birthIso.split("-").map(Number);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  let a = ty - by;
  if (tm < bm || (tm === bm && td < bd)) a -= 1;
  return a;
}

// Política de menores minors-v1 (D13: pendiente de revisión legal).
export const MINORS_POLICY = { version: "minors-v1", minSelfSignup: 13, adult: 18 } as const;
export type AgeClass = "blocked" | "minor" | "adult" | "invalid";
export function classifyAge(birthIso: string | null, todayIso: string): AgeClass {
  if (!birthIso || birthIso > todayIso) return "invalid";
  const a = ageOn(birthIso, todayIso);
  if (a > 120) return "invalid";
  if (a < MINORS_POLICY.minSelfSignup) return "blocked";
  return a < MINORS_POLICY.adult ? "minor" : "adult";
}

/** Capacidades restringidas hasta que un adulto responsable autoriza (tutorWait del prototipo). */
export const MINOR_RESTRICTED = ["progress_photos", "record_videos", "health_data", "ranking_name"] as const;

/** CUIT argentino: 11 dígitos con dígito verificador módulo 11. */
export function isCuit(input: string | undefined | null): boolean {
  const d = (input ?? "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, k, i) => s + k * Number(d[i]), 0);
  let v = 11 - (sum % 11);
  if (v === 11) v = 0;
  if (v === 10) return false;
  return v === Number(d[10]);
}
export const formatCuit = (input: string) => {
  const d = input.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : input;
};

export const normalizeDni = (input: string | undefined | null) => (input ?? "").replace(/\D/g, "");
export const isDni = (input: string | undefined | null) => /^\d{7,8}$/.test(normalizeDni(input));

// Códigos de invitación: 6 caracteres sin 0/O/1/I/L (T08). El tipo sale del registro, no del código.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function makeInviteCode(rand: (n: number) => Uint8Array): string {
  const bytes = rand(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
export const normalizeCode = (c: string | undefined | null) => (c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
export const isCodeShape = (c: string | undefined | null) => new RegExp(`^[${CODE_ALPHABET}]{6}$`).test(normalizeCode(c));

export const OTP_RE = /^\d{6}$/;

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export function invitationState(
  inv: { status: InvitationStatus; expiresAt: Date },
  now: Date,
): InvitationStatus {
  if (inv.status === "pending" && inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return inv.status;
}
export const INVITE_TTL_DAYS = 14;

// Roles del gym (Acceso gym3). Los permisos dependen del rol, no del cargo.
export const GYM_ROLES = ["owner", "manager", "coordinator", "floor_trainer", "reception"] as const;
export type GymRole = (typeof GYM_ROLES)[number];
export const GYM_ROLE_LABEL: Record<GymRole, string> = {
  owner: "Dueño",
  manager: "Gerente",
  coordinator: "Coordinador",
  floor_trainer: "Entrenador de sala",
  reception: "Recepción",
};
export const INVITABLE_GYM_ROLES: GymRole[] = ["manager", "coordinator", "floor_trainer", "reception"];

/** 2FA obligatoria (Acceso twofa: "Obligatoria para administración de REPI y dueños"; D25). */
export const requiresTwoFactor = (ctx: { platformAdmin?: boolean; gymRoles?: GymRole[] }) =>
  !!ctx.platformAdmin || !!ctx.gymRoles?.includes("owner");

// Consentimientos iniciales. Default apagado para todo lo opcional (D12).
export type ConsentScope = "coach_client" | "gym_member";
export type ConsentItem = {
  key: string;
  title: string;
  desc: string;
  locked?: boolean; // siempre compartido: parte del servicio
  sensitive?: boolean;
  minorRestricted?: boolean;
  unavailable?: string; // visible pero no activable, con motivo
};
export const CONSENT_CATALOG: Record<ConsentScope, ConsentItem[]> = {
  coach_client: [
    { key: "training", title: "Entrenamientos y progreso", desc: "Siempre: son parte del plan.", locked: true },
    { key: "measurements", title: "Medidas corporales", desc: "Peso, circunferencias.", sensitive: true },
    { key: "health", title: "Salud", desc: "Lesiones, molestias, condiciones.", sensitive: true, minorRestricted: true },
    { key: "nutrition", title: "Nutrición", desc: "Comidas e hidratación.", sensitive: true },
    { key: "progress_photos", title: "Fotos de progreso", desc: "Cifradas, solo lectura.", sensitive: true, minorRestricted: true },
  ],
  gym_member: [
    { key: "attendance_training", title: "Asistencia y entrenamientos registrados", desc: "Para que el equipo de sala te acompañe.", locked: true },
    { key: "rankings", title: "Participar en desafíos y rankings", desc: "Tu nombre visible en rankings del gym.", minorRestricted: true },
    {
      key: "measurements",
      title: "Medidas corporales",
      desc: "Opcional, para el equipo de sala.",
      sensitive: true,
      unavailable: "Se habilita cuando el gym defina quién las ve y para qué.",
    },
  ],
};
export const TERMS_VERSION = "v2026.05-borrador"; // D21: textos legales pendientes

/** Ítems efectivamente concedidos: los fijos + los pedidos que el contexto permite. */
export function resolveGrants(
  scope: ConsentScope,
  requested: string[],
  opts: { minorWithoutGuardian: boolean },
): string[] {
  return CONSENT_CATALOG[scope]
    .filter((it) => {
      if (it.locked) return true;
      if (it.unavailable) return false;
      if (opts.minorWithoutGuardian && it.minorRestricted) return false;
      return requested.includes(it.key);
    })
    .map((it) => it.key);
}

export const LEGAL_DOCS = {
  person: ["terms", "privacy"],
  organization: ["terms", "privacy", "dpa"],
} as const;
