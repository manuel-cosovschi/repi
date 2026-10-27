# Repi — Handoff de exploración visual

Este laboratorio responde a la corrección humana del 26/10/2026: conservar exactamente la paleta aprobada, el logo y el ícono de la app; ofrecer alternativas de tipografía interior, íconos interiores, barra y transiciones. Esa corrección permite explorar la tipografía de UI que el contrato anterior fijaba. No autoriza a cambiar el lettering del logo ni el resto del producto.

## Antes de integrar

Selección confirmada el 26/10/2026: **G · Atlética**. Leer [REPI_SELECCION_VISUAL.md](../../../REPI_SELECCION_VISUAL.md) y [motion.md](../../../motion.md) en la raíz de Repi. La espera de una selección ya está resuelta; aplicar la configuración G registrada allí. La opción B inicial y las capturas de otras variantes no son aprobaciones. El comparador no edita el proyecto productivo. Después de recibir la selección, adaptar el código activo y los documentos de diseño correspondientes; no reiniciar ni copiar la demo por encima de la aplicación.

Leer la configuración en `lab.js`: `FONTS`, `ICONS`, `NAVS`, `MOTIONS`, `PRESETS`. La exportación de la interfaz indica los cuatro valores exactos. `lab.css` demuestra proporciones y estados; las implementaciones finales deben usar los componentes/stack ya elegidos.

## Constantes que se conservan

| Uso | Valor |
|---|---|
| Navy fondo | #0B0F14 |
| Superficie navy | #1A2433 |
| Borde navy | #2D3B4F |
| Cian | #00D1FF |
| Turquesa | #5DE6D8 |
| Blanco | #F8FAFC |

Se copiaron sin modificar `wm_full.png` y `repi_icon.png` de los assets de Repi. El wordmark reproduce el componente existente: PNG blanco más el punto cian en la posición que ya define `Wordmark.tsx`; no se vuelve a escribir “repi” con ninguna fuente. Las copias y los assets de producto se comparan por hash en la verificación.

## Tipografía

La dirección elegida es **Barlow Condensed + Barlow** (G · Atlética). Las demás familias del laboratorio son alternativas descartadas para esta integración. Inter Tight aparece como comparación con la fuente declarada en el proyecto. No sustituir la tipografía de marca.

- El cuerpo permanece legible; Barlow Condensed se reserva a títulos grandes y no se usa para texto largo, chat, campos o tablas.
- Usar números tabulares en métricas, cargas, repeticiones y cronómetros. No mantener monoespaciado generalizado si la elección es usar números de la familia de UI.
- Revisar todos los usos reales: alumno, entrenador, gym, recepción y Admin; no limitarse a la portada móvil. En escritorio conservar las superficies claras existentes.
- Verificar español, tildes, ñ, signos, kg, repeticiones y separadores decimales. La demo prueba esos glifos, pero no es una prueba exhaustiva de accesibilidad o localización.
- Escalas de referencia del prototipo: títulos 32–38 px; subtítulos 25 px; texto de interfaz 13–16 px; metadatos 10–12 px. Al integrar, ajustar según función, tamaño de pantalla y pruebas de legibilidad; no llevar metadatos pequeños a texto principal.
- Servir localmente sólo las fuentes/pesos de la opción elegida y conservar licencias. No cargar las diez familias del laboratorio en producción.

## Íconos

Usar la familia/estilo elegido de forma consistente. Recursos reales con procedencia en `ASSETS_MANIFEST.json` y licencias en `licencias/`:

