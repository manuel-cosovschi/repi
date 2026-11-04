// D190: retención de los respaldos publicados en GitHub Releases. Pura y probada (tests/operations/retention.check.ts).
//   - Se conservan el último respaldo de cada uno de los 30 días más recientes con respaldo y el primero de cada uno de
//     los 4 meses más recientes. El último respaldo válido se conserva siempre.
//   - Sólo se consideran releases con etiqueta `backup-AAAAMMDD-HHMMSS-<ejecución>`; cualquier otra no se toca.
//   - Un borrador de más de 24 h es una subida que no terminó: se borra. Uno más nuevo puede estar en curso: queda.
//   - Un respaldo publicado sin la marca de verificado no se borra (no debería existir): queda para revisión humana.
// Uso en el workflow: gh api … --jq '.[] | {tag: .tag_name, createdAt: .created_at, draft, body}' | tsx retention.ts
export const VERIFIED_MARK = "<!-- repi-backup:verified -->";
export const BACKUP_TAG = /^backup-(\d{8})-(\d{6})-\d+$/;

export type BackupRelease = { tag: string; createdAt: string; draft: boolean; verified: boolean };
export type RetentionPlan = { keep: string[]; remove: string[]; review: string[] };

export function retentionPlan(list: BackupRelease[], now: number, daily = 30, monthly = 4): RetentionPlan {
  const ours = list.filter((r) => BACKUP_TAG.test(r.tag) && Number.isFinite(Date.parse(r.createdAt)));
  const at = (r: BackupRelease) => Date.parse(r.createdAt);
  const remove = new Set<string>(), keep = new Set<string>(), review: string[] = [];
  for (const r of ours.filter((x) => x.draft)) (now - at(r) > 24 * 3600_000 ? remove : keep).add(r.tag);
  for (const r of ours.filter((x) => !x.draft && !x.verified)) { keep.add(r.tag); review.push(r.tag); }
  const valid = ours.filter((x) => !x.draft && x.verified).sort((a, b) => at(b) - at(a) || b.tag.localeCompare(a.tag));
  if (valid.length) keep.add(valid[0].tag);
  const days = new Map<string, BackupRelease>(), months = new Map<string, BackupRelease>();
  for (const r of valid) {
    const iso = new Date(at(r)).toISOString();
    if (!days.has(iso.slice(0, 10))) days.set(iso.slice(0, 10), r); // el primero visto es el más nuevo del día
    months.set(iso.slice(0, 7), r); // el último visto es el más viejo del mes
  }
  [...days.values()].slice(0, daily).forEach((r) => keep.add(r.tag));
  [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, monthly).forEach(([, r]) => keep.add(r.tag));
  for (const r of valid) if (!keep.has(r.tag)) remove.add(r.tag);
  return { keep: [...keep].sort(), remove: [...remove].sort(), review: review.sort() };
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const list = input.split("\n").filter((l) => l.trim()).map((l) => {
    const r = JSON.parse(l) as { tag: string; createdAt: string; draft: boolean; body?: string | null };
    return { tag: r.tag, createdAt: r.createdAt, draft: !!r.draft, verified: (r.body ?? "").includes(VERIFIED_MARK) };
  });
  const plan = retentionPlan(list, Date.now());
  console.error(`Retención: ${plan.keep.length} se conservan, ${plan.remove.length} se eliminan${plan.review.length ? `, ${plan.review.length} sin verificar para revisar` : ""}.`);
  for (const tag of plan.remove) console.log(tag);
}

if (process.argv[1]?.endsWith("retention.ts")) main().catch(() => { console.error("No se pudo calcular la retención."); process.exitCode = 1; });
