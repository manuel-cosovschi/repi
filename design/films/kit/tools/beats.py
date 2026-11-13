"""Pulso de un tramo de la pista, para poner los cortes en el golpe (medido, no escuchado).
Uso: beats.py <pista.mp3> <inicio_s> <duración_s>
Imprime el tempo estimado, la fase del primer pulso dentro del tramo, la grilla (segundos del film) y la energía por pulso
(los picos marcan los golpes fuertes, donde conviene el logo o un corte de acto)."""
import sys, subprocess, numpy as np
f, t0, dur = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]); sr = 22050
raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t0), "-t", str(dur), "-i", f, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
n, h = 1024, 256; win = np.hanning(n)
F = np.array([np.abs(np.fft.rfft(x[i:i + n] * win)) for i in range(0, len(x) - n, h)])
flux = np.maximum(0, np.diff(np.log1p(50 * F), axis=0)).sum(1); flux = (flux - flux.mean()) / (flux.std() + 1e-9)
fps = sr / h
best = None
for bpm in np.arange(60, 190, 0.25):
    per = 60 / bpm * fps
    for ph in np.linspace(0, per, 24, endpoint=False):
        idx = np.round(np.arange(ph, len(flux) - 1, per)).astype(int)
        sc = flux[idx].mean()
        if best is None or sc > best[0]: best = (sc, bpm, ph / fps)
sc, bpm, ph = best
beat = 60 / bpm
print(f"{f.split('/')[-1]} tramo {t0}+{dur}s  bpm≈{bpm:.2f}  pulso={beat:.4f}s  fase={ph:.3f}s  puntaje={sc:.2f}")
grid = np.arange(ph, dur, beat)
hop = int(sr * beat)
e = [float(np.sqrt(np.mean(x[int(t * sr):int(t * sr) + hop] ** 2))) for t in grid if int(t * sr) + hop <= len(x)]
m = max(e)
on = [float(flux[max(0, int(t * fps) - 2):int(t * fps) + 3].max()) for t in grid[:len(e)]]
for i, (t, v, o) in enumerate(zip(grid, e, on)):
    print(f"{i:3d} {t:7.3f}s  {'#' * int(v / m * 40):40s} golpe={o:5.1f}")
