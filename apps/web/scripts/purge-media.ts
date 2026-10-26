// Job D39: borra videos vencidos. Programar una vez por día (cron del servidor o del proveedor).
// Uso: pnpm jobs:purge-media
import { sqlClient } from "@/db";
import { purgeMedia } from "@/server/followup/services";

purgeMedia().then((r) => { console.log(`videos borrados: ${r.retention} por retención, ${r.orphans} huérfanos`); return sqlClient.end(); });
