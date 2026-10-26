// Carga .env.local y apunta todo a la base de pruebas ANTES de importar @/db.
try { process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname); } catch {}
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL no está configurada");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.ROSTER_HMAC_SECRET ??= "test-roster-secret";
