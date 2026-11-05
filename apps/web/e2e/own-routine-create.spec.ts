import { expect, test } from "@playwright/test";
import { assertLocalTarget, openDemo, watchErrors } from "./helpers";

// D186 (reporte con captura): al armar una rutina a mano con un ejercicio que no está en la biblioteca, había que tocar «Crear y
// agregar» (apagado sin explicar si faltaba el grupo) y después «Guardar»; si se tocaba sólo «Guardar», el ejercicio se perdía.
// Ahora: parecidos al buscar, grupo sugerido por el nombre y «Guardar rutina» crea y agrega lo que está a medio cargar.
test.beforeAll(({ baseURL }) => assertLocalTarget(baseURL));

test("rutina a mano: un ejercicio nuevo se crea y se guarda con un solo «Guardar rutina»", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  const mine = page.locator("section.or");
  await mine.getByRole("button", { name: /Cargarla a mano|Nueva/ }).first().click();
  const sheet = page.getByRole("dialog", { name: /Mi rutina/ });
  await sheet.getByRole("textbox", { name: "Nombre" }).first().fill("Espalda en Smith");
  await sheet.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("Remo en smith");
  // No existe con ese nombre: propone los parecidos (los remos) antes de crear uno repetido.
  await expect(sheet.getByText(/¿Es alguno de estos\?/)).toBeVisible();
  await expect(sheet.locator(".or-results button").filter({ hasText: /^Remo/ }).first()).toBeVisible();
  await sheet.getByRole("button", { name: /Crear «Remo en smith»/ }).click();
  const form = sheet.getByRole("group", { name: "Crear ejercicio" });
  // Grupo sugerido por el nombre (se puede cambiar) y «con peso».
  await expect(form.getByRole("group", { name: "Grupo muscular del ejercicio nuevo" }).getByRole("button", { name: "Espalda" })).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByText(/Le pusimos Espalda por el nombre/)).toBeVisible();
  await expect(form.getByRole("button", { name: "Con peso" })).toHaveAttribute("aria-pressed", "true");
  // Directo a «Guardar rutina», sin «Crear y agregar»: se crea, se agrega y se guarda.
  await sheet.getByRole("button", { name: "Guardar rutina" }).click();
  await expect(sheet).toHaveCount(0);
  const card = mine.locator(".or-card").filter({ hasText: "Espalda en Smith" });
  await expect(card.getByText("Remo en smith")).toBeVisible();
  await expect(card.getByText(/1 ejercicio\b/)).toBeVisible();

  // Sin grupo reconocible, «Crear y agregar» explica qué falta en lugar de quedar apagado.
  await card.getByRole("button", { name: "Editar" }).click();
  const ed = page.getByRole("dialog", { name: "Editar rutina" });
  await ed.getByRole("button", { name: /Agregar ejercicio/ }).click();
  await ed.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("Máquina 7 xyz");
  await ed.getByRole("button", { name: /Crear «Máquina 7 xyz»/ }).click();
  await ed.getByRole("button", { name: "Crear y agregar" }).click();
  await expect(ed.getByRole("alert").filter({ hasText: "Elegí el grupo muscular del ejercicio." })).toBeVisible();
  await ed.getByRole("group", { name: "Grupo muscular del ejercicio nuevo" }).getByRole("button", { name: "Piernas" }).click();
  await ed.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(ed).toHaveCount(0);
  await expect(card.getByText(/2 ejercicios/)).toBeVisible();
  expect(errors).toEqual([]);
});

// 05/11/2026 (reporte de un alumno con captura): el cardio pedía series y el tiempo sólo en segundos, y al dejar el tiempo vacío
// «Guardar rutina» no hacía nada visible (el aviso quedaba arriba de todo de la hoja). Ahora el cardio es una actividad continua,
// el tiempo va en minutos y segundos y el aviso aparece junto al botón.
test("rutina a mano: cardio como actividad continua con minutos y segundos; el aviso se ve junto a «Guardar»", async ({ page }) => {
  const errors = watchErrors(page);
  await openDemo(page, "member");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: /Entrenar/ }).click();
  const mine = page.locator("section.or");
  await mine.getByRole("button", { name: /Cargarla a mano|Nueva/ }).first().click();
  const sheet = page.getByRole("dialog", { name: /Mi rutina/ });
  await sheet.getByRole("textbox", { name: "Nombre" }).first().fill("Cardio suave");
  await sheet.getByRole("searchbox", { name: "Buscar ejercicio" }).fill("Cinta");
  await sheet.locator(".or-results button").filter({ hasText: /^Cinta/ }).first().click();
  const name = (await sheet.locator("legend").first().innerText()).replace(/^\d+\.\s*/, "").replace(/\s*Cardio$/, "").trim();
  await expect(sheet.getByText("Actividad continua")).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: `Series de ${name}` })).toHaveCount(0);
  const min = sheet.getByRole("textbox", { name: `Minutos de ${name}` }), sec = sheet.getByRole("textbox", { name: `Segundos de ${name}` });
  await expect(min).toHaveValue("20");
  await expect(sec).toHaveValue("0");
  // Sin tiempo: el aviso dice qué falta y se ve sin subir.
  await min.fill(""); await sec.fill("");
  await sec.blur();
  await sheet.getByRole("button", { name: "Guardar rutina" }).click();
  const warn = sheet.getByRole("alert").filter({ hasText: `Completá el tiempo de ${name}.` });
  await expect(warn).toBeVisible();
  await expect(warn).toBeInViewport();
  await min.fill("25"); await sec.fill("30"); await sec.blur();
  await sheet.getByRole("button", { name: "Guardar rutina" }).click();
  await expect(sheet).toHaveCount(0);
  const card = mine.locator(".or-card").filter({ hasText: "Cardio suave" });
  await expect(card.getByText("25 min 30 s")).toBeVisible();
  const saved = (await (await page.request.get("/api/me/routines")).json()) as { name: string; exercises: { sets: number; reps: string }[] }[];
  expect(saved.find((r) => r.name === "Cardio suave")?.exercises[0]).toMatchObject({ sets: 1, reps: "1530 s" });
  expect(errors).toEqual([]);
});
