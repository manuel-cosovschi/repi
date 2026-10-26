# 06 · Matriz de roles y permisos (política inicial)

Leyenda: **Own** propios · **Scoped** asignados/sede · **Grant** consentimiento explícito del alumno, por propósito y revocable · **—** sin acceso. Fuente máquina: `roles-permissions.json`.

| Recurso | Coach independiente | Alumno (cliente) | Dueño de gym | Gerente | Coordinador | Entrenador de sala | Recepción | Socio de gym | REPI Admin |
|---|---|---|---|---|---|---|---|---|---|
| Programa/rutina (coach privado) | Own (crea, edita, asigna) | Own (lee) | — | — | — | — | — | — | — |
| Programa institucional del gym | — | — | Lee (necesidad operativa) | Lee / edita si policy | Scoped edita | Scoped edita (turno activo) | — | Own (lee) | — |
| Historial de entrenamiento | Sus clientes | Own | Agregados | Agregados + scoped | Scoped | Scoped (sede) | — | Own | — |
| Perfil del cliente | Sus clientes | Own | Básico | Básico | Scoped | Scoped | Básico | Own | Datos de cuenta |
| Notas institucionales | — | — | Lee | Lee | Lee/escribe | Lee/escribe | — | — | — |
| Notas personales del entrenador | Autor | — | — | — | — | Autor | — | — | — |
| Chats privados | Participante | Participante | — | — | — | Participante (si existe) | — | Participante | — |
| Metadatos de chat | Propios | Propios | Agregado | Agregado | Agregado | Propios | — | Propios | — |
| Tareas operativas | — | — | Gym | Gym (reasigna) | Sede | Asignadas + cola | Crear | Propias solicitudes | — |
| Desempeño del personal | — | — | Gym | Equipo | Equipo sede | Propio | — | — | — |
| Reseñas: leer texto | — | — | Gym (con nombre) | Gym (con nombre) | Sede | Propias (sin nombre) | — | Propias | — |
| Reseñas: moderar | — | — | Si moderator | Si moderator | Si moderator | Reportar/disputar | — | Reportar | — |
| Facturación REPI (SaaS) | Propia (lee) | — | Full | — | — | — | — | — | Full (edita) |
| Cobros coach→cliente | Full | Own (lee) | — | — | — | — | — | — | — |
| Cobros gym→socio | — | — | Fuera de alcance (DEC-10) | — | — | — | — | — | — |
| Fotos de progreso | Grant | Own | — | — | Grant | Grant | — | Own | — |
| Modelo 3D / escaneo | Grant | Own | — | — | Grant | Grant | — | Own | — |
| Medidas corporales | Grant | Own | — | — | Grant | Grant | — | Own | — |
| Informes de composición | Grant | Own | — | — | Grant | Grant | — | Own | — |
| Laboratorio / documentos médicos | Grant | Own | — | — | Grant | Grant | — | Own | — |
| Salud: lesiones, molestias, condiciones | Grant | Own | — | — | Grant | Grant | — | Own | — |
| Nutrición | Grant | Own | — | — | — | — | — | Own | — |
| Posts / desafíos / catálogo del gym | — | — | Publica | Publica | Si community.publish | Lee | Publica catálogo | Lee | — |
| Intentos de récord (video) | — | — | Valida | Valida | Si challenges.validate | Si challenges.validate | — | Crea/lee propios | — |
| App del alumno / relación coach privada | — | Own | — | — | — | — | — | Own | — |
| Configuración de la organización | Propia | — | Full | Sede | — | — | — | — | — |
| Suscripciones de clientes REPI | — | — | — | — | — | — | — | — | Full |
| Auditoría de accesos | Propios eventos | Accesos a sus datos | Gym | Gym | Sede | Propios | — | Accesos a sus datos | Plataforma |

## Fronteras de privacidad (confirmadas por el usuario)
- Dueño y gerente **no** ven conversaciones privadas, notas personales, salud, nutrición ni Mi cuerpo (SCR-GX-02 demuestra el bloqueo + auditoría).
- El gym **no** ve la app del alumno ni la del coach privado; ve asistencia/sesiones, programa institucional, notas del equipo, desafíos/récords y reseñas.
- El coach ve los datos del alumno **en su dashboard**, nunca la app del alumno; salud, nutrición y cuerpo requieren Grant.
- El alumno controla cada tipo de dato (guardar y compartir por separado) y ve el historial de accesos.
- REPI Admin ve cuentas, cantidades facturables y suscripciones; no datos de entrenamiento, salud ni mensajes.

## Casos borde
- Coach que también trabaja en un gym: dos espacios; clientes privados invisibles para el gym y viceversa.
- Socio con gym + coach: dos relaciones con consentimientos independientes.
- Baja de un entrenador: notas institucionales quedan en la org; personales se borran/exportan.
- Editar/completar en el gym requiere turno activo salvo `staff.afterHoursAccess`.
