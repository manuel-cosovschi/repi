# REPI — Selección visual aprobada: G · Atlética

Fecha: 2026-10-26. Confirmación explícita del usuario en el chat: «ya elegí la combinación que quiero en la vista, la atlética».
Estado: decisión aprobada e **integrada en la app el 26/10/2026** (detalle en `docs/DESIGN_CONTRACT.md` § Selección visual aprobada y verificación en `motion.md` §12). Se seleccionó el preset G completo del comparador, sin inferir otra combinación del estado temporal del navegador.

## Configuración exacta

| Elemento | Elección aprobada |
| --- | --- |
| Títulos destacados | Barlow Condensed, peso 700, mayúsculas visuales |
| Texto de interfaz y lectura | Barlow; pesos adecuados a la jerarquía existente |
| Íconos internos | Phosphor Bold |
| Navegación móvil | Cristal flotante: cápsula con indicador interior de selección |
| Cambio entre secciones | Fundido suave de 160 ms; barra estable |
| Configuración del laboratorio | font=barlow, icons=bold, nav=glass, motion=fade |

Referencia ejecutable: `documentacion/propuestas-visuales/2026-10-26/index.html#font=barlow&icons=bold&nav=glass&motion=fade`.
Fuente exacta del preset: `documentacion/propuestas-visuales/2026-10-26/lab.js`, PRESETS, id G.
Referencia de estilo: `documentacion/propuestas-visuales/2026-10-26/lab.css`.
Capturas: `documentacion/propuestas-visuales/2026-10-26/capturas/G-inicio.png`, `G-progreso.png`, `G-club.png`.

## Instrucciones de integración para Claude Code

Aplicar esta dirección visual a la app existente y ejecutar también las especificaciones M01–M05 de `motion.md`. Actualizar los documentos de diseño vigentes para reflejar la selección, sin borrar decisiones no relacionadas. Esta confirmación sustituye las instrucciones anteriores de esperar una elección de tipografía, íconos, barra y transición, así como la recomendación inicial de la variante B.

- Conservar exactamente la paleta aprobada de Concepto 2, el logo y el ícono de la app. No escribir el logo con Barlow ni modificar su lettering. Mantener las superficies claras de escritorio donde ya correspondan.
- Barlow Condensed se reserva a títulos destacados. No condensar chats, formularios, tablas, instrucciones de ejercicio, textos largos ni etiquetas pequeñas. Usar Barlow para el cuerpo; no convertir toda la app a mayúsculas. Como referencia de la demo, el h1 móvil es 38 px, peso 700 y tracking -0,015 em; adaptar responsivamente sin recortes.
- Usar números tabulares cuando ayuden a comparar cargas, repeticiones, series, tiempos y métricas. Verificar tildes, ñ, decimales y texto ampliado.
- Unificar íconos de interfaz en Phosphor Bold según su significado real, conservando nombres accesibles. No reemplazar logotipos ni ilustraciones de contenido por íconos genéricos. Mantener licencias de fuentes e íconos y servir únicamente los assets necesarios, disponibles en assets/ y licencias/ del laboratorio.
- Integrar la cápsula flotante en la navegación móvil real. Preservar las rutas, los destinos disponibles por rol, badges, permisos y funciones del producto. El comparador tiene menos contenido que la app: no eliminar Gym, Club, recepción, mensajes o nuevas funciones para imitar sus cinco botones.
- Conservar las estructuras de navegación de escritorio; adaptar la tipografía, iconografía y lenguaje visual sin colocar una barra móvil artificialmente en dashboards de escritorio.
- La cápsula debe respetar safe areas, contraste, foco, áreas táctiles mínimas de 44 px y espacio inferior para que no tape contenido. Dar nombres accesibles a todos los destinos, aunque visualmente solo haya íconos. Proveer fondo legible cuando no haya soporte de blur.
- Fundido entre secciones de 160 ms con la barra estable; conservar estado, scroll y trabajo sin sincronizar. No fundir toda la página, el logo y la barra en cada toque. Cancelar animaciones obsoletas ante cambios rápidos. Movimiento reducido: cambio inmediato.
- El fundido de 160 ms es la transición general de secciones. Las cinco interacciones M01–M05 mantienen sus tiempos y comportamientos específicos en motion.md; no reducir todas a un fundido ni reemplazar sus secuencias.
- Ajustar el sistema de tokens existente y revisar alumno, Coach, Gym, recepción y Admin. No copiar la demo por encima de componentes funcionales ni cargar todas las variantes del laboratorio.

## Verificación de la integración

Comprobar fuentes efectivamente cargadas, títulos largos, tamaños de pantalla móviles/escritorio, texto ampliado, contraste y navegación con teclado. Verificar que la barra no tape acciones, que los íconos mantengan sus significados y que el cambio rápido de sección preserve datos. Ejecutar los checks del proyecto pertinentes y registrar resultados junto al estado M01–M05 en motion.md. No declarar implementación terminada solo por haber guardado esta decisión.
