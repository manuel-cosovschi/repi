import { describe, expect, it } from "vitest";
import {
  ageOn, classifyAge, CODE_ALPHABET, invitationState, isCodeShape, isCuit, isDni, isEmail, makeInviteCode,
  maskEmail, normalizeCode, parseBirthDate, passwordHint, passwordOk, requiresTwoFactor, resolveGrants, CONSENT_CATALOG,
} from "./access";

describe("contraseña (Acceso pwRules)", () => {
  it("exige 8+, número y letra", () => {
    expect(passwordOk("abcdefgh")).toBe(false);
    expect(passwordOk("12345678")).toBe(false);
    expect(passwordOk("abc1234")).toBe(false);
    expect(passwordOk("abcd1234")).toBe(true);
  });
  it("hint marca lo cumplido como en el prototipo", () => {
    expect(passwordHint("abc")).toBe("Necesita 8+ caracteres · un número · ✓ una letra");
  });
});

describe("email", () => {
  it("valida forma mínima", () => {
    expect(isEmail("tu@email.com")).toBe(true);
    expect(isEmail("tu@email")).toBe(false);
    expect(isEmail(" a b@c.d")).toBe(false);
  });
});

describe("pista de email de invitación", () => {
  it("muestra principio y final, nunca el email entero", () => {
    expect(maskEmail("ManuCosovschi@Gmail.com ")).toBe("ma•••hi@gmail.com");
    expect(maskEmail("manucosovs@gmail.com")).toBe("ma•••vs@gmail.com");
    expect(maskEmail("ana@x.com")).toBe("an•••@x.com");
  });
});

describe("fecha de nacimiento y edad", () => {
  it("rechaza fechas imposibles", () => {
    expect(parseBirthDate("31/02/2010")).toBeNull();
    expect(parseBirthDate("2010-02-31")).toBeNull();
    expect(parseBirthDate("1702197")).toBeNull();
    expect(parseBirthDate("01/02/2010")).toBe("2010-02-01");
  });
  it("acepta el selector nativo y la fecha escrita sin barras (teclado numérico)", () => {
    expect(parseBirthDate("1974-02-17")).toBe("1974-02-17");
    expect(parseBirthDate("17021974")).toBe("1974-02-17");
    expect(parseBirthDate("17-02-1974")).toBe("1974-02-17");
    expect(parseBirthDate("17.02.1974")).toBe("1974-02-17");
  });
  it("edad calendario exacta en el cumpleaños", () => {
    expect(ageOn("2008-10-25", "2026-10-25")).toBe(18);
    expect(ageOn("2008-10-26", "2026-10-25")).toBe(17);
  });
  it("clasifica <13 bloqueado, 13–17 menor, 18+ adulto, futuro inválido", () => {
    const today = "2026-10-25";
    expect(classifyAge("2014-01-01", today)).toBe("blocked");
    expect(classifyAge("2013-10-25", today)).toBe("minor");
    expect(classifyAge("2008-10-25", today)).toBe("adult");
    expect(classifyAge("2030-01-01", today)).toBe("invalid");
    expect(classifyAge(null, today)).toBe("invalid");
  });
});

describe("CUIT y DNI", () => {
  it("verifica dígito módulo 11", () => {
    expect(isCuit("20-12345678-6")).toBe(true);
    expect(isCuit("30-12345678-9")).toBe(false); // placeholder del prototipo no es un CUIT válido
    expect(isCuit("2012345678")).toBe(false);
  });
  it("DNI 7–8 dígitos con puntos tolerados", () => {
    expect(isDni("35.123.456")).toBe(true);
    expect(isDni("123")).toBe(false);
  });
});

describe("códigos de invitación", () => {
  it("usa sólo el alfabeto sin ambigüedad", () => {
    const code = makeInviteCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
    expect(code).toHaveLength(6);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
  });
  it("normaliza minúsculas y separadores", () => {
    expect(normalizeCode("r7k-2qx")).toBe("R7K2QX");
    expect(isCodeShape("R7K2QX")).toBe(true);
    expect(isCodeShape("R0K2QX")).toBe(false);
  });
  it("una invitación pendiente vencida es 'expired'", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(invitationState({ status: "pending", expiresAt: new Date("2026-10-25T11:59:59Z") }, now)).toBe("expired");
    expect(invitationState({ status: "revoked", expiresAt: new Date("2020-01-01") }, now)).toBe("revoked");
    expect(invitationState({ status: "pending", expiresAt: new Date("2026-11-01") }, now)).toBe("pending");
  });
});

describe("consentimientos", () => {
  it("por defecto sólo se comparte lo fijo", () => {
    expect(resolveGrants("coach_client", [], { minorWithoutGuardian: false })).toEqual(["training"]);
  });
  it("menor sin autorización no puede compartir salud ni fotos", () => {
    expect(resolveGrants("coach_client", ["health", "progress_photos", "measurements"], { minorWithoutGuardian: true }))
      .toEqual(["training", "measurements"]);
  });
  it("medidas para el staff del gym no se conceden mientras D06 esté abierto", () => {
    expect(resolveGrants("gym_member", ["measurements", "rankings"], { minorWithoutGuardian: false }))
      .toEqual(["attendance_training", "rankings"]);
    expect(CONSENT_CATALOG.gym_member.find((i) => i.key === "measurements")?.unavailable).toBeTruthy();
  });
  it("ignora claves desconocidas", () => {
    expect(resolveGrants("coach_client", ["chat", "x"], { minorWithoutGuardian: false })).toEqual(["training"]);
  });
});

describe("2FA optativa", () => {
  it("no se exige a ningún rol (D119; reemplaza D25)", () => {
    expect(requiresTwoFactor({ platformAdmin: true })).toBe(false);
    expect(requiresTwoFactor({ gymRoles: ["owner"] })).toBe(false);
    expect(requiresTwoFactor({ gymRoles: ["manager"] })).toBe(false);
  });
});
