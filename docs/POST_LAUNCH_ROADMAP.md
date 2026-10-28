# REPI — Roadmap posterior al lanzamiento

Actualizado: 27/10/2026 (D111). Nada se descarta: el detalle por ID está en `docs/continuidad/CATALOGO_COMPLETO.md` (V1.1, V2, BI-1..3, FUTURO) y la arquitectura de Adaptive Coach en `docs/adaptive/ADAPTIVE_COACH_ARCHITECTURE.md`. Cada módulo nuevo entra apagado ([FEATURE_FLAGS.md](FEATURE_FLAGS.md)) y sigue: requisitos → impacto → implementación modular → pruebas → interruptor → validación → release → monitoreo.

Prioridad = valor comercial y retención primero, después costo, riesgo y dependencias. Se reordena con lo que pidan los primeros clientes de la beta.

| Orden | Módulo | Qué incluye | Estado hoy | Depende de |
| --- | --- | --- | --- | --- |
| 1 | Cierre de beta | Lo que reporten los primeros coaches y gimnasios; teléfonos reales (LB-03) | — | Beta |
| 2 | Adaptive Coach 1b (resto) | Política de autonomía por organización; restricciones con vigencia (EXT-06) | Reemplazos aprobados hechos (D110) | — |
| 3 | Biblioteca y medios | Videos licenciados, CRUD propio con atributos; enciende `exercise_video` | Biblioteca base sin videos | Licencia de medios |
| 4 | Repi Proactivo | Recordatorios, resúmenes, horarios del coach, alertas por eventos | Avisos push y centro de avisos existen | Preferencias por canal (F-NT-02) |
| 5 | Comercial avanzado | Cobros automáticos con proveedor, comprobantes, mora; promociones, cupones, referidos, CRM, reservas | Cobros manuales y condiciones versionadas | Proveedor de pago y fiscal (D04–D05) |
| 6 | Adaptive Coach 2–6 | Propuestas validadas, rutinas abreviadas, adaptación por equipamiento, IA contextual | Núcleo y validador listos (D108) | Decisión de gasto en IA |
| 7 | Body Intelligence BI-1 | Medidas y fotos con consentimiento, historial, visor genérico rotulado; enciende `body` | Sin implementar | Privacidad y almacenamiento |
| 8 | Nutrición | Registro del alumno visible al coach con permiso; enciende `nutrition` | Sólo permisos | Alcance definido |
| 9 | Gym avanzado | Clases grupales, turnos complejos, multi-sede ampliado | Performance Center, reseñas y multi-sede básicos hechos | Demanda de gimnasios |
| 10 | BI-2/BI-3 y experimentales | Reconstrucción 3D, DXA/InBody, laboratorio | Experimental | Validación técnica, científica y legal |

Reglas permanentes: migraciones sólo aditivas, compatibilidad con cuentas y rutinas existentes, nada experimental directo a producción, nunca datos ficticios presentados como reales.
