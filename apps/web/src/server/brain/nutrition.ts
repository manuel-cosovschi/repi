// REPI Nutrition Assistant (D221): el asistente existente responde sobre el diario de comidas con los datos reales de la
// persona, por reglas (sin IA ni proveedores externos: nada del diario sale de REPI). Registrar siempre se confirma.
import {
  answerDayList, answerMeal, answerPlanTomorrow, answerToday, answerWeek, catalogSnapshot, fmtNutrient, localDate, mergeTotals, nutrientsFor, parseFoodText,
  sensitiveAnswer, MEAL_LABEL, WHY_TEXT, type Meal, type NutritionAsk, type Totals,
} from "@repi/domain";
import { propose, type Reply } from "@repi/domain/brain";
import { FOODS } from "@repi/domain/nutrition/foods";
import { myDay, myFavorites, myProgress, todayTotals, getProfile } from "../nutrition/services";
import type { ServerContext } from "./context";

type Built = { reply: Reply; ref: Record<string, string | number | null> };
const reply = (text: string, p: Partial<Reply> = {}): Reply => ({ text, cards: [], actions: [], via: "rules", ...p });
const dayOf = (now: Date, offset: number) => localDate(new Date(now.getTime() - offset * 86_400_000));
/** Comida por la hora local si la persona no la nombró (se muestra en la confirmación para que la cambie si no corresponde). */
export function mealByHour(now: Date): Meal {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false }).format(now));
  return h < 11 ? "desayuno" : h < 15 ? "almuerzo" : h < 19 ? "merienda" : h < 23 ? "cena" : "colacion";
}

export async function nutritionReply(sc: ServerContext, ask: NutritionAsk, t: { salt: string; now: Date }): Promise<Built> {
  const now = t.now, ref = { intent: "nutrition", kind: ask.kind };
  const open = (to: "day" | "progress", day?: string) => [{ type: "nutrition" as const, to, ...(day ? { day } : {}) }];
  switch (ask.kind) {
    case "sensitive": return { reply: reply(sensitiveAnswer(ask.sensitive), { via: "safety" }), ref };
    case "why": return { reply: reply(WHY_TEXT), ref };
    case "today": {
      const d = await todayTotals(sc.userId, now);
      const p = await getProfile(sc.userId);
      return { reply: reply(answerToday(d.totals, d.status, ask.nutrient, p.targets), { cards: open("day", d.day) }), ref };
    }
    case "meal": {
      const day = dayOf(now, ask.offset);
      const d = await myDay(sc.userId, day, now);
      const m = d.meals.find((x) => x.meal === ask.meal);
      const totals: Totals = m?.totals ?? mergeTotals([]);
      return { reply: reply(answerMeal(ask.meal, totals, ask.offset), { cards: open("day", day) }), ref };
    }
    case "day_list": {
      const day = dayOf(now, ask.offset);
      const d = await myDay(sc.userId, day, now);
      return { reply: reply(answerDayList(d.meals.map((m) => ({ meal: m.meal, names: m.entries.map((e) => e.food.name) })), ask.offset), { cards: open("day", day) }), ref };
    }
    case "week":
    case "best_days": {
      const p = await myProgress(sc.userId, dayOf(now, 6), dayOf(now, 0), now);
      if (ask.kind === "best_days" && !Object.keys(p.targets).length) return { reply: reply("Todavía no definiste objetivos. Si querés, los cargás en Nutrición → Ajustes (los tuyos o los que te dio un profesional)."), ref };
      if (ask.kind === "best_days" && !p.summary.completeDays) return { reply: reply("En los últimos 7 días no marcaste días completos: sin días completos no comparo con tus objetivos."), ref };
      return { reply: reply(answerWeek(p.summary, p.targets, p.consistency, p.workouts), { cards: open("progress") }), ref };
    }
    case "pre_workout": {
      const p = await myProgress(sc.userId, dayOf(now, 13), dayOf(now, 0), now);
      const trained = p.days.filter((d) => d.workouts > 0);
      if (!trained.length) return { reply: reply("En las últimas dos semanas no completaste entrenamientos, así que no tengo comidas previas para mostrarte."), ref };
      const logged = trained.filter((d) => d.totals.items > 0);
      return {
        reply: reply(logged.length
          ? `De tus ${trained.length} días con entrenamiento en las últimas dos semanas, registraste comidas en ${logged.length}. No guardo la hora de cada comida, así que no puedo separar lo de antes y lo de después de entrenar; en Nutrición ves cada día completo.`
          : `Entrenaste ${trained.length} ${trained.length === 1 ? "día" : "días"} en las últimas dos semanas, pero esos días no registraste comidas.`, { cards: open("progress") }),
        ref,
      };
    }
    case "plan_tomorrow": {
      const prof = await getProfile(sc.userId);
      const favs = await myFavorites(sc.userId).catch(() => ({ favorites: [] as { name: string }[] }));
      return { reply: reply(answerPlanTomorrow({ mealsPerDay: prof.prefs.mealsPerDay as number | null, cooking: prof.prefs.cooking as string | null, nextDay: sc.ctx.program.nextDay?.name ?? null, favorites: favs.favorites.map((f) => f.name) })), ref };
    }
    case "log": {
      const parsed = parseFoodText(FOODS, ask.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^\s*(agreg\w*|anot\w*|sum\w*|registr\w*|carg\w*|pon\w*)\s+/i, ""));
      const item = parsed.items.find((i) => i.candidates.length);
      if (!item) return { reply: reply("No encontré ese alimento en la biblioteca. Podés buscarlo con otro nombre o cargarlo a mano en Nutrición."), ref };
      const food = item.candidates[0];
      if (item.issues.some((x) => x.includes("ambiguous_state"))) return { reply: reply(`¿${food.name.split(",")[0]} crudo o cocido? El peso y los valores cambian mucho. Decime, por ejemplo, «agregá 150 g de ${item.query} cocido».`), ref };
      if (!item.quantity) {
        const p = food.portions.find((x) => /unidad|mediana/i.test(x.label)) ?? food.portions[0];
        return { reply: reply(`¿Cuánto? Decime los gramos${p ? ` o una porción (por ejemplo «${p.label}»)` : ""}. No registro una cantidad que no me dijiste.`), ref };
      }
      const meal = ask.meal ?? parsed.meal ?? mealByHour(now);
      const day = dayOf(now, 0);
      const snap = catalogSnapshot(food);
      const n = nutrientsFor(snap, item.quantity);
      const qty = item.quantity.unit === "g" ? `${item.quantity.amount} g` : `${item.quantity.amount} × ${snap.portions[Number(item.quantity.unit.slice(8))]?.label ?? "porción"}`;
      const preview = `${food.name} · ${qty} · ${MEAL_LABEL[meal].toLowerCase()} de hoy. ${fmtNutrient("energyKcal", n.energyKcal)} · proteína ${fmtNutrient("proteinG", n.proteinG)}. Fuente: ${snap.source.label}.`;
      const action = propose("log_food", { foodSlug: food.slug, amount: item.quantity.amount, unit: item.quantity.unit, meal, day }, `Registrar ${food.name.split(",")[0].toLowerCase()}`, preview, t.salt);
      return { reply: reply(`¿Lo registro así? ${preview}`, { actions: [action] }), ref };
    }
  }
}
