import { describe, expect, it } from "vitest";
import { ageAt, attemptValueOk, bestByMember, clubName, clubRanking, fileOk, fmtValue, hasLink, isNewRecord, levelOf, sniff } from "./community";

describe("récords: intento válido ≠ nuevo récord", () => {
  it("valida marcas por unidad", () => {
    expect(attemptValueOk("reps", 16)).toBe(true);
    expect(attemptValueOk("reps", 16.5)).toBe(false);
    expect(attemptValueOk("kg", 82.5)).toBe(true);
    expect(attemptValueOk("kg", 82.55)).toBe(false);
    expect(attemptValueOk("seg", 0)).toBe(false);
    expect(attemptValueOk("seg", 100_000)).toBe(false);
  });
  it("lowerIsBetter para tiempos; sin récord previo cualquier intento lo establece", () => {
    expect(isNewRecord(17, 16, false)).toBe(true);
    expect(isNewRecord(16, 16, false)).toBe(false); // igualar no es récord
    expect(isNewRecord(97, 98, true)).toBe(true);
    expect(isNewRecord(99, 98, true)).toBe(false);
    expect(isNewRecord(5, null, false)).toBe(true);
  });
  it("mejor marca por persona; empate gana quien llegó primero", () => {
    const r = bestByMember([
      { memberId: "a", value: 10, at: "2026-10-01" }, { memberId: "a", value: 14, at: "2026-10-03" },
      { memberId: "b", value: 14, at: "2026-10-02" }, { memberId: "c", value: 9, at: "2026-10-01" },
    ], false);
    expect(r.map((x) => [x.memberId, x.value])).toEqual([["b", 14], ["a", 14], ["c", 9]]);
    expect(bestByMember([{ memberId: "a", value: 98, at: "x" }, { memberId: "a", value: 95, at: "y" }], true)[0].value).toBe(95);
  });
  it("formato por unidad", () => {
    expect(fmtValue(245, "seg")).toBe("4:05 min");
    expect(fmtValue(45, "seg")).toBe("45 s");
    expect(fmtValue(82.5, "kg")).toBe("82,5 kg");
    expect(fmtValue(null, "reps")).toBe("Sin récord");
  });
});

describe("logros, edad y Club", () => {
  it("nivel = 1 + floor(logros/2)", () => {
    expect(levelOf(0)).toEqual({ level: 1, toNext: 2, pct: 0 });
    expect(levelOf(3)).toEqual({ level: 2, toNext: 1, pct: 50 });
  });
  it("edad desde nacimiento; sin dato no se infiere", () => {
    expect(ageAt("1985-11-01", new Date("2026-10-26"))).toBe(40);
    expect(ageAt("1985-10-27", new Date("2026-10-26T12:00:00Z"))).toBe(40);
    expect(ageAt(null, new Date())).toBeNull();
  });
  it("nombre visible por elección; enlaces bloqueados", () => {
    expect(clubName("Valentina Gómez", true)).toBe("Valentina G.");
    expect(clubName("Valentina Gómez", false)).toBe("Socio/a del gym");
    expect(hasLink("mirá www.spam.com")).toBe(true);
    expect(hasLink("Hoy 12 dominadas, vamos!")).toBe(false);
  });
  it("ranking de competencia 1, 1, 3", () => {
    const r = clubRanking([{ userId: "a", name: "Ana", sessions: 8 }, { userId: "b", name: "Beto", sessions: 8 }, { userId: "c", name: "Caro", sessions: 5 }]);
    expect(r.map((x) => x.pos)).toEqual([1, 1, 3]);
  });
});

describe("archivos por firma", () => {
  const bytes = (...h: number[]) => { const u = new Uint8Array(32); u.set(h); return u; };
  it("detecta jpeg, png, webm y mp4/mov", () => {
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
    expect(sniff(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe("video/webm");
    expect(sniff(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d))).toBe("video/mp4");
    expect(sniff(bytes(0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20))).toBe("video/quicktime");
  });
  it("rechaza extensión falsa: un PNG declarado como video", () => {
    expect(fileOk("attempt_video", "video/mp4", bytes(0x89, 0x50, 0x4e, 0x47))).toBe(false);
    expect(fileOk("image", "image/png", bytes(0x89, 0x50, 0x4e, 0x47))).toBe(true);
    expect(fileOk("attempt_video", "video/quicktime", bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d))).toBe(true);
  });
});
