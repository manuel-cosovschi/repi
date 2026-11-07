# REPI · Cinematic Motion Studio — SPEC común (Experience 3.0)

Films nuevos para `/conoce`. Música instrumental con licencia comercial, sin voz, sin locución. Se entienden sin sonido.
Cada film es un proyecto HyperFrames en `design/films/<film>/`, generado por `design/films/kit/build.py` desde su guion.

```text
GOAL:    entender qué hace REPI en segundos y querer probarlo; terminar en «repiclub.com/conoce».
OUTPUT:  HyperFrames 1920×1080, 30 fps (vertical 1080×1920 donde se indica).
LOOK:    suelo = la sala del gimnasio vista desde arriba (no un vacío):
         - piso #0F1620 con grilla de 2 m en #1F2B3B y zonas con borde #4A5D78;
         - tinta #F8FAFC y secundaria #9AA8BA;
         - acento cian #00D1FF sólo en el dato vivo (uno por plano) y turquesa #5DE6D8 para el equipo y las respuestas;
         - títulos Barlow Condensed 700 en mayúsculas, 104–128 px, tracking −2 %, una o dos líneas, tamaño 9–12 % del alto;
         - frases en Barlow 600 de 40–48 px; nunca menos de 30 px a 1080.
         Producto: grabaciones y capturas reales de la demo (datos ficticios), planas (nunca inclinadas en 3D),
         a 1,6–2× en la acción. Profundidad: sombra 0 30 60 de 0,55 de opacidad; sin brillos, partículas ni vidrio.
OBJECTS: el teléfono con la app real; el plano de la sala (zonas: recepción con QR, peso libre, máquinas, box,
         oficina); personas como puntos (socio cian, equipo turquesa); la hoja de rutina en papel (crema #F4F1EA,
         tinta navy); el wordmark original (wm_full.png con el punto cian aparte).
MOTION:  entrada expo.out 0,6–0,9 s; cámara power2.inOut 0,5 s; salida power3.in 0,3 s; palabras con 0,08 s
         entre sí; puntos con resorte back.out(1.6). Título asentado = quieto. Algo nuevo cada 2–4 s.
TRANSITIONS (3–5 por film, con causa): el punto cian que crece y se vuelve el suelo siguiente (objeto → mundo),
         paneo rápido (whip) entre zonas de la sala, carry-across del número de la serie, dip cut en el golpe de
         la música, iris desde el toque.
SOUND:   - Base: la pista indicada en cada guion (LICENCIAS.md).
         - Efectos de HyperFrames (Pixabay): whoosh en cortes con movimiento (dos tomas alternadas), pop en
           números que aterrizan, impact-bass en la marca, riser una sola vez antes del pago.
         - Mezcla a −14 LUFS integrados y −1 dBTP.
BANNED:  vacío negro con elementos chicos en el medio; glow; partículas; vidrio; tres tarjetas en fila; título sobre
         captura atenuada; logo en una esquina; todo entrando con fade y subida; títulos que se mueven mientras se
         leen; métricas, clientes o testimonios inventados; voz o TTS.
QA:      snapshot de cada beat; tira de cortes; lectura a 360 px; audio medido (no escuchado) con
         `hyperframes audio`; check sin errores.
```

## Pistas (masters fuera de Git)

| Film | Pista | Tramo | Por qué |
| --- | --- | --- | --- |
| 01 Marca (48 s) | Kevin MacLeod · Heroic Age | 30,0 → 78,0 s | 14 s de tensión, sube en 44 s y cae en 48 s: el logo entra en el golpe |
| 02 Gimnasios (~80 s) | Kevin MacLeod · Five Armies | 68 → 148 s | Calma (problema) → construcción (solución) → clímax (cierre) |
| 03 Entrenadores (~60 s) | Kevin MacLeod · Exciting Trailer | 0 → 60 s | Tráiler con pulso, pico en 33–43 s |
| 04 Deportistas (~45 s, también vertical) | Kevin MacLeod · Volatile Reaction | 24 → 69 s | Electrónica de alta energía (152 bpm) |
| 05 Aliados (~80 s) | Kevin MacLeod · Rising Game | 25 → 105 s | Crecimiento sostenido hasta un final grande |
| 06 Training Intelligence (~40 s) | Kevin MacLeod · Volatile Reaction | 120 → 160 s | Segundo ascenso, tecnológico |
