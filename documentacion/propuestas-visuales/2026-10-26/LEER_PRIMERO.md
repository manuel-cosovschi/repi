# Repi — Laboratorio visual

26/10/2026. Propuestas para elegir tipografía, íconos internos, navegación y transición. Se conservan la paleta, el wordmark y el ícono de app existentes. Ninguna propuesta está aprobada y no se modificó el código productivo.

Abrí `index.html` en un navegador. Todos los recursos de la interfaz están incluidos localmente. En esta sesión también está disponible en http://127.0.0.1:8767/ mientras el servidor local siga activo. Para transportarlo, conservá la carpeta completa o descomprimí su ZIP.

## Cómo elegir

1. En **Comparar las 8**, elegí una dirección y tocá “Probar esta opción”.
2. En **Probar en Repi**, cambiá cualquiera de los cuatro selectores. No tenés que elegir un paquete cerrado.
3. Tocá las pestañas del teléfono. Hay cinco pantallas de ejemplo: Inicio, Entrenar, Progreso, Club y Chat.
4. Probá el movimiento con “Reproducir transición”. La cámara lenta sólo ayuda a comparar; no es la velocidad de producción.
5. El selector “Gym Norte” abre una hoja para probar el cambio de espacio; el avatar abre el perfil.
6. En **Tipografías** e **Íconos**, compará todas las alternativas con el mismo contenido.
7. Cuando elijas, usá **Copiar prompt** o **Descargar selección .md**. El texto identifica exactamente fuente, íconos, barra y transición elegidos.

Las capturas son referencias estáticas. Para juzgar la animación hay que usar el comparador. Si el sistema tiene activado “Reducir movimiento”, las animaciones se omiten deliberadamente.

## Las ocho direcciones

| Opción | Nombre | Tipografía | Íconos | Barra | Transición |
|---|---|---|---|---|---|
| A | Social fluida | DM Sans | Phosphor Regular | Cristal flotante | Deslizamiento completo, 240 ms |
| B | Precisión amable | Manrope | Lucide | Cápsula cian | Deslizamiento corto, 200 ms |
| C | Cercana | Plus Jakarta Sans | Phosphor Duotone | Segmentos suaves | Fundido, 160 ms |
| D | Geométrica | Outfit | Tabler | Cinco islas | Elevación, 200 ms |
| E | Digital | Sora | Phosphor Regular | Segmentos suaves | Profundidad, 220 ms |
| F | Carácter | Space Grotesk + DM Sans | Phosphor Bold | Entrenar al centro | Deslizamiento corto, 200 ms |
| G | Atlética | Barlow Condensed + Barlow | Phosphor Bold | Cristal flotante | Fundido, 160 ms |
| H | Esencial | Geist | Heroicons Outline/Solid | Barra integrada | Inmediato |

Además se puede probar Phosphor Fill y la tipografía actual Inter Tight como referencia. Son 8 combinaciones de partida, 8 propuestas tipográficas más la actual, 7 estilos de íconos, 6 barras y 6 transiciones intercambiables.

Mi recomendación inicial para comparar: **A** por tu referencia de Instagram, **G** por la dirección atlética de Gymshark y **B** por equilibrio para el uso diario. Es criterio de diseño, no una selección tomada por vos.

## Referencias que aportaste

- Video de las 15:50:28: Gymshark. Se observan títulos condensados en mayúsculas, jerarquía deportiva, íconos de contorno y barra flotante compacta. No se identificó ni se afirma la fuente exacta; Barlow Condensed es una alternativa interpretativa.
- Video de las 15:48:27: Instagram. Se observan navegación inferior en cápsula, indicador activo interior y cambios de sección. Se interpreta la dirección visual y el movimiento; no se copia su identidad ni se afirma usar sus componentes internos.
- `referencias/contacto_A.jpg` y `contacto_B.jpg` permiten revisar fotogramas de los videos. El centro de control del final del video A no se tomó como interfaz de Repi.

## Alcance de estas pantallas

Prototipo visual con datos ficticios y algunas interacciones locales. No tiene backend, autenticación, envío real de mensajes, registro real de entrenamiento ni publicación social. No reemplaza los requisitos de privacidad, permisos, accesos y comunidad.

La navegación de muestra reúne cinco destinos y deja Perfil en el avatar. Es una alternativa de arquitectura de información para evaluar: Claude Code debe conservar todas las funciones Gym/Club y los accesos existentes al integrar una selección, aunque no aparezcan en la muestra.

## Archivos útiles

- `index.html`: comparador.
- `HANDOFF_CLAUDE_CODE.md`: reglas para trasladar una selección.
- `capturas/`: 24 vistas estáticas, con Inicio, Progreso y Club para cada dirección; más vistas de verificación.
- `assets/`: fuentes, íconos SVG y copias de los PNG de marca.
- `licencias/`: licencias originales de fuentes e íconos.
- `ASSETS_MANIFEST.json`: procedencia y hashes de recursos descargados.
- `VERIFICACION.json`: comprobaciones del comparador.

Las fuentes provienen de Google Fonts; los íconos de Phosphor, Lucide, Tabler y Heroicons, con sus licencias incluidas. El laboratorio carga más alternativas que las necesarias para la aplicación final: en producción sólo debe incluirse la selección elegida.
