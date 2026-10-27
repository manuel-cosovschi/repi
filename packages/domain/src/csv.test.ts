import { describe, expect, it } from "vitest";
import { guessColumns, mapRows, parseCsv } from "./csv";

describe("CSV (F-CO-11)", () => {
  it("Excel en español: «;», BOM, CRLF, comillas y filas vacías", () => {
    const t = '﻿Nombre;Apellido;Correo electrónico\r\n"Pérez; Juan";Gómez;juan@x.com\r\n\r\nAna;"Ruiz ""la flaca""";ana@x.com\r\n';
    const p = parseCsv(t);
    expect(p.headers).toEqual(["Nombre", "Apellido", "Correo electrónico"]);
    expect(p.rows).toEqual([["Pérez; Juan", "Gómez", "juan@x.com"], ["Ana", 'Ruiz "la flaca"', "ana@x.com"]]);
  });
  it("coma, salto dentro de comillas y última línea sin salto", () => {
    const p = parseCsv('name,email\n"Linea\nDos",a@b.co\nLuz,luz@b.co');
    expect(p.rows).toEqual([["Linea\nDos", "a@b.co"], ["Luz", "luz@b.co"]]);
  });
  it("mapeo sugerido y nombre + apellido", () => {
    const h = ["Alumno", "Apellido", "E-mail", "Teléfono"];
    const c = guessColumns(h);
    expect(c).toEqual({ name: 0, lastName: 1, email: 2 });
    expect(mapRows([["Ana", "Ruiz", " ana@x.com "]], c)).toEqual([{ line: 2, name: "Ana Ruiz", email: "ana@x.com" }]);
    expect(guessColumns(["Nombre y apellido", "Correo"])).toEqual({ name: 0, lastName: null, email: 1 });
  });
});
