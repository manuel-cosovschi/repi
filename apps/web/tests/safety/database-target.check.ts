// Suite deliberadamente independiente de Vitest: nunca conecta ni recrea esquemas.
import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalDatabaseIdentity, assertSeedDatabaseTarget, assertTestDatabaseTarget } from "../../scripts/lib/database-target";

const TEST_URL = "postgresql://repi:private-value@127.0.0.1:5432/repi_test";
const APP_URL = "postgresql://repi:private-value@localhost:5432/repi_dev";

test("permite sólo la base descartable local exacta", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const url = `postgresql://repi:private-value@${host}:5432/repi_test`;
    assert.equal(assertTestDatabaseTarget(url, APP_URL), url);
  }
});

test("rechaza palabras repi_test fuera del nombre exacto de base y destinos remotos", () => {
  const invalid = [
    undefined, "", "not-a-url", "https://localhost/repi_test",
    "postgresql://repi_test:private-value@localhost:5432/repi_dev",
    "postgresql://repi:repi_test@localhost:5432/postgres",
    "postgresql://repi:private-value@repi_test.remote.example:5432/postgres",
    "postgresql://repi:private-value@remote.example:5432/repi_test",
    "postgresql://repi:private-value@localhost.remote.example:5432/repi_test",
    "postgresql://repi:private-value@localhost:5432/my_repi_test",
    "postgresql://repi:private-value@localhost:5432/repi_test_copy",
    "postgresql://repi:private-value@localhost:5432/repi_test?host=remote.example",
    "postgresql://repi:private-value@localhost:5432/repi_test?database=postgres",
    "postgresql://repi:private-value@localhost:5432/repi_test#postgres",
    "postgresql://repi:private-value@127.0.0.2:5432/repi_test",
  ];
  for (const url of invalid) assert.throws(() => assertTestDatabaseTarget(url, APP_URL), { name: "Error" }, "aceptó un destino inseguro");
});

test("no permite recrear la base usada por la aplicación aun con otros usuario o alias local", () => {
  for (const app of [TEST_URL, "postgres://different:secret@localhost:5432/repi_test", "postgres://different:secret@[::1]:5432/repi_test"]) {
    assert.throws(() => assertTestDatabaseTarget(TEST_URL, app));
  }
});

test("las tareas locales no aceptan un contexto de producción o despliegue hospedado", () => {
  for (const env of [{ NODE_ENV: "production" }, { REPI_DEPLOY: "demo" }, { REPI_DEPLOY: "production" }, { VERCEL: "1" }]) {
    assert.throws(() => assertTestDatabaseTarget(TEST_URL, APP_URL, env));
    assert.throws(() => assertSeedDatabaseTarget(APP_URL, env));
  }
});

test("seed sólo acepta repi_dev local y no una base hospedada o repi_test", () => {
  assert.equal(assertSeedDatabaseTarget(APP_URL, { NODE_ENV: "development" }), APP_URL);
  for (const url of [TEST_URL, undefined, "postgresql://repi:private-value@remote.example:5432/repi_dev", "postgresql://repi:private-value@localhost:5432/postgres", "postgresql://repi:private-value@localhost:5432/repi?host=remote.example"]) {
    assert.throws(() => assertSeedDatabaseTarget(url));
  }
});

test("comprueba la identidad devuelta por PostgreSQL antes de destruir o sembrar datos", () => {
  assert.doesNotThrow(() => assertLocalDatabaseIdentity({ database: "repi_test", serverAddress: "127.0.0.1" }, "repi_test"));
  assert.doesNotThrow(() => assertLocalDatabaseIdentity({ database: "repi_dev", serverAddress: "::1" }, "repi_dev"));
  assert.doesNotThrow(() => assertLocalDatabaseIdentity({ database: "repi_test", serverAddress: "::ffff:127.0.0.1" }, "repi_test"));
  for (const identity of [{ database: "postgres", serverAddress: "127.0.0.1" }, { database: "repi_test", serverAddress: "10.0.0.2" }, { database: "repi_test", serverAddress: null }]) {
    assert.throws(() => assertLocalDatabaseIdentity(identity, "repi_test"));
  }
});

test("los errores de validación no filtran la URL ni su contraseña", () => {
  for (const run of [() => assertTestDatabaseTarget("postgresql://repi:DO_NOT_LEAK@remote.example/repi_test", APP_URL), () => assertSeedDatabaseTarget("postgresql://repi:DO_NOT_LEAK@remote.example/repi_dev")]) {
    assert.throws(run, (e: unknown) => e instanceof Error && !e.message.includes("DO_NOT_LEAK") && !e.message.includes("postgresql://"));
  }
});
