#!/usr/bin/env bash
# Render de todos los films (o los indicados): master → control de cuadros en blanco → audio −14 LUFS / −1 dBTP →
# versión web H.264 + póster WebP. Uso: REPI_MEDIA_SRC=<medios> OUT=<carpeta de masters> render-all.sh [film ...]
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"; FILMS_DIR="$(dirname "$KIT")"
: "${REPI_MEDIA_SRC:?falta REPI_MEDIA_SRC}"; : "${OUT:?falta OUT}"; mkdir -p "$OUT/web"
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1
declare -A WEB=([brand]=film-marca [gimnasios]=perfil-gimnasios [entrenadores]=perfil-entrenadores [deportistas]=perfil-deportistas
  [deportistas-vertical]=perfil-deportistas-vertical [aliados]=perfil-aliados [intelligence]=f-intelligence
  [progreso]=f-progreso [altas]=f-altas [sala]=f-sala)
LIST=("$@"); [ ${#LIST[@]} -eq 0 ] && LIST=(brand gimnasios entrenadores deportistas deportistas-vertical aliados intelligence progreso altas sala)
for n in "${LIST[@]}"; do
  if [ -s "$OUT/web/${WEB[$n]}.mp4" ] && [ -z "${FORCE:-}" ]; then echo "== $n: ya está (FORCE=1 para rehacer)"; continue; fi
  python3 "$KIT/build.py" "$n"
  poster=$(cd "$KIT" && python3 -c "import importlib.util as u; s=u.spec_from_file_location('b','build.py'); b=u.module_from_spec(s); s.loader.exec_module(b); print(b.FILMS['$n'].get('poster', 1))")
  (cd "$FILMS_DIR/$n" && npx --yes hyperframes@0.8.193 render -q delivery --video-frame-format png -w 2 -o "$OUT/$n-master.mp4" --quiet >/dev/null 2>&1)
  echo "== $n: $(python3 -I "$KIT/tools/blank.py" "$OUT/$n-master.mp4")"
  python3 -I "$KIT/tools/finish.py" "$OUT/$n-master.mp4" "$OUT/web/${WEB[$n]}.mp4" "$OUT/web/${WEB[$n]}.webp" "$poster"
done
