# Respaldos de producción en GitHub (D190)

Los respaldos de producción se hacen y se prueban en GitHub Actions y se guardan cifrados en GitHub Releases del repositorio privado. No dependen de la Mac del titular ni de un disco conectado. El respaldo del SSD SANDISK (`/Volumes/SANDISK/REPI/Backups/`, D187) se conserva tal cual y es independiente de este sistema.

| | |
|---|---|
| Workflow | `.github/workflows/backup.yml` («Respaldo»): diario a las 03:17 (Buenos Aires, con un turno de reserva a las 09:47 que sólo respalda si el de la madrugada no lo hizo), manual con «Run workflow» o a pedido con un issue «Respaldo: <motivo>» abierto por el dueño del repositorio |
| Dónde quedan | Releases con etiqueta `backup-AAAAMMDD-HHMMSS-<ejecución>`: un archivo `repi-backup-….tar.gz.age` y su `.sha256` |
| Contenido | Todas las tablas de `public` (COPY en un único instante, `REPEATABLE READ READ ONLY`), `drizzle.__drizzle_migrations`, los archivos de Storage (`media_object`) y `manifest.json` con el SHA-256 de cada archivo |
| Cifrado | [age](https://age-encryption.org) (X25519 + ChaCha20-Poly1305, autenticado). La clave pública del titular está en `apps/web/scripts/operations/backup-recipients.txt` (o en la variable `REPI_BACKUP_AGE_RECIPIENTS`, si existe); la **privada nunca entra a GitHub**: está en el Google Drive del titular, carpeta «REPI — Recuperación de respaldos» |
| Retención | El último de cada uno de los 30 días más recientes con respaldo, más el primero de cada uno de los 4 meses más recientes. El último válido no se borra nunca. Los días se cuentan por la fecha de **publicación** del release (`published_at`), no por `created_at`, que en GitHub es la fecha del commit de destino |
| Alerta | Si falla o se corta, el workflow abre o comenta el issue «Respaldo de producción fallido», asignado al titular (GitHub avisa por correo y en la app). El siguiente éxito lo cierra |

## Qué hace cada ejecución

1. **Lee** producción con el rol `repi_backup`:
   - `default_transaction_read_only`, sin escritura en ninguna tabla, `BYPASSRLS` para ver todas las filas y como máximo 3 conexiones (`apps/web/scripts/operations/hosted-backup-role.sql`).
   - **Sin contraseñas guardadas.** El job pide a la Edge Function `repi-backup-credentials` una contraseña para `repi_backup`, presentando su token OIDC (audiencia `repi-backup-db`).
     - La función sólo responde al workflow `backup.yml` en `main`.
     - Fija una contraseña aleatoria nueva que vence en 2 h. Al terminar, el job la revoca: queda otra que nadie conoce, ya vencida.
     - El usuario de la app (`repi_app`) no se toca.
   - Storage se lee con el **token OIDC del job**. La Edge Function `repi-storage` sólo firma lecturas, y sólo para este workflow en `main` (`schedule` o `workflow_dispatch`, ver `supabase/functions/repi-storage/github-oidc.ts`). No hay secreto de Storage en GitHub.
2. `backup.ts` escribe el respaldo en el disco temporal del runner y el manifiesto al final (un respaldo cortado no queda «complete»).
3. **Cifra** (`backup-ci.sh pack`) para la clave del titular y para una clave **efímera** creada en ese job. Borra la copia sin cifrar.
4. **Prueba el archivo cifrado** (`backup-ci.sh verify`):
   - Lo descifra con la clave efímera y recalcula cada SHA-256 contra el manifiesto.
   - Lo restaura en un PostgreSQL **descartable del runner** (`repi_restore_check`): filas por tabla, todas las claves foráneas sin huérfanos y 0 restricciones sin validar.
   - La clave efímera se borra al terminar y muere con la máquina del job. Sirve para probar el archivo que se publica, no una copia anterior. No agrega exposición: quien pudiera leerla durante el job ya vería los datos sin cifrar.
5. **Publica** primero como borrador:
   - Baja lo subido y lo compara byte a byte. Recién entonces lo publica, con la marca `<!-- repi-backup:verified -->`.
   - Las notas sólo tienen cantidades, hashes y la clave pública. No hay datos personales.
6. **Retención:**
   - Borra los releases de respaldo que quedan fuera de la regla y los borradores de más de 24 h (subidas cortadas).
   - No toca releases que no sean de respaldo.

Nada sin cifrar sale del runner: no hay caché de datos ni commits. El único artefacto es el archivo **cifrado**, que dura 1 día y sirve para comprobar desde afuera que la clave del titular lo abre. Las etiquetas apuntan a commits existentes y no agregan archivos al historial.

**La automatización se habilita sola:** el cronograma no hace nada mientras no exista un respaldo verificado publicado. La primera ejecución manual exitosa, con los secretos reales, es la prueba completa que lo habilita.

**En un PR que toca el respaldo** corre la *autoprueba*:
- Usa la misma cadena sobre una base de demostración del runner, con claves de prueba.
- Sube y baja un release borrador (después se borra).
- Ejecuta el procedimiento de recuperación de abajo y comprueba que una clave ajena o un archivo alterado se rechazan.

## Cronograma diario y vigilancia (05/11/2026, PR #27)

- **Dos turnos:** `17 6 * * *` (03:17 Buenos Aires) y `47 12 * * *` (09:47, reserva). GitHub puede demorar o descartar ejecuciones programadas: el 05/11 no creó la de las 06:17 (0 ejecuciones `schedule` en el repositorio).
- **Sin duplicados:** en un turno programado, «Automatización habilitada» cuenta los releases publicados **ese día UTC** (`published_at`) con la marca de verificado y «Motivo: diario». Si ya hay uno, el turno termina sin respaldar y sin alerta. Los respaldos por issue o manuales siempre corren y no cuentan como diario.
- **Cómo saber si el cronograma funciona:** Actions → Respaldo, filtrar por evento `schedule`, o `gh api "repos/manuel-cosovschi/repi/actions/runs?event=schedule"`. Un respaldo manual o por issue en verde garantiza una copia reciente, pero **no** prueba el cronograma.
- **Si se omiten los dos turnos:** pedir un respaldo con un issue «Respaldo: diario manual (cronograma omitido)». La integración no puede usar «Run workflow» (403).
- **Estado al 05/11 (cierre del 06/06):** el cronograma disparó por primera vez a las 14:40 UTC (evento `schedule`, corrida 42047337258 → `backup-20261105-144245-42047337258`, verificado). Una sola ejecución no prueba que sea confiable: seguir mirando Actions → Respaldo → filtro `schedule` durante una semana. Mientras tanto vale la alerta de abajo.
- **Archivos purgados:** el respaldo copia sólo los archivos vigentes de `media_object` (`deleted_at is null`). Las filas de los purgados quedan en la base y en el respaldo como registro (PR #30: antes, una foto purgada hacía fallar el respaldo con 404).
- **Vigilante independiente (D198, 06/06):** si pasan **más de 30 h sin un respaldo verificado** llega un email a `ALERT_EMAIL` (el mismo de las alertas de errores, D149). Detecta también una ejecución que nunca empezó, porque no depende de GitHub:
  - El paso «Señal de respaldo verificado» de `backup.yml` avisa a `POST /api/cron/backup-heartbeat` con la etiqueta del release. REPI lo anota en `audit_event` (`backup.verified`, sin datos personales).
  - La tarea de cada minuto (pg_cron de Supabase → `/api/cron/notifications`) revisa una vez por hora (minuto 7). Como mucho un email cada 12 h mientras siga sin respaldo.
  - **Estado (05/11/2026 21:30 UTC): NO ARMADO.**
    - Vercel: `BACKUP_HEARTBEAT_SECRET` configurado y activo en producción (`4d81b6a`). Comprobado sin registrar nada: con la clave, una señal inválida da 400; sin ella, 404.
    - GitHub Actions: **falta el secreto.** La integración de Claude no puede escribir secretos de Actions: el conector de GitHub no tiene esa operación y `gh` no tiene token válido en la sesión.
    - 0 señales registradas.
    - Se considera activo cuando haya una señal auténtica registrada y la revisión siguiente diga `armed: true`.
  - **Se arma con la primera señal:** hasta configurar el secreto no avisa nada (sin falsas alarmas) y el respaldo funciona igual. Si la señal falla, el respaldo igual se publica y el vigilante avisa a las 30 h.
  - **Para activarlo (titular, 5 minutos):**
    1. Generar un secreto largo en tu computadora: `openssl rand -hex 32` (no lo pegues en el chat).
    2. Vercel → proyecto repi → Settings → Environment Variables → `BACKUP_HEARTBEAT_SECRET` (Production) con ese valor → Redeploy.
    3. GitHub → Settings → Secrets and variables → Actions → New repository secret → `BACKUP_HEARTBEAT_SECRET` con el mismo valor.
    4. Pedir un respaldo con un issue «Respaldo: prueba del vigilante». En el resumen de la corrida tiene que decir «Vigilante de REPI: señal enviada».
  - **Segunda capa opcional (externa, gratis):** un «dead man's switch» como Healthchecks.io (período 1 día, gracia 6 h). Guardar la URL de ping como secreto `BACKUP_DEADMAN_URL`: el mismo paso la llama. Avisa aunque REPI entero esté caído. Requiere crear la cuenta: decisión del titular.
- **Pérdida máxima esperable (RPO): hasta ~24 h** de escrituras (un respaldo verificado por día; con el plan gratuito de Supabase no hay respaldos gestionados ni PITR). Con Supabase Pro se suman los diarios del proveedor (7 días); con PITR baja a minutos.
- **Tiempo objetivo de recuperación (RTO): 2–4 h** para un desastre real con el procedimiento de abajo (proyecto Supabase nuevo, migraciones, carga y Storage). No está ensayado de punta a punta en un proyecto nuevo: sí la restauración verificada en PostgreSQL descartable en cada corrida.
- `REPI_BACKUP_DATABASE_URL` y `REPI_BACKUP_AGE_RECIPIENTS` siguen funcionando si alguna vez se cargan, y tienen prioridad.

**Clave privada:** `repi-respaldos.age.key`, en el Google Drive del titular (carpeta «REPI — Recuperación de respaldos», sin compartir).
- Sin esa clave los respaldos no se pueden abrir: nadie puede recuperarla, tampoco GitHub ni Claude.
- Se recomienda una segunda copia fuera de línea: impresa, o en el SSD en una carpeta distinta de `Backups/`.

**Comprobar la clave** cada tanto, desde `apps/web`:

```bash
./scripts/operations/restore-from-release.sh último ~/ruta/repi-respaldos.age.key --sin-base
```

Tiene que terminar en «Respaldo íntegro», con el mismo hash de base que figura en las notas del release.

## Antes de cada migración productiva

1. Pedir el respaldo de una de estas dos formas:
   - Actions → Respaldo → **Run workflow**, con el motivo.
   - Un issue titulado **«Respaldo: antes de la migración 0043»**. Así lo pide Claude Code, que actúa con la cuenta del titular. El workflow sólo acepta issues del dueño del repositorio que empiezan con «Respaldo:».
2. Esperar a que termine **en verde**:
   - Si lo pediste por issue, el workflow lo cierra con el enlace al release verificado.
   - Si falla, lo comenta en el issue y abre la alerta. En ese caso **no se migra**.
3. Anotar la etiqueta del release en la bitácora de la migración.

## Recuperación

**Nunca se restaura sobre producción.** `restore.ts` sólo escribe en `repi_restore_check` de `localhost`, y lo confirma con el propio servidor.

### Ensayo o consulta (computadora con PostgreSQL local)

```bash
cd apps/web
createdb -h localhost repi_restore_check 2>/dev/null || true
export RESTORE_DATABASE_URL=postgresql://<usuario>@localhost:5432/repi_restore_check
# Con gh (sesión de GitHub con acceso al repositorio):
./scripts/operations/restore-from-release.sh último ~/ruta/repi-respaldos.age.key
./scripts/operations/restore-from-release.sh backup-20261104-061700-123456789 ~/ruta/repi-respaldos.age.key
# Sin gh: bajá el .tar.gz.age y el .sha256 desde la página del release, a la misma carpeta:
./scripts/operations/restore-from-release.sh --archivo ~/Downloads/repi-backup-….tar.gz.age ~/ruta/repi-respaldos.age.key
```

El script hace esto:
1. Comprueba el SHA-256 publicado.
2. Descifra con tu clave. Una clave equivocada o un archivo alterado se rechazan.
3. Recalcula el hash de cada tabla y archivo contra el manifiesto.
4. Crea el esquema con las migraciones del código. El código tiene que tener al menos las migraciones del respaldo.
5. Carga los datos y comprueba filas, claves foráneas y restricciones.

Lo descifrado queda en `~/.repi-secrets/restore/<carpeta>` (0700). Borralo al terminar.

### Desastre real (producción perdida o dañada)

Es una decisión del titular, no un paso automático.

1. Ensayar primero la recuperación en `repi_restore_check`, como arriba.
2. Crear un proyecto Supabase **nuevo**. No se escribe sobre el dañado.
3. Crear el rol `repi_app` y aplicar las migraciones como `repi_app`, igual que en D186.
4. Cargar las tablas con el mismo método de `restore.ts`: COPY por tabla en una transacción, con `session_replication_role = replica` y las secuencias al máximo.
5. Subir los archivos de `storage/` al bucket `repi-private`.
6. Recién después, apuntar Vercel al proyecto nuevo.

Para el paso 4 hace falta una variante del script con destino explícito. Se prepara y se revisa en ese momento, con autorización.

## Seguridad y límites

- **Secretos en GitHub:** ninguno obligatorio. Opcionales: `BACKUP_HEARTBEAT_SECRET` (sólo sirve para anotar «hubo respaldo»; no lee nada) y `BACKUP_DEADMAN_URL`.
  - La base usa una contraseña temporal por ejecución, de un rol de sólo lectura, emitida por `repi-backup-credentials`.
  - Storage usa el token OIDC.
  - La clave pública es pública por naturaleza.
- **Quién lee los secretos:** sólo el job de respaldo. El job de PR no los recibe y la autoprueba usa datos de demostración.
- **Logs:** nombres de tabla, cantidades y hashes. Las URL de conexión se ocultan en los errores y GitHub enmascara los secretos.
- **Rotar la clave age:**
  1. Agregar la clave nueva a `backup-recipients.txt`.
  2. Esperar un respaldo.
  3. Quitar la vieja.
  4. Los respaldos anteriores siguen abriéndose con la clave vieja: no la borres hasta que venzan por retención (unos 4 meses).
- **Revocar el acceso:**
  - Borrar la Edge Function `repi-backup-credentials`. Sin ella, el job no obtiene contraseña.
  - `alter role repi_backup nologin;` o cambiar la contraseña.
  - Quitar el bloque OIDC de la Edge Function corta la lectura de Storage.
- **Tamaño:** hoy unos 2–3 MB cifrados (26 MB de base, un archivo de Storage). GitHub admite archivos de hasta 2 GB por release; los releases no consumen minutos ni el almacenamiento de Actions.
