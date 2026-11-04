import assert from "node:assert/strict";
import test from "node:test";
import { retentionPlan, type BackupRelease } from "../../scripts/operations/retention";

const DAY = 24 * 3600_000;
const NOW = Date.parse("2026-11-04T12:00:00Z");
const rel = (iso: string, extra: Partial<BackupRelease> = {}, n = 1): BackupRelease => {
  const d = new Date(iso).toISOString();
  return { tag: `backup-${d.slice(0, 10).replace(/-/g, "")}-${d.slice(11, 19).replace(/:/g, "")}-${n}`, createdAt: d, draft: false, verified: true, ...extra };
};

test("retención: 30 diarios más recientes y el primero de cada uno de los 4 meses más recientes", () => {
  const list = Array.from({ length: 200 }, (_, i) => rel(new Date(NOW - i * DAY).toISOString(), {}, i));
  const plan = retentionPlan(list, NOW);
  const daily = list.slice(0, 30).map((r) => r.tag);
  for (const t of daily) assert.ok(plan.keep.includes(t));
  // Meses más recientes: nov, oct, sep, ago 2026 → su primer respaldo.
  for (const day of ["2026-11-01", "2026-10-01", "2026-09-01", "2026-08-01"]) assert.ok(plan.keep.some((t) => t.startsWith(`backup-${day.replace(/-/g, "")}`)), day);
  assert.ok(!plan.keep.some((t) => t.startsWith("backup-20260701")));
  assert.equal(plan.keep.length + plan.remove.length, 200);
  assert.ok(plan.keep.length <= 34);
});

test("retención: varios respaldos en un día cuentan una vez (se conserva el último del día) y el último válido siempre queda", () => {
  const morning = rel("2026-11-04T06:17:00Z", {}, 10), pre = rel("2026-11-04T09:00:00Z", {}, 11);
  const plan = retentionPlan([morning, pre], NOW);
  assert.ok(plan.keep.includes(pre.tag));
  // El de la mañana es también el primero de noviembre: queda como mensual.
  assert.ok(plan.keep.includes(morning.tag));
  const only = retentionPlan([rel("2025-01-01T00:00:00Z")], NOW, 0, 0);
  assert.equal(only.keep.length, 1);
  assert.equal(only.remove.length, 0);
});

test("retención: borradores viejos se limpian, los nuevos quedan; sin verificar y ajenos no se tocan", () => {
  const stale = rel("2026-11-02T06:00:00Z", { draft: true, verified: false }, 1);
  const running = rel("2026-11-04T11:30:00Z", { draft: true, verified: false }, 2);
  const unverified = rel("2026-01-01T06:00:00Z", { verified: false }, 3);
  const foreign = { tag: "v1.0.0", createdAt: "2020-01-01T00:00:00Z", draft: false, verified: false };
  const plan = retentionPlan([stale, running, unverified, foreign, rel("2026-11-03T06:00:00Z", {}, 4)], NOW);
  assert.deepEqual(plan.remove, [stale.tag]);
  assert.ok(plan.keep.includes(running.tag) && plan.keep.includes(unverified.tag));
  assert.deepEqual(plan.review, [unverified.tag]);
  assert.ok(!plan.keep.includes("v1.0.0") && !plan.remove.includes("v1.0.0"));
});
