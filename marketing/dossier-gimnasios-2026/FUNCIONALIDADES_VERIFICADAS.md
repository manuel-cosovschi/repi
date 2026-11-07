# Registro de funcionalidades usadas en el dossier

Revisión: 07/11/2026, rama `claude/tender-cerf-0cm7r9` (base `main` `5e2c94d`, producción con D206). Fuentes: código (`apps/web/src/components/gym/GymApp.tsx` y pantallas de gym, app del socio, servicios), contenido comercial curado `apps/web/src/content/conoce.ts` (D205, «sólo capacidades presentes»), `docs/comercial/ESTADO_Y_LIMITES.md`, `docs/continuidad/PROXIMA_SESION.md` y capturas reales de la demo guiada (datos ficticios).

Estados: **Disponible** (en código y publicado) · **Se activa por gimnasio** (disponible, REPI lo enciende por cliente) · **Primera etapa** (disponible con alcance acotado) · **En desarrollo / futuro** (no se vende como presente).

| Capacidad | Estado | Evidencia | Cómo aparece en el dossier |
| --- | --- | --- | --- |
| Rutina del día por programa, series, repeticiones, cargas, RIR/RPE, descanso automático | Disponible | `components/member/*`, `Workout.tsx`; conoce «registro» | Socio, inventario |
| Registro sin señal de lo ya abierto (cola local) | Disponible (núcleo offline) | sync/cola, D73 | «Sigue guardando sin señal» |
| Training Intelligence: anterior / recomendado / real por serie, con explicación | Disponible | D190–D194, conoce «intelligence» | Diferencial |
| Progreso por ejercicio, récords, volumen, 1RM estimado (Epley) | Disponible | conoce «progreso», D199–D204 | Socio, diferencial |
| Mi cuerpo: peso, objetivo, fotos privadas, calorías estimadas como rango | Primera etapa (adultos; no diagnóstico) | D199–D204 | Socio, con aclaración |
| IA que arma borradores (programa para revisar, rutina del día si no vino el profe, lectura de historiales) | Disponible; nada se asigna solo | conoce «ia» | Entrenadores, diferencial |
| Pedido de programa con preferencias obligatorias | Disponible | D206 | Entrenadores |
| Seguimiento de sala: el socio pide ayuda desde su serie, cola, traspaso, tiempos | Se activa por gimnasio (REPI Connect) | D126, `Connect.tsx`, `FloorNow.tsx` | Entrenadores, con nota |
| Mi turno, cola de asistencia, traspaso de turno, mensajes, mi desempeño (sala) | Disponible | `GymApp.tsx` nav `floor.work` | Entrenadores |
| Programas por días, métodos avanzados, versiones visibles para el socio | Disponible | conoce «programas» | Entrenadores |
| Videos de ejercicios y equipamiento del gimnasio | Disponible | nav «Videos de ejercicios», «Equipamiento» | Entrenadores, inventario |
| Vista del dueño: ejecutivo, sedes, Equipo y servicio / Performance Center, reseñas | Disponible | nav `owner`/`manager`, `Owner.tsx`, `Perf.tsx` | Dueño |
| Equipo con roles (dueño, gerencia, coordinación, sala, recepción), turnos, tareas | Disponible | nav `manager`/`coordinator`, `Manage.tsx`, `Hours.tsx` | Dueño |
| Altas por QR por sede, aprobación por sala/recepción/gerencia, accesos | Disponible | D-acceso, `Access.tsx` | Dueño, implementación |
| Control de ingreso con QR que se renueva cada 30 s | Se activa por gimnasio | D127, `AccessControl.tsx` | Inventario, con nota |
| Comunidad voluntaria, moderación, desafíos con premio y ranking, catálogo informativo, novedades | Disponible | `Community.tsx`, desafíos D165 | Dueño, inventario |
| Avisos internos del equipo y novedades de REPI | Disponible | nav «Avisos», D202 | Inventario |
| Permisos por rol y sede; el gimnasio no ve chats privados ni salud sin permiso; exportar y pedir borrado | Disponible | D12, privacidad F-PR | Seguridad |
| App instalable desde el navegador (iPhone y Android), sin tiendas | Disponible | `/instalar`, guía PWA | Socio, implementación |
| Soporte: errores y dudas de uso incluidos en el acuerdo; urgencias dentro de 24 h | Confirmado por el titular (D109) | `src/lib/contact.ts` | Implementación |
| Caso: en funcionamiento en Smart Center Gym (Mar del Plata), sin cifras | Uso del nombre autorizado | D205/D206 (logo autorizado), conoce «aliados» | Cierre, una línea sin métricas |
| Medidas corporales y análisis más completos | En desarrollo | conoce «cuerpo» note | Sólo «En evolución» |
| Apps en App Store / Google Play | Futuro | MASTER_PROMPT §5 | Sólo «En evolución» |
| Body Intelligence / escaneo 3D / diagnóstico | Experimental / no comercializable | ESTADO_Y_LIMITES | **No aparece** |
| Cobro de cuotas gym → socio, pasarela, facturación fiscal | Fuera de alcance | ESTADO_Y_LIMITES | **No aparece** |

Lo que no se afirma: retención, aumento de ingresos, menos bajas, resultados físicos ni testimonios. Las capacidades pensadas para entrenadores independientes (cobros a alumnos, agenda del personal trainer) no se destacan: el destinatario es un gimnasio.
