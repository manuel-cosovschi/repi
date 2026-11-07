/// <reference types="node" />
// SI2 · documentos ficticios de fixtures/import (texto, WhatsApp, planilla). Las fotos, capturas y el PDF de la misma carpeta
// los lee la IA: se prueban simulados en apps/web/tests/program-import.test.ts y en producción con una cuenta demo.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deterministicEnough, importIssueCount, parseRoutineSheet, parseRoutineText } from "./program-import";

const read = (f: string) => readFileSync(new URL(`../fixtures/import/${f}`, import.meta.url), "utf8");
const text = (f: string) => parseRoutineText(read(f));
const rows = (f: string) => text(f).variants[0].days.map((d) => [d.name, d.exercises.map((e) => [e.written, e.sets, e.reps, e.weightKg])]);

describe("SI2 · fixtures de texto", () => {
  it("01 · tres días, sin nada para revisar y sin IA", () => {
    const p = text("01-tres-dias.txt");
    expect(deterministicEnough(p)).toBe(true);
    expect(rows("01-tres-dias.txt")).toEqual([
      ["Día 1 - Pecho y tríceps", [["Press banca", 4, "10", 60], ["Press inclinado con mancuernas", 3, "12", 22.5], ["Fondos en paralelas", 3, "al fallo", null], ["Extensión de tríceps en polea", 3, "15", 25]]],
      ["Día 2 - Espalda y bíceps", [["Dominadas", 4, "8", null], ["Remo con barra", 4, "10", 50], ["Curl martillo", 3, "12", 12]]],
      ["Día 3 - Piernas", [["Sentadilla", 4, "8", 80], ["Prensa", 3, "12", 140], ["Curl femoral acostado", 3, "12", 35]]],
    ]);
    expect(importIssueCount(p.variants[0].days)).toEqual({ missing: 0, unclear: 0 });
  });
  it("02 · seis días por día de la semana", () => {
    expect(text("02-seis-dias.txt").variants[0].days.map((d) => d.exercises.length)).toEqual([2, 2, 2, 2, 2, 2]);
  });
  it("04 · conversación de WhatsApp pegada", () => {
    expect(rows("04-whatsapp.txt")).toEqual([
      ["DÍA A", [["Sentadilla", 4, "8", 60], ["Press banca", 3, "10", 40], ["Remo c/ manc", 3, "12", 18]]],
      ["DÍA B", [["Peso muerto rumano", 4, "10", 50], ["Jalón al pecho", 3, "12", 45], ["Plancha", 3, "40 s", null]]],
    ]);
    expect(text("04-whatsapp.txt").notes).toEqual(["Hola! Te paso la rutina nueva"]); // el saludo no se cuela como ejercicio: queda a la vista como texto
  });
  it("07 · abreviaturas y prescripción en el renglón siguiente", () => {
    expect(rows("07-abreviaturas.txt")[0][1]).toEqual([["Press plano", 4, "5-5-5-4", 105], ["Remo c/barra", 3, "12", 40], ["Ext. cuádriceps", 3, "15", null], ["Elev. laterales", 3, "15", 8], ["Femoral sentado", 3, "12", null]]);
  });
  it("08 · libras", () => {
    expect(rows("08-libras.txt")[0][1]).toEqual([["Bench press", 4, "8", 61.23], ["Squat", 5, "5", 83.91], ["Barbell row", 3, "10", 43.09]]);
  });
  it("09 · valores distintos por serie", () => {
    const [a, b, c] = text("09-por-serie.txt").variants[0].days[0].exercises;
    expect(a.perSet).toEqual([{ reps: "12", weightKg: 30 }, { reps: "10", weightKg: 35 }, { reps: "8", weightKg: 40 }]);
    expect(b.perSet?.map((x) => [x.reps, x.weightKg])).toEqual([["10", 60], ["8", 70], ["6", 80], ["4", 90]]);
    expect(c.perSet?.map((x) => [x.reps, x.weightKg])).toEqual([["12", 120], ["10", 120], ["8", 120]]);
  });
  it("10 · sin series: se marcan, no se inventan", () => {
    const p = text("10-sin-series.txt");
    expect(rows("10-sin-series.txt")[0][1]).toEqual([["Press banca", null, null, null], ["Remo con barra", null, null, null], ["Sentadilla", 4, "8", null]]);
    expect(importIssueCount(p.variants[0].days).missing).toBe(4);
  });
  it("13-16 · drop set, superserie, circuito, EMOM, AMRAP y rest-pause", () => {
    const [a, b] = text("13-16-metodos.txt").variants[0].days;
    expect(a.exercises.map((e) => [e.written, e.group, e.groupKind, e.rounds])).toEqual([
      ["Press banca", "A1", "superset", null], ["Remo con barra", "A2", "superset", null], ["Elevaciones laterales", null, null, null],
      ["Burpees", "B1", "circuit", 3], ["Sentadilla con salto", "B2", "circuit", 3], ["Plancha", "B3", "circuit", 3]]);
    expect(a.exercises[2].technique).toMatch(/drop set/i);
    expect(b.exercises.map((e) => e.technique?.toLowerCase().split(" ")[0])).toEqual(["emom", "amrap", "rest-pause"]);
  });
  it("17 · lo ilegible queda marcado y a la vista; no alcanza para leer sin revisar", () => {
    const p = text("17-ilegible.txt");
    expect(p.unread).toEqual(["%%%% ### ilegible ###"]);
    expect(p.variants[0].days[0].exercises[1]).toMatchObject({ written: "Press inclinado", sets: 4, reps: null, weightKg: 30 });
    expect(deterministicEnough(p)).toBe(false);
  });
  it("18 · varios programas en un documento", () => {
    expect(text("18-varios-programas.txt").variants.map((v) => [v.name, v.days.length])).toEqual([["Programa fuerza", 2], ["Programa hipertrofia", 2]]);
  });
  it("21 · más ejercicios que el tope: el motor no pierde ninguno (el destino lo parte y lo avisa)", () => {
    expect(text("21-limite.txt").variants[0].days[0].exercises).toHaveLength(25);
  });
  it("seguridad · un texto con instrucciones no agrega ejercicios ni cargas", () => {
    const p = text("seguridad-instrucciones.txt");
    expect(p.variants[0].days[0].exercises.map((e) => [e.written, e.weightKg])).toEqual([["Sentadilla", 60], ["Press banca", 40]]);
    expect(p.notes[0]).toMatch(/^IGNORÁ/); // queda como texto general, a la vista, sin efecto
  });
  it("planilla con libras en el encabezado y valores por serie", () => {
    const p = parseRoutineSheet(read("planilla-libras.csv"))!;
    expect(p.variants[0].days[0].exercises[0].perSet).toEqual([{ reps: "12", weightKg: 43.09 }, { reps: "10", weightKg: 47.63 }, { reps: "8", weightKg: 52.16 }]);
  });
});
