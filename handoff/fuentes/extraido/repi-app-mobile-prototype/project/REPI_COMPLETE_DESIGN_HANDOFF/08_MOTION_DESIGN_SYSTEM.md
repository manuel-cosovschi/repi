# 08 · Sistema de motion

## Tokens
- **Easing:** std `cubic-bezier(.2,0,0,1)` · out `cubic-bezier(.05,.7,.1,1)` · in `cubic-bezier(.55,0,1,.45)` · spring `cubic-bezier(.34,1.56,.64,1)` · snap `cubic-bezier(.2,.9,.1,1)` (solo concepto 1b).
- **Duraciones:** micro 150–240 ms · componente 200–320 ms · pantalla 220–320 ms · contextual 420–700 ms · celebración 1000–1750 ms (no bloquea) · intro 2,6 s (solo primer inicio).
- **Desktop:** intensidad reducida (6 px, 220 ms); sin animación por fila de tabla; sin count-up en refresh.
- **Reduced motion:** `prefers-reduced-motion` → fades cortos o nada; damping 1 en 3D; regla global CSS que anula transiciones.
- **Firma de marca:** el punto cian (salto con aplastamiento) aparece en intro, check de fin de entrenamiento (órbita) y sticker de logro (caída). No usarlo decorativamente en todas las pantallas.
- **Implementación en prototipo:** Web Animations API + CSS transitions + three.js. Recomendado para producción: CSS para estados simples, Motion for React para pantalla/layout, WAAPI/Motion para coreografía de intro, three.js/R3F para el visor, Rive/Lottie solo si se decide un asset de logo animado.
- **Sin sonido ni háptica implementados** (especificados como opcionales).

## Catálogo
### AN-01 · Intro 1a · primer inicio
- **Estado:** Prototipo interactivo
- **Disparador:** App boot en Inicio, sin repi_intro_seen, sin reduced-motion
- **Inicio → fin:** Fondo #0B0F14, capas ocultas → Wordmark en encabezado (translate(-74.6px,-220px) scale(.2886)), UI visible
- **Timeline:** 0–170 punto aparece (scale 0→1); 170–560 anticipación (estira 0.9×1.12) y caída con gravedad; 560 impacto squash 1.35×0.65; 560–940 la r crece por clip-path desde abajo; 600–1100 fondo del ícono entra (scale .92→1); 860–1400 punto salta en arco a su lugar con squash al aterrizar; 1600–1950 fondo del ícono sale (scale 1.08); 1600–2050 la r del ícono se transforma en la r del wordmark; 1750+70·i letras e/p/i entran (translateX -18px); 1700–2160 punto salta a la i; 2150–2670 wordmark vuela al encabezado; 2200–2580 overlay se desvanece; 2300+60·i bloques de Inicio suben 14px; botón Saltar 200–2300
- **Duración:** ≈2670 ms · **Easing:** Por keyframe: std / inn (caída) / out (aterrizajes y vuelo)
- **Propiedades:** transform, opacity, clip-path
- **Interrupción:** Saltar → finish() de todas las animaciones; no bloquea navegación · **Reduced motion:** AN-03
- **Tecnología:** Web Animations API (prototipo). Producción: Motion for React o WAAPI; Rive opcional para el logo
- **Fuente existente:** REPI App Alumno v3/v2 playIntro(); REPI Motion Intro (1a)

