// Guardas puras para respaldo y restauración. Nunca incluyen la URL, el usuario ni la contraseña en un error.
// Respaldo: sólo lee bases locales conocidas. Restauración: sólo escribe en repi_restore_check local, nunca en dev/test/prod.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TARGETS = { backup: ["repi_dev", "repi_test"], restore: ["repi_restore_check"] } as const;
const HEX64 = /^[0-9a-f]{64}$/;
const SCHEMAS = new Set(["public", "drizzle"]);

export function localTarget(value: string | undefined, kind: "backup" | "restore") {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new Error("La URL de la base no es válida."); }
  const allowed: readonly string[] = TARGETS[kind];
  if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !LOCAL_HOSTS.has(url.hostname) || url.search || url.hash
    || !allowed.includes(url.pathname.slice(1))) {
    throw new Error(`Operación bloqueada: ${kind === "restore" ? "la restauración" : "el respaldo"} sólo acepta ${allowed.join(" o ")} en localhost, sin parámetros.`);
  }
  return url;
}

/** Claves de objetos tal como las guarda REPI: segmentos simples separados por «/», sin rutas relativas ni absolutas. */
export function safeStorageKey(value: string) {
  const segments = value.split("/");
  if (!value || value.length > 300 || /[\\\u0000-\u001f\u007f]/.test(value) || segments.some((s) => !s || s === "." || s === "..")) {
    throw new Error("Clave de objeto inválida en el respaldo.");
  }
  return value;
}

export type BackupManifest = {
  version: 1; status: "complete"; database: { sha256: string; bytes: number };
  tables: { schema: string; name: string; rows: number }[];
  storage: { included: boolean; files: { key: string; sha256: string; bytes: number }[] };
};
const count = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const bad = () => new Error("Manifiesto de respaldo incompleto o alterado: no se restaura.");

/** Se valida antes de conectar a ninguna base: un respaldo a medias o modificado no se restaura. */
export function checkedManifest(value: unknown): BackupManifest {
  const m = value as BackupManifest;
  if (!m || typeof m !== "object" || m.version !== 1 || m.status !== "complete") throw bad();
  if (!m.database || !HEX64.test(m.database.sha256) || !count(m.database.bytes)) throw bad();
  if (!Array.isArray(m.tables) || !m.tables.every((t) => t && SCHEMAS.has(t.schema) && typeof t.name === "string" && /^[a-z_][a-z0-9_]*$/.test(t.name) && count(t.rows))) throw bad();
  if (!m.storage || typeof m.storage.included !== "boolean" || !Array.isArray(m.storage.files)) throw bad();
  for (const f of m.storage.files) {
    if (!f || !HEX64.test(f.sha256) || !count(f.bytes)) throw bad();
    try { safeStorageKey(f.key); } catch { throw bad(); }
  }
  if (!m.storage.included && m.storage.files.length) throw bad();
  return m;
}
