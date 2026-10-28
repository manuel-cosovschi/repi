# REPI — Auditoría por simulación real de todos los roles

Fecha: 27–28/10/2026. Pedido del titular: «una simulación real desde todos los roles, testear cada función, la app en su totalidad y una auditoría compleja y detallada para asegurarnos que está lista». Decisiones: D117 y D118 en [DECISIONS.md](DECISIONS.md). Matriz: [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Veredicto

**Lista para una beta controlada con coaches y gimnasios elegidos, una vez desplegado D118.** La simulación encontró un bloqueante real (F-12: nadie del equipo de un gimnasio podía crear su cuenta desde la invitación) y un fallo de permisos (F-11). Los dos están corregidos y probados.

**Sigue sin estar lista para un lanzamiento comercial público.** Los motivos no son de código: hosting comercial (LB-02), prueba en teléfonos reales (LB-03), revisión legal (LB-04), respaldos (LB-05) y alertas (LB-06). Ver [LAUNCH_BLOCKERS.md](LAUNCH_BLOCKERS.md).

## Método

- **Entorno:** servidor local de desarrollo (Next 16) sobre la base de dev, con el buzón local para leer códigos y enlaces.
  - Los pasos se hicieron en la interfaz real, casi todos a 375 × 812 (emulación de teléfono).
  - Las pruebas de permisos se hicieron con llamadas HTTP desde la sesión de cada rol.
- **Cuentas creadas desde cero** por el circuito real (alta en Admin → invitación → cuenta → código por correo → 2FA cuando corresponde):

| Rol | Cuenta de simulación | Cómo entró |
| --- | --- | --- |
| REPI Admin | cuenta de demo con 2FA | Ingreso local |
| Coach | sim.coach@example.com | Bienvenida desde Admin (`/activar`) |
| Alumna del coach | sim.alumno@example.com | Invitación del coach |
| Dueño de gimnasio | sim.dueno@example.com | Bienvenida desde Admin + 2FA con app de códigos (TOTP real) |
| Entrenador de sala | sim.piso@example.com | Invitación del dueño |
| Recepción | sim.recep@example.com | Invitación del dueño (por la API de registro) |
| Socia del gimnasio | sim.socia@example.com | QR de la sede (`/unirse`) y aprobación en sala |

- **Automático:**
  - Web 179/179 (base descartable `repi_test`), dominio 107/107, guardas 11/11, build de producción OK.
  - Pruebas nuevas en `annex.test.ts`, `launch-flows.test.ts` y `features.test.ts`.

## Circuitos recorridos

| # | Circuito | Resultado |
| --- | --- | --- |
| C-01 | Admin: alta de gimnasio (2 sedes) y de coach, aceptación, habilitación, prueba, invitación de bienvenida | OK tras D117: el alta fallaba con datos opcionales (reportado por el titular) |
| C-02 | Coach: activa su espacio, invita alumna, crea programa (3 ejercicios, series, reps, RIR, descanso) | OK |
| C-03 | Alumna: cuenta con fecha de nacimiento, código erróneo rechazado, comparte salud, pide programa, escribe al coach | OK |
| C-04 | Coach: ve badges de mensajes y solicitudes, responde, asigna el programa | OK tras F-05 y F-17 |
| C-05 | Alumna: check-in, sesión con peso, descanso, finaliza, esfuerzo 8/10 y nota al coach | OK tras F-06; quedó guardado (2 series, RPE 8, nota) |
| C-06 | Coach: ficha con sesión, series, volumen, RPE y nota; pausa y reactiva la relación | OK; mensaje de estado corregido (F-19) |
| C-07 | Dueño: crea cuenta, código por correo, 2FA con app de códigos y códigos de respaldo, entra al panel ejecutivo | OK |
| C-08 | Dueño: invita entrenador de sala y recepción, ve pendientes, reenvía o revoca | OK tras F-08 |
| C-09 | Entrenador: crea su cuenta desde la invitación | **Fallaba siempre (F-12, bloqueante)**; OK tras corregir |
| C-10 | Entrenador: inicia turno, muestra el QR de la sede | OK |
| C-11 | Socia: escanea el QR, crea cuenta, pide acceso, ve el código de su solicitud | OK; contador de pasos corregido (F-13) |
| C-12 | Entrenador: aprueba con el motivo de confirmación; queda en «Resueltas» con quién y cómo | OK |
| C-13 | Socia: elige qué comparte (sin «Medidas corporales», módulo apagado), entra, pide programa | OK (F-04, F-15) |
| C-14 | Entrenador: toma el pedido de la cola, crea el programa institucional con motivo y completa la tarea | OK; los aprobados sin confirmar ahora se ven (F-14) |
| C-15 | Socia: ve el programa, entrena; al finalizar con series pendientes pide confirmación | OK |
| C-16 | Recepción: carnet de la socia (código rotativo) verificado, ingreso registrado, carnet falso rechazado | OK |
| C-17 | Recorrido de todas las secciones de cada rol a 375 px: Admin (6), Coach (9), Dueño (14), Sala (9), Recepción, Alumna (4 pestañas y Perfil) | Sin desborde horizontal ni errores visibles |

## Permisos probados entre roles

Cada fila es una llamada real con la sesión del rol. Todas devolvieron lo esperado: 403/404 sin datos y 401 sin sesión.

| Rol | Intento | Resultado |
| --- | --- | --- |
| Recepción | Ficha de un socio, equipo, condiciones, panel de un coach, Admin, invitar equipo | 403 / 404 |
| Entrenador de sala | Socio de otro gimnasio, ficha de alumna de un coach, Admin, invitar equipo, panel ejecutivo | 404 / 403 |
| Alumna | Su propio coach (API de coach), otro coach, socios del gym, Admin, sesión de otra persona | 404 |
| Coach | Otro coach, socios y ficha del gym, Admin, sesión de su alumna por la API personal | 404 |
| Socia | Sesión de otra persona, socios, mostrador de recepción, panel de coach | 404 |
| Socia | Página `/admin` | 404, sin contenido |
| Sin sesión | Entrenamiento, coach, gym, Admin | 401 |
| Cualquiera | 10+ ingresos seguidos | 429 (límite de intentos activo) |
| Registro | Saltear la fecha de nacimiento sin una invitación de equipo vigente | Rechazado: sólo el código de una invitación de equipo la exime |

## Hallazgos

Severidad:
- **Crítica:** bloquea un circuito principal.
- **Alta:** datos o permisos incorrectos.
- **Media:** confunde o hace perder trabajo.
- **Baja:** texto o pulido.

| ID | Sev. | Hallazgo | Estado |
| --- | --- | --- | --- |
| R-01 | Alta | Admin «Nuevo cliente» rechazaba el alta si la razón social tenía un carácter, con un mensaje que no decía qué faltaba (reportado por el titular en producción) | Corregido D117 (+ migración 0024) |
| F-12 | **Crítica** | Crear cuenta desde una invitación de equipo de gimnasio fallaba siempre: el servidor exigía fecha de nacimiento y el formulario de equipo no la pide. Viene del primer corte; las pruebas llamaban al servicio, no a la ruta | Corregido D118: la ruta valida el código y exime sólo a invitaciones de equipo vigentes |
| F-11 | Alta | Un gerente podía invitar a otro gerente y a cualquier sede (la interfaz lo ocultaba; el servidor no lo impedía). También podía reenviar o revocar invitaciones de otras sedes | Corregido D118 + prueba |
| F-05 | Alta | En «Programas», al cambiar de programa y tocar «Asignar» antes de que cargue, se asignaba el programa anterior | Corregido D118 |
| F-04 | Media | La alumna podía elegir compartir medidas, fotos y nutrición con esos módulos apagados | Corregido D117 |
| F-06 | Media | «Finalizar» en la cabecera terminaba la sesión sin avisar aunque faltaran series | Corregido D118: pide confirmación |
| F-08 | Media | El dueño no veía las invitaciones de equipo pendientes: no podía reenviarlas ni revocarlas | Corregido D118 |
| F-01 | Media | Fechas por defecto en UTC: de noche mostraban el día siguiente (Admin, cobros, objetivos, edad) | Corregido D117 |
| F-17 | Baja | El «Pedir mi programa» del alumno seguía abierto después de que el coach le asignaba uno | Corregido D118 + prueba |
| F-14 | Baja | Sala no veía que un socio aprobado todavía no había confirmado en su app | Corregido D118 |
| F-02 | Baja | Contraseña débil: «Completá los datos y aceptá los términos.» | Corregido D117: dice qué falta |
| F-03 | Baja | Un programa nuevo no aparecía en la lista hasta el primer guardado | Corregido D117 |
| F-10 | Baja | Textos con códigos internos visibles para el cliente («pendiente (D08)», «(DEC-10)», «(D45)», «(D37)») | Corregido D118 |
| F-13 | Baja | El contador de pasos de `/unirse` retrocedía de «2 de 3» a «2 de 2» | Corregido D118 |
| F-15 | Baja | «Pedido enviado a el equipo de sala» | Corregido D118 («al») |
| F-18 | Baja | Admin mostraba «prueba hasta 2026-11-15» | Corregido D118 (DD/MM/AAAA) |
| F-19 | Baja | «Ana Alumna está activo de nuevo» | Corregido D118 (texto neutro) |
| F-07, F-09 | — | Aviso de 2FA duplicado; campo de email sin nombre accesible | Descartados: son la región `aria-live` y una etiqueta que envuelve al campo |
| R-02 | Media | Ícono de instalación con doble marco o recortado (reportado por el titular) | Corregido D117 |

## Observaciones (no corregidas, para decidir)

- **O-01:** el panel ejecutivo del gimnasio habla de «Socios en padrón» y «Sin padrón». El padrón obligatorio está superado: conviene revisar si esa métrica sigue teniendo sentido para el dueño.
- **O-02:** «No vino el profe, dame mi rutina para hoy» aparece también a alumnos de coaches online, donde no hay profe presencial.
- **O-03:** al asignar, las opciones de inicio son «Hoy», «Lunes 2 nov» y «1 de noviembre». La tercera es anterior a la segunda.
- **O-04:** la adherencia cuenta una sesión con 2 de 10 series como día cumplido (100 %).
- **O-05:** el nombre del programa institucional viene precargado («Programa inicial») y lo que se escribe se suma al final. Conviene seleccionarlo al enfocar.

## Lo que esta auditoría no cubre

- **Teléfonos reales:** Safari iOS y Chrome Android instalados, permisos de avisos, teclado y entrenar sin conexión con el teléfono real (LB-03).
- **Correo en producción:** entrega de Resend a casillas reales y si los correos caen en spam. En local el correo va al buzón de desarrollo.
- **Admin en producción:** el 2FA real del titular impide simularlo. El alta se verificó en local con el mismo código desplegado.
- **Roles y módulos con prueba automática pero no simulados:**
  - Coordinador, gerente en el navegador, multisede.
  - Club, reseñas, traspasos y la agenda del coach (gimnasio).
  - Pagos a alumnos.
- **Carga y concurrencia** con muchos usuarios a la vez.

## Datos que dejó la simulación (sólo en dev local)

- Coach Simulación (Carla, alumna Ana).
- Gym Simulación (dueño Diego con 2FA, sala Pablo, recepción Rita, socia Sara).
- Clientes Urko Uruzuna (borrador) y Gym Prueba Sur (regularizado).
- Un «Programa sin nombre» del coach.

Nada se creó en producción.
