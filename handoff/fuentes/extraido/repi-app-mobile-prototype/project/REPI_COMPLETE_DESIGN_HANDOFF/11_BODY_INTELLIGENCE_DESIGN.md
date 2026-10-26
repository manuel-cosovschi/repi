# 11 · Body Intelligence (Mi cuerpo)

> **Advertencia:** los algoritmos de reconstrucción, estimación de composición y extracción de documentos serán definidos por una investigación científica separada. Nada de lo diseñado implica precisión clínica, capacidad de reconstrucción ni benchmarks de GPU.

## Experiencia diseñada (SCR-M-07..16, SCR-C-02g)
1. **Introducción** — 3 principios: privado por defecto, sin fotos obligatorias (nunca ropa interior), seguimiento no diagnóstico. "Ahora no" no afecta el entrenamiento.
2. **Consentimiento** — 6 tipos (medidas, fotos, escaneos 3D, informes de composición, laboratorio, procesamiento IA) apagados; continuar requiere ≥1. Guardar ≠ compartir.
3. **Método** — manual (2 min), fotos (3 min), 3D avanzado (Experimental). Deshabilitados sin consentimiento.
4. **Medidas manuales** — peso, brazo derecho, cintura, pecho; fuente (yo / profesional).
5. **Captura guiada** — silueta, chequeos (luz, distancia, encuadre, nitidez), instrucción por pose (frente, espalda, perfiles), contador 4 poses, error de nitidez simulado, sin animaciones llamativas mientras el usuario está quieto.
6. **Revisión** — repetir por foto; aviso de cifrado y estado de compartido.
7. **Procesando** — pasos honestos.
8. **Fallo** — "No pudimos reconstruir tu modelo 3D": causas (cobertura, luz, función no disponible); fotos guardadas igual; usar modelo de referencia o reintentar.
9. **Visor 3D** — cuerpo genérico de primitivas three.js (cabeza, cuello, torso frontal/dorsal, core, glúteos, brazos, piernas, pantorrillas). Etiqueta obligatoria del modo: "Modelo genérico de referencia" o "Avatar ajustado a tus medidas · aproximado". Interacción: arrastrar (rotar), pinch/rueda/± (zoom 2.2–5.5), reset, vistas, damping. **Capas:** Exterior / Músculos (color por estado de exposición: en plan #00D1FF, requiere atención #F59E0B, sin datos #3A4A60) / Composición (panel "Datos insuficientes" salvo DXA/BIA/pliegues). **9 regiones:** pecho, hombros, espalda, brazos, core, glúteos, cuádriceps, isquiotibiales, pantorrillas — cada una con ejercicios, series hechas/planificadas, tendencia de fuerza 8 semanas con fuente, medida relacionada con fuente y fecha, aviso "El color del modelo no mide tu músculo real". Fallback sin WebGL. Reduced-motion sin dolly.
10. **Comparar** — swipe entre fotos de dos fechas, aviso de iluminación distinta, deltas de medidas.
11. **Coach** — ve solo tipos compartidos (SCR-C-02g) y salud/nutrición con grant.
12. **Perfil** — compartir/revocar por tipo, historial de accesos, recordatorio de evaluación (6/8/12 semanas/off), exportar, eliminar.

## Estados soportados
consentimiento vacío · método bloqueado · captura con error de calidad · procesando · reconstrucción fallida · modelo de referencia · avatar ajustado (aprox.) · personal (futuro) · sin WebGL · datos insuficientes · no compartido.

## No diseñado
Subida/importación de DXA, bioimpedancia, antropometría y laboratorio en PDF/foto (botón muestra toast) · extracción con IA revisada · línea de tiempo de evaluaciones · morph entre mallas compatibles · cámara real.

## Datos requeridos
BodyMeasurement (fuente, método, fecha), ProgressPhoto (pose, luz, cifrado), BodyScan, AvatarModel (modo, versión), CompositionReport, LabDocument, MemberConsent, AccessAuditEvent, cargas por región derivadas de SetLog.
