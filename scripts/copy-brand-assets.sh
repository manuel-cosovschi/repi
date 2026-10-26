#!/bin/sh
# Copia byte a byte los PNG aprobados del handoff a la app (DEC-01: sin vector verificado).
set -e
SRC="handoff/fuentes/extraido/repi-app-mobile-prototype/project/assets"
DST="apps/web/public/brand"
mkdir -p "$DST"
cp "$SRC/motion/wm_full.png" "$DST/wm_full.png"
cp "$SRC/repi_icon.png" "$DST/repi_icon.png"
shasum -a 256 "$SRC/motion/wm_full.png" "$DST/wm_full.png" "$SRC/repi_icon.png" "$DST/repi_icon.png"
