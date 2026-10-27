import assert from "node:assert/strict";
import test from "node:test";
import { localTarget, safeStorageKey, checkedManifest } from "../../scripts/operations/guards";

test("restore sólo puede apuntar a repi_restore_check local", () => {
  assert.equal(localTarget("postgres://u:p@localhost:5432/repi_restore_check", "restore").pathname, "/repi_restore_check");
  for (const url of ["postgres://u:p@remote.example/repi_restore_check", "postgres://u:p@localhost/repi_dev", "postgres://u:p@localhost/repi_test", "postgres://u:p@localhost/postgres", "postgres://u:p@localhost/repi_restore_check?host=remote.example", "postgres://u:p@localhost/repi_restore_check#other", "https://localhost/repi_restore_check"]) assert.throws(() => localTarget(url, "restore"));
});
test("backup sólo lee bases locales conocidas y rechaza secretos en errores", () => {
  for (const database of ["repi_dev", "repi_test"]) assert.equal(localTarget(`postgresql://u:p@127.0.0.1/${database}`, "backup").pathname, `/${database}`);
  assert.throws(() => localTarget("postgres://u:DO_NOT_LEAK@remote.example/postgres", "backup"), e => e instanceof Error && !e.message.includes("DO_NOT_LEAK"));
});
test("ninguna clave de objetos puede escapar de la carpeta de respaldo", () => {
  assert.equal(safeStorageKey("request-video/a/123-abc"), "request-video/a/123-abc");
  for (const key of ["../escape", "/tmp/escape", "a/../../escape", "a//b", "a/./b", "a\\b", "", "a/", "a\nfile"]) assert.throws(() => safeStorageKey(key));
});
test("restore rechaza respaldos incompletos o manifiestos alterados antes de conectar", () => {
  const manifest = { version: 1, status: "complete", database: { sha256: "a".repeat(64), bytes: 2 }, tables: [{ schema: "public", name: "user", rows: 4 }], storage: { included: false, files: [] } };
  assert.equal(checkedManifest(manifest).status, "complete");
  for (const changed of [{ ...manifest, status: "in_progress" }, { ...manifest, version: 2 }, { ...manifest, database: { sha256: "invalid", bytes: 2 } }, { ...manifest, tables: [{ schema: "other", name: "user", rows: 1 }] }, { ...manifest, tables: [{ schema: "public", name: "user", rows: -1 }] }, { ...manifest, storage: { included: true, files: [{ key: "../escape", sha256: "a".repeat(64), bytes: 5 }] } }]) assert.throws(() => checkedManifest(changed));
});
