#!/usr/bin/env bash
# D190: recuperar un respaldo publicado en GitHub Releases (procedimiento completo en docs/RESPALDOS.md).
# Nunca restaura sobre producción: restore.ts sólo acepta repi_restore_check en localhost.
#
#   restore-from-release.sh <etiqueta | último> <clave privada age> [--sin-base]
#   restore-from-release.sh --archivo <respaldo.tar.gz.age> <clave privada age> [--sin-base]
#
#   - Descarga con `gh` (sesión de GitHub con acceso al repositorio), o usa un archivo ya bajado desde la página del release.
#   - Comprueba el SHA-256 publicado, descifra con la clave del titular y recalcula el hash de cada archivo del manifiesto.
#   - Sin --sin-base: restaura en repi_restore_check (RESTORE_DATABASE_URL) y comprueba filas, claves foráneas y restricciones.
#   - Con --sin-base: sólo prueba la clave y el contenido; no necesita PostgreSQL.
# Lo descifrado queda en ~/.repi-secrets/restore/<carpeta nueva> (0700). Borralo cuando termines.
set -euo pipefail
umask 077
here="$(cd "$(dirname "$0")" && pwd)"
repo="${REPI_BACKUP_REPO:-manuel-cosovschi/repi}"
die() { echo "restore-from-release: $*" >&2; exit 1; }

file="" tag=""
if [[ "${1:-}" == "--archivo" ]]; then file="${2:?archivo}"; shift 2; else tag="${1:?etiqueta o «último»}"; shift; fi
identity="${1:?clave privada age}"; shift
[[ "${1:-}" == "--sin-base" ]] && export REPI_RESTORE_SKIP_DB=1
[[ -f "$identity" ]] || die "no encuentro la clave privada."
for c in age tar gzip; do command -v "$c" >/dev/null || die "falta «$c» (macOS: brew install age)."; done

base="${REPI_RESTORE_DIR:-$HOME/.repi-secrets/restore}"
mkdir -p "$base"; chmod 700 "$base"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -n "$tag" ]]; then
  command -v gh >/dev/null || die "falta gh (o bajá el archivo desde la página del release y usá --archivo)."
  if [[ "$tag" == "último" || "$tag" == "ultimo" || "$tag" == "latest" ]]; then
    tag="$(gh api "repos/$repo/releases?per_page=100" --jq '[.[] | select(.draft == false and (.tag_name | test("^backup-[0-9]{8}-[0-9]{6}-[0-9]+$")) and (.body // "" | contains("<!-- repi-backup:verified -->")))] | sort_by(.created_at) | last | .tag_name')"
    [[ -n "$tag" && "$tag" != "null" ]] || die "no hay respaldos verificados publicados."
  fi
  dl="$base/$tag-$stamp-descarga"
  mkdir -p "$dl"
  gh release download "$tag" -R "$repo" -p '*.tar.gz.age' -p '*.tar.gz.age.sha256' -D "$dl"
  file="$(ls "$dl"/*.tar.gz.age | head -1)"
  echo "Descargado $tag."
fi
[[ -f "$file" ]] || die "no encuentro el archivo cifrado."
[[ -f "$file.sha256" ]] || echo "Aviso: no está el .sha256 junto al archivo; se confía en la autenticación de age y en el manifiesto." >&2
work="$base/$(basename "$file" .tar.gz.age)-$stamp"
"$here/backup-ci.sh" verify "$file" "$identity" "$work"
echo "Contenido descifrado en: $work"
