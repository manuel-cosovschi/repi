# Video «REPI, empresa de tecnología deportiva» (aliados e inversores)

> **Superado (D208).** Reemplazado por el film «REPI · Tecnología para el entrenamiento» de Experience 3.0, sin voz (`design/films/aliados/`, licencias en `marketing/videos/LICENCIAS.md`). Se conserva como antecedente; no regenerar con locución.

Publicado en `/conoce` (perfil Aliados y «Mirá cómo funciona»): `apps/web/public/conoce/videos/perfil-aliados.mp4`, 0:59, 720×1280.

- **Contenido:** escenas de marca (Barlow / Barlow Condensed, navy y cian) y grabaciones reales de la demo guiada (datos ficticios). Subtítulos en pantalla con el texto exacto de la locución.
- **Afirmaciones:** sin cifras, clientes ni testimonios inventados. Smart Center sólo como lugar donde funciona; logo autorizado por el gimnasio.
- **Voz:** ElevenLabs, voz predeterminada «Eric» (multilingüe, español neutro). El plan gratuito no permite voces de la biblioteca por API. Con un plan pago se puede regenerar con una voz argentina, cambiando sólo el `voice_id` (ver `tts.py`).

## Regenerar

1. Build local de la app y `next start` en el puerto 3000 (sirve fuentes, logo y clips).
2. `python3 -I marketing/videos/aliados/tts.py <carpeta> [voice_id]`. Genera una pista por escena y `durations.json`. La clave va en `~/.repi-secrets/elevenlabs.key`.
3. Copiar `script.json` y `film.html` a esa carpeta y correr `node marketing/videos/aliados/rec-film.mjs <carpeta>`, desde `apps/web`.
   - Graba la composición con el screencast de Chrome, sincroniza cada escena con su pista (más 0,45 s de pausa) y normaliza el volumen.
   - Deja `perfil-aliados.mp4` en la carpeta.
4. Póster: un cuadro a los 3 s, en WebP de 540 px.
