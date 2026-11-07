"""Busca cuadros con el teléfono en blanco: una columna de ≥80 px contiguos casi blancos en el cuadro reducido a 192×N."""
import sys, subprocess, numpy as np
f = sys.argv[1]
info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip().split(",")
w0, h0 = int(info[0]), int(info[1]); w = 192; h = int(h0 * w / w0) // 2 * 2
need = int(80 * h / 108)
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
bad = []
for i, im in enumerate(fr):
    white = (im.min(axis=2) > 245)
    best = 0
    for x in range(w):
        col = white[:, x]; run = m = 0
        for v in col:
            run = run + 1 if v else 0; m = max(m, run)
        best = max(best, m)
        if best >= need: break
    if best >= need: bad.append(round(i / 30, 2))
print(len(fr), "cuadros;", len(bad), "en blanco:", bad[:80])
