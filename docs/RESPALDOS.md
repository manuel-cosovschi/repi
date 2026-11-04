# Respaldos de producción en GitHub (D190)

Los respaldos de producción se hacen y se prueban en GitHub Actions y se guardan cifrados en GitHub Releases del repositorio privado. No dependen de la Mac del titular ni de un disco conectado. El respaldo del SSD SANDISK (`/Volumes/SANDISK/REPI/Backups/`, D187) se conserva tal cual y es independiente de este sistema.

| | |
|---|---|
| Workflow | `.github/workflows/backup.yml` («Respaldo»): diario a las 03:17 (Buenos Aires), manual con «Run workflow» o a pedido con un issue «Respaldo: <motivo>» abierto por el dueño del repositorio |
| Dónde quedan | Releases con etiqueta `backup-AAAAMMDD-HHMMSS-<ejecución>`: un archivo `repi-backup-….tar.gz.age` y su `.sha256` |
| Contenido | Todas las tablas de `public` (COPY en un único instante, `REPEATABLE READ READ ONLY`), `drizzle.__drizzle_migrations`, los archivos de Storage (`media_object`) y `manifest.json` con el SHA-256 de cada archivo |
| Cifrado | [age](https://age-encryption.org) (X25519 + ChaCha20-Poly1305, autenticado). La clave pública del titular está en la variable `REPI_BACKUP_AGE_RECIPIENTS`; la **privada nunca entra a GitHub** |
| Retención | El último de cada uno de los 30 días más recientes con respaldo, más el primero de cada uno de los 4 meses más recientes. El último válido no se borra nunca |
| Alerta | Si falla o se corta, el workflow abre o comenta el issue «Respaldo de producción fallido», asignado al titular (GitHub avisa por correo y en la app). El siguiente éxito lo cierra |

## Qué hace cada ejecución

1. **Lee** producción con el rol `repi_backup`:
   - `default_transaction_read_only`, sin escritura en ninguna tabla, `BYPASSRLS` para ver todas las filas y como máximo 3 conexiones (`apps/web/scripts/operations/hosted-backup-role.sql`).
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

Nada sin cifrar sale del runner: no hay artefactos, caché de datos ni commits. Las etiquetas apuntan a commits existentes y no agregan archivos al historial.

**La automatización se habilita sola:** el cronograma no hace nada mientras no exista un respaldo verificado publicado. La primera ejecución manual exitosa, con los secretos reales, es la prueba completa que lo habilita.

**En un PR que toca el respaldo** corre la *autoprueba*:
- Usa la misma cadena sobre una base de demostración del runner, con claves de prueba.
- Sube y baja un release borrador (después se borra).
- Ejecuta el procedimiento de recuperación de abajo y comprueba que una clave ajena o un archivo alterado se rechazan.

## Puesta en marcha (una sola vez, titular)

Hay que hacerla en una computadora de confianza. Ninguno de estos valores se pega en el chat ni en el repositorio.

1. **Clave de recuperación** (privada, fuera de GitHub):
   - `brew install age`
   - `age-keygen -o repi-respaldos.age.key`. Muestra `Public key: age1…`.
   - Guardá el **contenido completo** del archivo `repi-respaldos.age.key` en tu gestor de contraseñas, más una segunda copia fuera de línea: impresa, o en el SSD en una carpeta **distinta** de `Backups/`.
   - Sin esta clave, los respaldos no se pueden abrir: nadie puede recuperarla, tampoco GitHub ni Claude.
2. **Clave pública en GitHub:**
   - Repositorio → Settings → Secrets and variables → Actions → **Variables** → New repository variable.
   - Nombre: `REPI_BACKUP_AGE_RECIPIENTS`. Valor: la línea `age1…`.
   - Se pueden poner varias claves separadas por coma, por ejemplo una de reserva.
3. **Contraseña del rol de sólo lectura:**
   - `openssl rand -hex 24`
   - En Supabase → SQL Editor: `alter role repi_backup with password '<esa contraseña>';`
4. **Conexión en GitHub:**
   - Settings → Secrets and variables → Actions → **Secrets** → New repository secret.
   - Nombre: `REPI_BACKUP_DATABASE_URL`.
   - Valor: `postgresql://repi_backup.qiamewdridgdvsyysmog:<contraseña>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`
5. **Primera ejecución:** Actions → Respaldo → Run workflow (motivo: «primera prueba»). Si termina en verde, el respaldo está publicado y verificado, y el cronograma diario queda habilitado.
6. **Prueba de tu clave**, recomendada una vez y después cada tanto. Desde el clon del repositorio, en `apps/web`:
   ```bash
   ./scripts/operations/restore-from-release.sh último ~/ruta/repi-respaldos.age.key --sin-base
   ```
   Tiene que terminar en «Respaldo íntegro: … base SHA-256 …», con el mismo hash que figura en las notas del release.

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

- **Secretos en GitHub:** sólo `REPI_BACKUP_DATABASE_URL`, de un rol de sólo lectura. La variable `REPI_BACKUP_AGE_RECIPIENTS` es pública por naturaleza. Storage no necesita ningún secreto.
- **Quién lee los secretos:** sólo el job de respaldo. El job de PR no los recibe y la autoprueba usa datos de demostración.
- **Logs:** nombres de tabla, cantidades y hashes. Las URL de conexión se ocultan en los errores y GitHub enmascara los secretos.
- **Rotar la clave age:**
  1. Agregar la clave nueva a `REPI_BACKUP_AGE_RECIPIENTS`.
  2. Esperar un respaldo.
  3. Quitar la vieja.
  4. Los respaldos anteriores siguen abriéndose con la clave vieja: no la borres hasta que venzan por retención (unos 4 meses).
- **Revocar el acceso:**
  - `alter role repi_backup nologin;` o cambiar la contraseña.
  - Quitar el bloque OIDC de la Edge Function corta la lectura de Storage.
- **Tamaño:** hoy unos 2–3 MB cifrados (26 MB de base, un archivo de Storage). GitHub admite archivos de hasta 2 GB por release; los releases no consumen minutos ni el almacenamiento de Actions.
