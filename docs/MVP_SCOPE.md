# REPI — Alcance del primer lanzamiento (MVP)

Actualizado: 27/10/2026 (D111). Directiva: «LAUNCH FIRST MASTER DIRECTIVE». La visión completa se conserva en `docs/continuidad/CATALOGO_COMPLETO.md` (209 entradas) y [POST_LAUNCH_ROADMAP.md](POST_LAUNCH_ROADMAP.md). Este documento sólo separa qué tiene que estar impecable para vender.

## Circuito que el lanzamiento garantiza

Profesional con acuerdo → activa su espacio → incorpora alumnos o socios → asigna rutinas → los usuarios entrenan y registran → el profesional ve el progreso y ajusta.

**Decisión vigente (no autoalta):** el profesional no crea un espacio operativo por registro libre. Deja sus datos en el sitio, REPI acuerda condiciones y lo habilita, y el profesional activa su espacio con la invitación (anexo «Acceso, altas y facturación» 26/10, `docs/ANEXO_ACCESO_ALTAS_FACTURACION.md`; F-ID-02, F-ID-09). Crear cuenta como persona sí es libre.

## Imprescindible (P0)

**Coach:** cuenta y 2FA cuando corresponde, perfil, espacio, invitar y listar alumnos, ficha con actividad, pausar o terminar la relación, constructor de rutinas completo (ejercicios, series, reps, RIR, descanso, indicaciones, días, duplicar, versionado), asignación, seguimiento de sesiones y series, ajuste hacia adelante, mensajes, condiciones comerciales visibles.

**Alumno:** aceptar invitación, cuenta, perfil, ver coach y rutina, entrenar (series, peso, reps, descanso, finalizar), historial, progreso básico, mensajes, configuración, salir. Registro sin pérdida silenciosa (cola offline + conflictos explícitos).

**Gym (misma beta si el cliente lo pide):** alta comercial, dueño con 2FA, sedes, equipo por rol, socios por QR con aprobación, programa institucional, cola de sala, métricas básicas.

**Transversal:** aislamiento entre organizaciones, salud por consentimiento, dueño sin acceso a chats privados, rate limiting, exportar/eliminar datos, respaldo y restauración, correo real, soporte publicado.

## Puede quedar para después (P1, ya funciona o tiene alternativa segura)

Informe mensual PDF, agenda, importación CSV, cobros manuales coach → alumno, objetivos, centro de avisos, reemplazos aprobados, «No vino el profe», Club del gimnasio, reseñas, Performance Center, multi-sede. Todo esto **ya está implementado y probado**; queda encendido salvo que el titular apague un módulo (FEATURE_FLAGS.md).

## Fuera del lanzamiento (P2 / experimental), apagado o sin implementar

- Body Intelligence completo (medidas, fotos, 3D, DXA/InBody, laboratorio): apagado (`body`).
- Nutrición: apagado (`nutrition`).
- Videos de ejercicios: apagado hasta tener medios licenciados (`exercise_video`).
- Adaptive Coach fases 2–6 e IA; Repi Proactivo; cobros automáticos; facturación fiscal; reservas y clases; promociones, cupones, referidos; control de acceso físico.
