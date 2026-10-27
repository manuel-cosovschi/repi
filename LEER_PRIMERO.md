# REPI — Continuidad lista para otro Claude

Abrí esta misma carpeta en Claude Code y pegá el contenido de [PROMPT_INICIAL.md](PROMPT_INICIAL.md). **Es un solo prompt**: apunta al máster completo y al estado del proyecto, sin depender del chat anterior.

- [MASTER_PROMPT.md](MASTER_PROMPT.md): producto completo, diseño y reglas vigentes, prioridad V1 y desarrollo posterior.
- [Estado actual](docs/continuidad/ESTADO_ACTUAL.md): lo que existe, evidencia y bloqueos observados.
- [Próxima sesión](docs/continuidad/PROXIMA_SESION.md): por dónde retomar y cómo dejar un checkpoint.
- [Plan de lanzamiento y roadmap](docs/continuidad/PLAN_LANZAMIENTO_Y_ROADMAP.md): núcleo V1, gates y fases posteriores.
- [Catálogo completo](docs/continuidad/CATALOGO_COMPLETO.md): 209 entradas, con JSON que conserva requisitos y fuentes anteriores.
- [Decisiones pendientes](docs/continuidad/DECISIONES_PENDIENTES.md): sólo lo que sigue abierto.
- [Fuentes y precedencia](docs/continuidad/FUENTES_Y_PRECEDENCIA.md): rutas reales y resolución de contradicciones.
- [Guía de traspaso](docs/continuidad/GUIA_TRASPASO.md): misma computadora frente a cambio de entorno; base de datos y secretos no viajan automáticamente con la carpeta.

El código está en apps/ y packages/. El handoff nuevo está en handoff/fuentes/extraido/ y su ZIP original en la raíz. Body Intelligence: PDF en documentacion/investigacion/ y auditoría en documentacion/antecedentes_version_anterior/evidencia/. Diseño elegido en REPI_SELECCION_VISUAL.md; motion en motion.md y design/motion/.

Las entradas previas se conservaron en documentacion/historial/2026-10-27_antes_de_continuidad/. No se reinstaló el handoff viejo que el usuario había retirado. El nuevo máster evita rehacer funcionalidades ya implementadas; los resultados históricos deben verificarse antes de declarar producción lista.