### AN-02 · Intro · inicio regular
- **Estado:** Prototipo interactivo
- **Disparador:** App boot con repi_intro_seen
- **Inicio → fin:** Ícono visible → Wordmark en encabezado
- **Timeline:** 0–220 punto salta 8px; 200–420 ícono sale (scale .92, fade); 240 wordmark en header; 260–520 overlay fade; UI stagger 30ms
- **Duración:** ≈520 ms · **Easing:** cubic-bezier(.2,0,0,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Igual a AN-01 · **Reduced motion:** AN-03
- **Tecnología:** WAAPI
- **Fuente existente:** playIntro("quick")

### AN-03 · Intro · movimiento reducido
- **Estado:** Prototipo interactivo
- **Disparador:** prefers-reduced-motion
- **Inicio → fin:** — → —
- **Timeline:** 250–450 crossfade ícono→wordmark; 300–500 overlay fade; UI fade 200ms
- **Duración:** ≈500 ms · **Easing:** linear
- **Propiedades:** opacity
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** playIntro("reduced")

### AN-04 · Intro concepto 1b · La repetición
- **Estado:** Concepto futuro
- **Disparador:** Revisión
- **Inicio → fin:** — → —
- **Timeline:** Tres pulsos de clip-path revelan la r (200–900), marcadores se encienden (spring), punto como 4ª rep (900–1280), "rep" del ícono (1250–1670), letras a ritmo 90ms, vuelo 2200–2720
- **Duración:** ≈2720 ms · **Easing:** snap cubic-bezier(.2,.9,.1,1) + spring
- **Propiedades:** clip-path, transform
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** REPI Motion Intro.dc.html

### AN-05 · Intro concepto 1c · Símbolo vivo
- **Estado:** Concepto futuro
- **Disparador:** Revisión
- **Inicio → fin:** — → —
- **Timeline:** Ícono desde translateZ(-260) con rotación, reflejo cruzando, inclinación táctil, punto en capa Z, giro de canto rotateY(90°) y wordmark entra girando
- **Duración:** ≈2670 ms · **Easing:** out / inn
- **Propiedades:** transform 3D, opacity
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** WAAPI + CSS 3D
- **Fuente existente:** REPI Motion Intro.dc.html

### AN-06 · Entrada escalonada de Inicio
- **Estado:** Prototipo interactivo
- **Disparador:** Fin de intro
- **Inicio → fin:** Bloques opacity 0, +14px → Visibles
- **Timeline:** Hijos del contenedor Inicio con delay 60ms (30ms en quick)
- **Duración:** 420 ms c/u (200 reducido) · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Sí · **Reduced motion:** Solo fade
- **Tecnología:** WAAPI
- **Fuente existente:** enterHome()

### AN-07 · Transición entre pantallas (móvil)
- **Estado:** Prototipo interactivo
- **Disparador:** Cambio de pantalla
- **Inicio → fin:** opacity 0 +8px (mismo nivel) / ±40px X (profundidad) → Visible
- **Timeline:** Mismo nivel: rise 8px; más profundo: entra desde la derecha; volver: desde la izquierda
- **Duración:** 240 ms (nivel) / 320 ms (profundidad) · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Sí · **Reduced motion:** Fade 150 ms
- **Tecnología:** WAAPI / Motion layout
- **Fuente existente:** enterScreen()

### AN-08 · Paso de Mi cuerpo
- **Estado:** Prototipo interactivo
- **Disparador:** Cambio de paso
- **Inicio → fin:** +20px X, opacity 0 → Visible
- **Timeline:** Hijos con stagger 35 ms
- **Duración:** 260 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Sí · **Reduced motion:** Ninguna
- **Tecnología:** WAAPI
- **Fuente existente:** enterBodyStep()

### AN-09 · Completar serie
- **Estado:** Prototipo interactivo
- **Disparador:** Tocar "Completar serie"
- **Inicio → fin:** Fila sin check → Fila con check cian
- **Timeline:** Pulso box-shadow 0→8px; check scale .6→1.18→1
- **Duración:** 420 ms pulso / 240 ms check · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** box-shadow, transform
- **Interrupción:** No bloquea el siguiente registro · **Reduced motion:** Sin pulso
- **Tecnología:** WAAPI + CSS
- **Fuente existente:** pulseSet()

### AN-10 · Temporizador de descanso circular
- **Estado:** Prototipo interactivo
- **Disparador:** Serie completada con más series
- **Inicio → fin:** Anillo vacío → Anillo lleno
- **Timeline:** stroke-dashoffset con transition 1s linear, valor desde restEnd − now (tick 250 ms)
- **Duración:** Duración del descanso · **Easing:** linear
- **Propiedades:** stroke-dashoffset
- **Interrupción:** Pausar/+30s/saltar · **Reduced motion:** Sigue igual (informativo)
- **Tecnología:** SVG + estado por timestamp
- **Fuente existente:** REPI App Alumno v2/v3

### AN-11 · Celebración de entrenamiento completado
- **Estado:** Prototipo interactivo
- **Disparador:** Entrar a Resumen
- **Inicio → fin:** Anillo vacío → Check + métricas
- **Timeline:** 100–800 anillo se dibuja; 100–860 punto cian orbita el anillo; 780–1140 check scale 0→1 spring; 400+70·i título; 600+70·i métricas
- **Duración:** ≈1200 ms · **Easing:** std / spring / out
- **Propiedades:** stroke-dashoffset, transform, opacity
- **Interrupción:** No bloquea botones · **Reduced motion:** Sin animación
- **Tecnología:** WAAPI
- **Fuente existente:** celebrate()

### AN-12 · Récord personal
- **Estado:** Prototipo interactivo
- **Disparador:** PR validado en sesión
- **Inicio → fin:** Tarjeta oculta → Tarjeta + partículas
- **Timeline:** 950 tarjeta scale .94→1 spring; 1100 valor sube; 1050 10 partículas radiales cian/turquesa/ámbar 700 ms
- **Duración:** ≈1750 ms · **Easing:** spring / out
- **Propiedades:** transform, opacity
- **Interrupción:** Sí · **Reduced motion:** Sin partículas
- **Tecnología:** WAAPI (prod: canvas/Lottie opcional)
- **Fuente existente:** celebrate()

### AN-13 · Gráfico de fuerza (dibujo de línea)
- **Estado:** Prototipo interactivo
- **Disparador:** Entrar a Progreso o cambiar rango/ejercicio
- **Inicio → fin:** dashoffset 1 → 0
- **Timeline:** Línea 700 ms; área fade 250+500; tooltip pop 600+260 spring
- **Duración:** ≈860 ms · **Easing:** std / spring
- **Propiedades:** stroke-dashoffset, opacity, scale
- **Interrupción:** Sí · **Reduced motion:** Sin animación
- **Tecnología:** WAAPI / SVG
- **Fuente existente:** animProg()

### AN-14 · Barras de volumen
- **Estado:** Prototipo interactivo
- **Disparador:** Pestaña Volumen
- **Inicio → fin:** scaleY 0 → 1
- **Timeline:** Stagger 45 ms
- **Duración:** 480 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform
- **Interrupción:** Sí · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** animProg()

### AN-15 · Grilla de constancia
- **Estado:** Prototipo interactivo
- **Disparador:** Pestaña Constancia
- **Inicio → fin:** scale .6, opacity 0 → 1
- **Timeline:** Stagger 14 ms
- **Duración:** 260 ms · **Easing:** cubic-bezier(.34,1.56,.64,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Sí · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** animProg()

### AN-16 · Entrada del visor 3D
- **Estado:** Prototipo interactivo
- **Disparador:** Montar visor
- **Inicio → fin:** Canvas opacity 0, rot -1.1 rad, cámara z 7.2 → opacity 1, rot 0, z 4.4
- **Timeline:** Fade 450 ms; rotación y dolly amortiguados (damping 0.1 por frame)
- **Duración:** ≈1 s · **Easing:** cubic-bezier(.2,0,0,1)
- **Propiedades:** opacity, camera, rotation
- **Interrupción:** Interactivo de inmediato · **Reduced motion:** Sin rotación ni dolly (damping 1)
- **Tecnología:** three.js
- **Fuente existente:** initBody()

### AN-17 · Órbita, zoom y vistas del visor
- **Estado:** Prototipo interactivo
- **Disparador:** Arrastre / pinch / rueda / botones
- **Inicio → fin:** — → —
- **Timeline:** Interpolación rotT/zoomT con damping 0.14 (0.1 v2); snap de vistas con vuelta más corta
- **Duración:** Continuo · **Easing:** Exponencial (damping)
- **Propiedades:** rotation.y, camera.z, lookAt
- **Interrupción:** Sí · **Reduced motion:** Damping 1
- **Tecnología:** three.js + Pointer Events
- **Fuente existente:** REPI App Alumno v1–v3

### AN-18 · Panel de región
- **Estado:** Prototipo interactivo
- **Disparador:** Tocar región/chip
- **Inicio → fin:** +12px, opacity 0 → Visible
- **Timeline:** —
- **Duración:** 240 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Sí · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** componentDidUpdate

### AN-19 · Toast (móvil y desktop)
- **Estado:** Prototipo interactivo
- **Disparador:** Feedback
- **Inicio → fin:** -10/+10px, opacity 0 → Visible
- **Timeline:** Se oculta a 2,6–3,2 s
- **Duración:** 200 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** — · **Reduced motion:** Sin desplazamiento
- **Tecnología:** WAAPI
- **Fuente existente:** flash()

### AN-20 · Hoja inferior de comparación
- **Estado:** Prototipo interactivo
- **Disparador:** Abrir comparar
- **Inicio → fin:** translateY(100%) → 0
- **Timeline:** Fondo fade 200 ms
- **Duración:** 320 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Cerrar con Listo/fondo · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** componentDidUpdate

### AN-21 · Logro validado (sticker)
- **Estado:** Prototipo interactivo
- **Disparador:** Notificación de aprobación
- **Inicio → fin:** Tarjeta +16px, sticker scale .2 rot -40° → Visible
- **Timeline:** Tarjeta 320 ms; sticker 120+620 ms (overshoot 1.08, 6°); punto cae y aplasta 520+520 ms
- **Duración:** ≈1040 ms · **Easing:** out / std
- **Propiedades:** transform, opacity
- **Interrupción:** Cerrar · **Reduced motion:** Sin animación
- **Tecnología:** WAAPI
- **Fuente existente:** REPI App Alumno v3 componentDidUpdate

### AN-22 · Hojas de subida y notificaciones
- **Estado:** Prototipo interactivo
- **Disparador:** Abrir hoja
- **Inicio → fin:** translateY(100%) → 0
- **Timeline:** —
- **Duración:** 300 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform
- **Interrupción:** Sí · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** REPI App Alumno v3

### AN-23 · Entrada de pantalla desktop
- **Estado:** Prototipo interactivo
- **Disparador:** Cambio de pantalla/persona
- **Inicio → fin:** +6px, opacity 0 → Visible
- **Timeline:** Primeros 5–6 bloques, stagger 25–40 ms
- **Duración:** 220 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Sí · **Reduced motion:** Ninguna
- **Tecnología:** WAAPI
- **Fuente existente:** enter() en Gym/Coach/Admin

### AN-24 · Modal desktop
- **Estado:** Prototipo interactivo
- **Disparador:** Abrir modal
- **Inicio → fin:** +8px, scale .985, opacity 0 → Visible
- **Timeline:** —
- **Duración:** 200 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** transform, opacity
- **Interrupción:** Esc / fondo · **Reduced motion:** —
- **Tecnología:** WAAPI
- **Fuente existente:** componentDidUpdate

### AN-25 · Cambio de toggle/estado de chip
- **Estado:** Prototipo interactivo
- **Disparador:** Interacción
- **Inicio → fin:** — → —
- **Timeline:** CSS transition en background
- **Duración:** 150 ms · **Easing:** ease
- **Propiedades:** background
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** CSS
- **Fuente existente:** toggles móviles

### AN-26 · Barras de ancho (métricas desktop)
- **Estado:** Prototipo interactivo
- **Disparador:** Cambio de datos/métrica
- **Inicio → fin:** — → —
- **Timeline:** transition width
- **Duración:** 300–350 ms · **Easing:** cubic-bezier(.05,.7,.1,1)
- **Propiedades:** width
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** CSS
- **Fuente existente:** Sedes, tareas

### AN-27 · KPI count-up (no en cada refresh)
- **Estado:** Especificado, no diseñado
- **Disparador:** Primer montaje del dashboard
- **Inicio → fin:** — → —
- **Timeline:** —
- **Duración:** — · **Easing:** —
- **Propiedades:** —
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** Motion
- **Fuente existente:** —

### AN-28 · Rankings FLIP / reacciones Club / trofeo 3D
- **Estado:** Especificado, no diseñado
- **Disparador:** Repi Club
- **Inicio → fin:** — → —
- **Timeline:** —
- **Duración:** — · **Easing:** —
- **Propiedades:** —
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** Motion + three.js/Rive
- **Fuente existente:** —

### AN-29 · Estados de pago (procesando/confirmado/fallido)
- **Estado:** Especificado, no diseñado
- **Disparador:** Checkout
- **Inicio → fin:** — → —
- **Timeline:** —
- **Duración:** — · **Easing:** —
- **Propiedades:** —
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** —
- **Fuente existente:** —

### AN-30 · Mensajería (envío, audio, typing)
- **Estado:** Especificado, no diseñado
- **Disparador:** Chat
- **Inicio → fin:** — → —
- **Timeline:** —
- **Duración:** — · **Easing:** —
- **Propiedades:** —
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** —
- **Fuente existente:** —

### AN-31 · Sonido y háptica opcionales
- **Estado:** Especificado, no diseñado
- **Disparador:** Logros, intro
- **Inicio → fin:** — → —
- **Timeline:** —
- **Duración:** — · **Easing:** —
- **Propiedades:** —
- **Interrupción:** — · **Reduced motion:** —
- **Tecnología:** Web Vibration / Audio
- **Fuente existente:** —

## Reglas de la intro
- Primer inicio: completa (clave `repi_intro_seen` en localStorage). Siguientes: regular. Reduced-motion: fade.
- Solo si la app abre en Inicio; nunca durante un entrenamiento activo ni al volver de otra app.
- Saltable; nunca retrasa navegación (la UI ya está montada debajo).
- Reproducible desde Perfil › "Animación de inicio".
