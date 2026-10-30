// Carga .env.local y apunta todo a la base de pruebas ANTES de importar @/db.
import { fileURLToPath } from "node:url";
import { assertTestDatabaseTarget } from "../scripts/lib/database-target";
try { process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url))); } catch {}
process.env.DATABASE_URL = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, process.env);
// Las pruebas nunca usan proveedores ni credenciales de correo reales heredados del shell.
delete process.env.RESEND_API_KEY;
process.env.MAIL_DRIVER = "dev";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.ROSTER_HMAC_SECRET ??= "test-roster-secret";
// D158: el horario del gimnasio (6 a 22) no aplica a las pruebas, que corren a cualquier hora; tiene su propia prueba.
process.env.REPI_GYM_HOURS = "off";
