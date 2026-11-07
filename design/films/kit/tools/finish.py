"""Master → audio a −14 LUFS / −1 dBTP (loudnorm en dos pasadas) + versión web (H.264, faststart) + póster WebP.
Uso: finish.py <master.mp4> <salida_web.mp4> <poster.webp> <segundo_del_poster>"""
import sys, subprocess, json, re
src, web, poster, at = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
def run(*a): return subprocess.run(a, capture_output=True, text=True)
m = run("ffmpeg", "-hide_banner", "-nostats", "-i", src, "-af", "loudnorm=I=-14.6:TP=-2.5:LRA=11:print_format=json", "-f", "null", "-").stderr
j = json.loads(m[m.rindex("{"):m.rindex("}") + 1])
af = (f"loudnorm=I=-14.6:TP=-2.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
      f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,aresample=48000")
norm = src.replace(".mp4", "-norm.mp4")
r = run("ffmpeg", "-v", "error", "-y", "-i", src, "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "256k", "-ar", "48000", norm)
assert r.returncode == 0, r.stderr
part = web[:-4] + ".part.mp4"  # se renombra al final: un corte a mitad no deja un archivo web roto
r = run("ffmpeg", "-v", "error", "-y", "-i", norm, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-maxrate", "3M", "-bufsize", "6M",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-c:a", "copy", part)  # audio ya normalizado: recodificar AAC sube el pico
assert r.returncode == 0, r.stderr
r = run("ffmpeg", "-v", "error", "-y", "-ss", at, "-i", norm, "-frames:v", "1", "-vf", "scale=1280:-2", "-c:v", "libwebp", "-quality", "80", poster)
assert r.returncode == 0, r.stderr
import os; os.replace(part, web)
for f in (norm, web):
    out = run("ffmpeg", "-hide_banner", "-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-").stderr
    I = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1]; TP = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", out)[-1]
    size = int(run("stat", "-c", "%s", f).stdout) / 1e6
    print(f.split("/")[-1], f"I={I} LUFS  TP={TP} dBTP  {size:.1f} MB")
