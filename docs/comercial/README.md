# REPI — Carpeta para vender y presentar

Preparada el 27/10/2026 a partir del código y de las decisiones D57–D86. Es una herramienta de trabajo para Manuel: no certifica que todos los controles de lanzamiento estén cerrados. La disponibilidad real se confirma con la verificación del despliegue vigente.

## Qué usar en cada momento

| Momento | Documento | Uso |
| --- | --- | --- |
| Primera conversación | [Presentación y guion de demo](GUIA_DEMO.md) | Explicar el valor y mostrar acciones reales de cada perfil. |
| Propuesta a un cliente | [Propuesta comercial editable](PROPUESTA_COMERCIAL.md) | Completar alcance, cantidad acordada y precio negociado. |
| Dudas frecuentes | [FAQ comercial](FAQ.md) | Respuestas consistentes, sin prometer funciones futuras. |
| Antes de comprometer una fecha | [Estado y límites](ESTADO_Y_LIMITES.md) | Separar código existente, prueba operativa y ampliaciones. |
| Después del acuerdo | [Guías de uso y operación](../guias/README.md) | Dar de alta al cliente, formar al equipo y acompañar el primer uso. |

## Presentación en 30 segundos

REPI reúne el entrenamiento del socio y el trabajo del gimnasio o del personal trainer. El alumno tiene su programa, registra las series y sigue su progreso desde el teléfono. El entrenador puede asignar y ajustar programas, recibir pedidos y conversar en la app. En un gimnasio, piso y recepción comparten las solicitudes de acceso, con permisos por rol y sede. El gimnasio también puede publicar novedades y desafíos; participar de la comunidad y compartir progreso es una elección de cada persona.

El precio se negocia por cliente. Para un gimnasio, la base es el total de socios acordado; para un coach, todos sus alumnos vigentes acordados. Activaciones y uso se miran por separado.

## Cómo conducir la conversación

1. Entender cómo asignan rutinas, atienden pedidos y registran cambios hoy.
2. Elegir un solo recorrido: gimnasio o personal trainer.
3. Mostrar una acción completa y su efecto, antes de recorrer todas las pantallas.
4. Acordar quién va a operar REPI, en qué sedes y cómo se harán altas y bajas.
5. Presentar condiciones y alcance por escrito. No convertir una función de demo en un compromiso contractual.

No afirmar que REPI aumenta ventas o retención en un porcentaje determinado: todavía no hay una medición comercial que lo respalde. No ofrecer prueba gratuita automática, precio de ejemplo, soporte permanente ni fecha de una función futura como si estuvieran acordados.

## Marca

Mantener Concepto 2 + G · Atlética: logo e ícono originales, paleta aprobada, Barlow y Barlow Condensed, Phosphor Bold. La dirección exacta está en [REPI_SELECCION_VISUAL.md](../../REPI_SELECCION_VISUAL.md). Usar capturas del producto vigente; evitar ilustrar una función pendiente como disponible.

## Fuentes y mantenimiento

Fuentes principales: [máster](../../MASTER_PROMPT.md), [decisiones](../DECISIONS.md), [último checkpoint](../continuidad/PROXIMA_SESION.md), `DemoPicker.tsx`, `DemoTour.tsx`, `AdminApp.tsx`, `CoachApp.tsx`, `GymApp.tsx`, `Access.tsx` y `MemberApp.tsx` en `apps/web/src/components/`.

La decisión D82 reemplaza la indicación antigua de ofrecer «Continuar en el navegador» en la guía móvil. El código y las decisiones posteriores pueden superar este paquete: actualizar primero [Estado y límites](ESTADO_Y_LIMITES.md) cuando cambie una capacidad, y después el argumento comercial y la guía correspondiente.