- [Phosphor Core](https://github.com/phosphor-icons/core): Regular, Bold, Duotone y Fill.
- [Lucide](https://github.com/lucide-icons/lucide): contorno.
- [Tabler](https://github.com/tabler/tabler-icons): contorno.
- [Heroicons](https://github.com/tailwindlabs/heroicons): Outline, con Solid como estado activo.

Mantener tamaño óptico coherente, normalmente 24 px en navegación, y área táctil de al menos 44 px. No reemplazar una mancuerna por una imagen o emoji. En la muestra Heroicons representa entrenamiento con Bolt por vocabulario de esa familia; confirmar esa metáfora al integrar. No mezclar conjuntos para completar huecos silenciosamente.

Los SVG decorativos son `aria-hidden`; los controles requieren nombre accesible. La barra sin texto visible mantiene `aria-label`. El indicador activo no depende sólo del color. No usar un icono de librería en lugar del ícono de aplicación aprobado.

## Navegación y jerarquía

Las seis barras son alternativas: Cristal flotante, Cápsula cian, Barra integrada, Segmentos suaves, Cinco islas y Entrenar al centro. La demo usa cinco destinos: Inicio, Entrenar, Progreso, Club, Chat. Perfil está disponible desde el avatar.

“Entrenar al centro” cambia el orden a Inicio, Progreso, Entrenar, Club, Chat: es una propuesta de jerarquía, no un cambio autorizado por abrir esa vista. Reconciliar el diseño elegido con la navegación real y sus roles. Conservar noticias, desafíos, catálogo, comunidad, perfil, configuración y todas las funciones existentes aunque no entren en cinco pestañas; organizar niveles secundarios con sentido.

El selector de Gym/Coach demuestra un cambio de contexto distinto del cambio de pestaña. En el producto debe respetar las relaciones y permisos del usuario y no mezclar programas, conversaciones o información sensible. Cambiar de contexto no publica datos ni concede acceso nuevo.

La barra permanece estable al navegar. No redibujar toda la aplicación ni mover el nav con cada pantalla. Respetar safe areas, teclado, scroll, campos enfocados y estado del entrenamiento. Las acciones activas deben ser claras tanto con teclado como con lector de pantalla.

## Movimiento

| Variante | Duración normal | Comportamiento |
|---|---:|---|
| Fundido | 160 ms | Opacidad de contenido; barra fija |
| Deslizamiento corto | 200 ms | Entrada lateral de 22 px; salida de 12 px y opacidad |
| Deslizamiento completo | 240 ms | Desplazamiento lateral de un ancho de pantalla |
| Elevación | 200 ms | Entrada desde 12 px abajo y opacidad |
| Profundidad | 220 ms | Escala 0,975→1 y opacidad |
| Inmediato | 0 ms | Sin transición de contenido |

Easing de referencia `cubic-bezier(.2,.75,.2,1)`. Indicador deslizante sin rebote. La dirección lateral sigue el orden de las pestañas. La cámara lenta ×3 es exclusiva del laboratorio. No introducir 720 ms como duración normal.

El switch Gym/Coach usa una hoja y fundido breve. Mantener separados cambio de sección, apertura de detalle/hoja y cambio de contexto. No usar el mismo deslizamiento para toda acción de la aplicación.

La demo usa clones visuales para comparar transiciones. Eso no prescribe duplicar formularios activos, datos privados o IDs en producción: integrar con el enrutamiento y ciclo de vida de los componentes reales. Cancelar transiciones anteriores de forma segura ante toques rápidos. Evitar que queden pantallas invisibles interceptando eventos.

Con `prefers-reduced-motion`, omitir desplazamientos, escalas y efectos innecesarios. Conservar selección, foco, semántica y respuesta inmediata. No exigir animaciones para comunicar éxito o error.

## Datos, integración y prueba

Inicio, Entrenar, Progreso, Club y Chat usan datos ficticios. Los botones registrar serie, publicar y comentar sólo son interacciones de demostración. Nunca trasladar esos datos o éxitos simulados a producción. Los gráficos no validan cálculos de progreso ni récords.

La integración deberá conservar datos y estado, aprobarse visualmente y comprobarse en móvil y escritorio, además de sesiones lentas/offline, cambios consecutivos de pestaña, mensajes sin enviar, navegación atrás, movimiento reducido y privacidad al cambiar de espacio.

Actualizar `docs/DESIGN_CONTRACT.md` y las decisiones vigentes sólo cuando haya una selección humana. Registrar con precisión qué se adoptó, qué se descartó y qué necesita adaptación. Este laboratorio no modifica la elección de paleta ni el logo/ícono de app.
