# Locución del video de aliados con ElevenLabs (una pista por escena). La clave se lee de ~/.repi-secrets/elevenlabs.key
# (nunca del repositorio). Uso: python3 -I tts.py <carpeta de trabajo> [voice_id]
# Plan gratuito: sólo voces predeterminadas por API (se usó «Eric», cjVigY5qzO86Huf0OWal, multilingüe). Con plan pago se puede
# usar una voz argentina de la biblioteca (p. ej. «Javier», FrrTxu4nrplZwLlMy2kD) sin cambiar nada más.
import json, os, subprocess, sys, urllib.request
out_dir = sys.argv[1]; voice = sys.argv[2] if len(sys.argv) > 2 else "cjVigY5qzO86Huf0OWal"
key = open(os.path.expanduser("~/.repi-secrets/elevenlabs.key")).read().strip()
here = os.path.dirname(os.path.abspath(__file__))
durations = {}
for sc in json.load(open(os.path.join(here, "script.json"))):
    body = json.dumps({"text": sc["text"], "model_id": "eleven_multilingual_v2", "language_code": "es",
                       "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.2, "use_speaker_boost": True}}).encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128", data=body,
                                 headers={"xi-api-key": key, "content-type": "application/json", "accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120) as r:
        open(os.path.join(out_dir, f"{sc['id']}.mp3"), "wb").write(r.read())
    durations[sc["id"]] = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(out_dir, f"{sc['id']}.mp3")], capture_output=True, text=True).stdout)
json.dump(durations, open(os.path.join(out_dir, "durations.json"), "w"))
print(durations)
