# Verificación en navegador del ZIP REPI

25 de octubre de 2026. Se sirvió una copia intacta del ZIP en `127.0.0.1:8765`, se abrió con el navegador integrado y se operó mediante controles visibles. Todo dato creado fue ficticio y local. No se modificó el código fuente, no se conectaron servicios de negocio y no se usaron fotos o videos personales.

## Cobertura y límites

Se abrieron los ocho HTML: cinco actuales y tres legacy. Se recorrieron las 18 entradas principales del panel móvil; sus árboles de accesibilidad completos están en `recorridos_mobile/01.txt` a `18.txt` y el índice en `index.json`. Se probaron interacciones seleccionadas de alumno, Coach, Gym y Admin, además de inspeccionar el showcase de motion. Esto no equivale a ejecutar todos los caminos de las 97 entradas documentales, ni a QA completo en dispositivos, lectores de pantalla o todos los anchos.

| Prueba | Resultado observado | Evidencia |
|---|---|---|
| Carga de cinco HTML actuales | Renderizan contenido y controles | Capturas y logs por superficie |
| Alumno v1/v2 | Renderizan sus versiones anteriores, sin pestaña Gym v3 | Inspección visual/árbol accesible de entrada |
| Escritorio legacy incompleto | Estructura casi vacía, títulos/bindings sin resolver | `consola_legacy_desktop.json` |
| Descanso | Pausar cambió a Reanudar; +30 pasó 00:37 a 01:07 estando pausado | `alumno_descanso_ax.txt`, captura `alumno_descanso.png`; la captura fue tomada antes de la pausa confirmada |
| Visor corporal | Se ve una figura geométrica genérica, controles de vista/zoom y regiones | `capturas/alumno_body_generico.png`, recorrido 11 |
| Composición | Informa Datos insuficientes y que fotos/modelo no estiman grasa o músculo con precisión | Observación al activar Composición; sin cálculo científico probado |
| Intento de récord | Hoja con video, marca y confirmación; no se cargó archivo ni se envió intento | Interfaz inspeccionada; validación/IndexedDB se auditaron en código |
| Cola sin turno | Tomar muestra Iniciá tu turno para tomar solicitudes | Operación directa Gym |
| Inicio de turno y toma | Al iniciar turno, tomar T-1041 reduce sin asignar 2→1 y aumenta asignadas 2→3 | Operación directa y panel gerencial resultante |
| Recarga Gym | Turno vuelve a Sin iniciar y cola a semillas 2/2 | Comprobación de estado local no persistido |
| Publicación Gym→alumno | Título y texto de prueba aparecen en la app de otra pestaña | `publicacion_alumno_ax.txt` |
| Refresco en pestaña emisora | Gym anuncia éxito pero conserva las tres tarjetas anteriores hasta recarga | `publicacion_gym_ax.txt`; mecanismo de doble-store reproducido aisladamente, causalidad de orden de carga no instrumentada |
| Coach agregar día | Aparece Día 4; tras recarga vuelve a tres días | `coach_recarga.txt` y observación anterior a recarga |
| Admin crear cliente | Agrega fila local pero no abre ficha y arroja SyntaxError; recarga devuelve cuatro gyms originales | `consola_admin.json`, `capturas/admin_alta.png` |
| Privacidad alumno | Medidas aparece compartida desde el estado inicial; otros datos no | `recorridos_mobile/18.txt` |
| Motion reducido | Control accesible seleccionable en showcase; no se midió duración ni performance | No se certifican 24 animaciones por esta observación |

## Hallazgo adicional: contrato de lifecycle incompatible

**Alta prioridad — código presente no implica animación ejecutada.** `prototypes/support.js:1001` recibe solamente `prevProps` y en `:1013` llama `this.logic.componentDidUpdate(prevProps)`. Los componentes esperan `(pp, ps)` y leen `ps.screen`: Alumno v3 `:1077–1083`, Gym `:978–982`, Coach `:376–380`, Admin `:245–247`. El segundo argumento queda `undefined`; el runtime atrapa y registra el error, por lo que muchas pantallas siguen navegando, pero el resto del callback queda abortado.

Los logs muestran `TypeError: Cannot read properties of undefined (reading 'screen')` en Alumno, Gym, Coach, Admin y Alumno v2. La lectura acotada devolvió 100 entradas en Alumno, 18 en Gym, 5 en Coach y 8 en Admin: son muestras/cotas de la captura, no un contador global de errores. Admin incluye además el SyntaxError de alta. Motion y v1 no presentaron errores en las cargas/acciones inspeccionadas, lo cual no acredita ausencia general de defectos.

Consecuencia: transiciones de pantalla, animación de gráficos, celebración y otros efectos disparados después de esa lectura pueden no ejecutarse en este export. No copiar la afirmación “24 animaciones implementadas” como “24 animaciones verificadas”. Algunas animaciones arrancan en montaje o handlers independientes y sí tienen otra vía de ejecución. La corrección futura debe preservar snapshots previos reales de la lógica; pasar el state interno `__v` de React o añadir solo un guard no restaura la intención.

## Fidelidad visual observada

Se inspeccionó la imagen maestra de marca y capturas de alumno, cuerpo y métricas Gym. Se conserva la familia Concepto 2: alumno navy, escritorios claros con sidebar navy, cian y turquesa, Inter Tight, PNG del logo. Los medios de ejercicios son placeholders, el cuerpo es geometría procedural y la presentación móvil conserva marco fijo. No se realizó comparación píxel por píxel ni se afirma equivalencia completa con la referencia.

## Reproducibilidad

Las fuentes originales y sus hashes están preservados en `fuentes/` e `inventario_zip.json`. Los nombres de pantalla/ruta de la documentación no son rutas operativas del prototipo. Para reproducir, servir `fuentes/REPI_COMPLETE_DESIGN_HANDOFF/prototypes/` con un servidor local y abrir los HTML; requiere acceso a fuentes/CDN. La evidencia de esta auditoría es de la exportación entregada, no del proyecto original dentro de Claude Design.

La publicación ficticia de auditoría se retiró al terminar; su desaparición se confirmó en la app de la otra pestaña (`limpieza_prueba.txt`). Los cambios temporales de turnos, constructor y alta Admin se descartaron al recargar. No se cargaron videos ni fotos de prueba.
