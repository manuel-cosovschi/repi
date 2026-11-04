#!/usr/bin/env bash
# D190: empaquetado, cifrado y verificación de un respaldo de backup.ts. Lo usa .github/workflows/backup.yml y se puede
# correr igual en una computadora (pruebas). Nunca imprime datos ni claves: sólo cantidades, tamaños y hashes.
#
#   backup-ci.sh pack   <carpeta del respaldo> <carpeta de salida> <destinatarios age>   → <salida>/<nombre>.tar.gz.age
#   backup-ci.sh verify <archivo .age> <identidad age> <carpeta de trabajo> [informe.json] → descifra, comprueba y restaura
#
# pack cifra para los destinatarios del titular (clave privada fuera de GitHub) y para una clave EFÍMERA creada acá.
# Con esa efímera, el mismo job descifra el archivo ya cifrado y lo restaura en PostgreSQL descartable: así se prueba el
# archivo que se publica, no una copia anterior. La efímera nunca sale del job ni se guarda (ver docs/RESPALDOS.md).
set -euo pipefail
umask 077
here="$(cd "$(dirname "$0")" && pwd)"
web="$(cd "$here/../.." && pwd)"
die() { echo "backup-ci: $*" >&2; exit 1; }
# Linux trae sha256sum; macOS, shasum.
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }

check_recipients() {
  local file="$1" n=0
  [[ -s "$file" ]] || die "no hay destinatarios age."
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"; line="${line//[[:space:]]/}"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^age1[02-9ac-hj-np-z]{58}$ ]] || die "destinatario age inválido (se espera una clave pública age1…)."
    n=$((n + 1))
  done < "$file"
  (( n > 0 )) || die "no hay destinatarios age."
  echo "$n"
}

case "${1:-}" in
  pack)
    src="${2:?carpeta}"; out="${3:?salida}"; recipients="${4:?destinatarios}"
    [[ -f "$src/manifest.json" ]] || die "el respaldo no tiene manifest.json (incompleto)."
    grep -q '"status": "complete"' "$src/manifest.json" || die "el manifiesto no está completo."
    count="$(check_recipients "$recipients")"
    mkdir -p "$out"
    name="repi-backup-$(basename "$src")"
    eph="$out/.ephemeral.key"
    age-keygen -o "$eph" 2>/dev/null
    { grep -v '^#' "$recipients"; age-keygen -y "$eph"; } | sed 's/#.*//; /^[[:space:]]*$/d' > "$out/.recipients"
    # tar reproducible: orden, dueños y fechas fijos; el contenido ya trae sus hashes en manifest.json.
    tar -C "$src" --sort=name --owner=0 --group=0 --numeric-owner --mtime='@0' -cf - . | gzip -n -9 | age -R "$out/.recipients" -o "$out/$name.tar.gz.age"
    rm -f "$out/.recipients"
    (cd "$out" && sha256 "$name.tar.gz.age" > "$name.tar.gz.age.sha256")
    echo "Cifrado para $count destinatario(s) del titular + 1 efímero del job: $name.tar.gz.age ($(stat -c %s "$out/$name.tar.gz.age" 2>/dev/null || stat -f %z "$out/$name.tar.gz.age") bytes)"
    ;;
  verify)
    file="${2:?archivo}"; identity="${3:?identidad}"; work="${4:?trabajo}"; report="${5:-}"
    [[ -f "$identity" ]] || die "falta la identidad age."
    if [[ -f "$file.sha256" ]]; then (cd "$(dirname "$file")" && [[ "$(sha256 "$(basename "$file")" | cut -d' ' -f1)" == "$(cut -d' ' -f1 "$(basename "$file").sha256")" ]]) || die "el archivo cifrado no coincide con su SHA-256."; fi
    [[ ! -e "$work" ]] || die "la carpeta de trabajo ya existe: usá una nueva."
    mkdir -p "$work"
    # Primero se descifra entero: age autentica cada bloque, así que una clave equivocada o un byte alterado cortan acá.
    age -d -i "$identity" -o "$work/.payload.tar.gz" "$file" 2>/dev/null || { rm -rf "$work"; die "no se pudo descifrar: la clave no corresponde a este respaldo o el archivo está dañado."; }
    gzip -t "$work/.payload.tar.gz" || { rm -rf "$work"; die "el contenido descifrado está dañado."; }
    tar -C "$work" -xzf "$work/.payload.tar.gz" --no-same-owner --no-same-permissions
    rm -f "$work/.payload.tar.gz"
    [[ -f "$work/manifest.json" ]] || die "el archivo descifrado no trae manifest.json."
    if [[ "${REPI_RESTORE_SKIP_DB:-}" == "1" ]]; then
      # Sólo comprobar la clave y el contenido (sin PostgreSQL): hashes de cada archivo contra el manifiesto.
      (cd "$web" && pnpm -s exec tsx scripts/operations/restore.ts "$work" --solo-hashes)
      exit 0
    fi
    # restore.ts recalcula cada hash contra el manifiesto, restaura en repi_restore_check y comprueba filas e integridad.
    (cd "$web" && pnpm -s exec tsx scripts/operations/restore.ts "$work" ${report:+--report="$report"})
    ;;
  *) die "uso: backup-ci.sh pack|verify …" ;;
esac
