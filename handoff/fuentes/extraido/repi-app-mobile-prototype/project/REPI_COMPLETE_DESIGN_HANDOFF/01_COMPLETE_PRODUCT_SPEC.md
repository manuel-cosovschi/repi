# 01 · Especificación de producto (estado actual)

## Qué es REPI
Plataforma de **performance, seguimiento y entrenamiento** que conecta alumnos con entrenadores para una comunicación y seguimiento más activos y personalizados. Marca `repi` · "Cada repetición cuenta." · Concepto 2 Friendly Performance.

**No es** un sistema de administración de gimnasios: REPI no gestiona cuotas ni cobros del gym a sus socios (DEC-10). Sí gestiona: cobros manuales del coach independiente a sus clientes (brief original) y la suscripción SaaS que coaches y gyms pagan a REPI.

## Modos comerciales
- **REPI Coach** — entrenador independiente; paga por alumno facturable (hipótesis ARS 700).
- **REPI Gym** — gimnasios y cadenas; paga por socio facturable con tramos por volumen, mínimo y módulos (valores ilustrativos). Sin cargo por entrenador.
Ambos comparten identidad, motor de entrenamiento, biblioteca, progreso, Body Intelligence, mensajería y comunidad; difieren en roles, permisos y flujos.

## Superficies
1. **App del alumno** (PWA móvil, oscura) — SCR-M-*. Versión canónica: `prototypes/REPI App Alumno v3.dc.html`.
2. **Desktop del coach** (claro) — SCR-C-*.
3. **Desktop del gym** (claro) — entrenador de sala SCR-GT-*, gerente SCR-GM-*, comunidad SCR-GC-*, dueño SCR-GO-*.
4. **Panel interno REPI Admin** — SCR-A-*.
5. **Sitio público, auth, onboarding** — especificados, no diseñados (SCR-N-01..04).

## Módulos (detalle por módulo en 12–17 y 11)
| Módulo | Usuarios | Estado | Docs |
|---|---|---|---|
| Entrenamiento del alumno (inicio, semana, sesión activa, descanso, resumen, PR) | Alumno | Prototipo interactivo | 03, 08 |
| Progreso (fuerza, volumen, constancia, medidas) | Alumno, coach | Prototipo interactivo | 03 |
| Body Intelligence / Mi cuerpo | Alumno, coach (grant) | Prototipo interactivo + experimental | 11 |
| Privacidad y consentimiento | Alumno | Prototipo interactivo | 06, 11 |
| Mensajería coach↔alumno | Coach, alumno | Prototipo interactivo | 12 |
| Coach: panel, clientes (8 pestañas), constructor, pagos | Coach | Prototipo interactivo | 12 |
| Gym: turnos, cola, socios, traspasos, mi desempeño | Entrenador de sala | Prototipo interactivo | 13 |
| Gym: panel, Performance Center, equipo, tareas, reseñas, turnos, participación | Gerente, dueño | Prototipo interactivo | 13 |
| Gym: comunidad (novedades, descuentos, desafíos, catálogo), validación de récords, logros | Gerente, dueño, socio | Prototipo interactivo | 13, 15 |
| Gym dueño: ejecutivo, sedes, facturación REPI, configuración | Dueño | Prototipo interactivo | 13, 16 |
| Reseñas verificadas y moderación | Socio, entrenador, gerente | Prototipo (falta prompt en app v3) | 13 |
| Multi-organización | Todos | Parcial | 05, 10 |
| Facturación SaaS + Admin | REPI Admin, coach, dueño | Prototipo interactivo | 16 |
| Repi Club social (feed, reacciones, rankings, trofeos) | Todos | No diseñado | 15 |
| IA | Coach | No diseñado | 17 |
| Sitio público, auth, onboarding, calendario, CSV, offline, notificaciones push | Varios | No diseñado | 20 |

## Principios confirmados
- Privacidad por defecto; el alumno controla qué guarda y qué comparte.
- Seguimiento, no diagnóstico; "Datos insuficientes" antes que estimaciones engañosas.
- Métricas del personal justas, separadas y explicadas; sin puntajes ocultos ni decisiones automáticas.
- Motion con propósito, nunca bloquea registrar datos; reduced-motion respetado.
- Texto en español rioplatense; ARS; números tabulares.

## Limitación de esta auditoría
Parte del historial de conversación ya no está disponible en contexto. Este paquete se reconstruyó a partir de: (a) todos los archivos actuales del proyecto, (b) el brief original del kit, (c) el handoff v3 previo, (d) la memoria de trabajo de los últimos turnos. Detalles de conversaciones tempranas que no quedaron plasmados en archivos pueden faltar. El archivo `REPI Escritorio.dc.html` no tiene lógica y su origen no está documentado en el contexto disponible.
