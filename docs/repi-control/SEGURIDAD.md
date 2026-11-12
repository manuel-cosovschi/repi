# REPI Control · seguridad de la pantalla de rutinas y de la política

## Qué se protege

- El programa de cada socio: se ve sólo después de identificarse, y sólo el propio.
- Los datos privados (salud, molestias, historial, cargas pasadas, contacto, apellido completo): **nunca** salen por la pantalla.
- La planificación del gimnasio: en modo supervisado, el socio y la IA no la cambian por ningún camino (botón, API, chat, servicio).

## Amenazas y controles

| Amenaza | Control |
| --- | --- |
| Alguien abre la pantalla en otro equipo | La API exige el secreto del equipo: 32 bytes al azar, del que la base guarda sólo el hash. Va en el encabezado `x-repi-kiosk`, nunca en la URL de un pedido. El enlace de alta lo trae en el fragmento (`#k=`), que no llega al servidor ni a sus registros, y la página lo quita de la barra al cargar. Una pantalla revocada recibe 401 en el pedido siguiente y se borra el secreto del equipo. |
| Reusar la credencial del QR de ingreso o del ranking | Otra tabla (`gym_kiosk`), otro encabezado y otro prefijo de servicio. Un secreto de una pantalla de ingreso o de ranking no autoriza la de rutinas, ni al revés. |
| Adivinar el código y el PIN | Sólo desde una pantalla autorizada, que tiene límite por IP (30 por minuto). Cada código tiene 6 dígitos al azar, único entre los vigentes del gimnasio; el PIN, 4 a 6 dígitos. Con 5 fallos seguidos el código se pausa 15 minutos; con 10 se anula hasta que el personal emita otro. La pantalla se pausa 5 minutos tras 15 fallos en 10 minutos. Si el código no existe, el mensaje es el mismo y el tiempo de respuesta, parecido (scrypt contra un hash ficticio). |
| Robo de la base | El PIN se guarda con scrypt (N = 16384) y una clave derivada del secreto del servidor: con la base sola no se pueden probar PIN fuera de línea. Los secretos de pantalla y los tokens de consulta se guardan sólo como hash. |
| La persona siguiente ve los datos de la anterior | Una consulta por pantalla: identificarse cierra la anterior en el servidor. Cierre por «Terminar», a los 60 segundos sin uso (con aviso previo), al ocultarse la pestaña y, en el servidor, a los 5 minutos sin pedidos (cada pedido la estira, con un tope de 20 minutos desde que se identificó). Al cerrar se borra también el borrador sin confirmar. El token vive sólo en la memoria de la página (nunca en almacenamiento) y se borra todo el estado de la persona. No hay navegación ni enlaces a otras partes de REPI. |
| Cachés del navegador o compartidas | `Cache-Control: private, no-store` en `/rutinas` y `/api/kiosk/*` (configuración de Next y en cada respuesta), y `X-Robots-Tag: noindex`. |
| Ver datos de otro gimnasio | La credencial se busca dentro del gimnasio de la pantalla y la consulta queda atada a esa pantalla. Un token de otra pantalla da 401. |
| Socio dado de baja, credencial revocada o reemitida | Se comprueba en cada pedido: la consulta termina y el código deja de servir. |
| Demostraciones en video | Los videos subidos por el gimnasio se sirven con una URL firmada (HMAC) atada a la consulta abierta y a su vencimiento. Los enlaces externos se muestran como QR para el celular, no como enlace, así la pantalla no navega fuera. |
| El socio crea, importa o ejecuta rutinas en un gimnasio supervisado | Bloqueo en el servidor (`assertMemberAuthoring`) con 403 `supervised` y auditoría `routine_policy.blocked`, sin datos personales. Cubre rutinas propias (crear, duplicar, importar vista previa y guardado, entrenar), ejercicios propios, `startSoloRoutine` (rutina propia o de REPI), «Quiero entrenar por mi cuenta» con IA, «No vino el profe» (reglas e IA) y las acciones del cerebro que cambian lo prescrito (`SUPERVISED_BLOCKED`, incluso con autonomía 2). |
| Registrar sin una identidad válida o en el entrenamiento de otro (D216) | Cada escritura revalida el equipo, la consulta y la credencial (`liveSession`) y que el entrenamiento sea del socio identificado **y** de ese gimnasio. Otro socio recibe 404; sin consulta, 401. Revocar la pantalla o la credencial o deshabilitar el kiosco corta la escritura siguiente. |
| Reintentos y doble toque (D216) | Cada serie lleva un id que genera la pantalla y conserva en el borrador: un reintento no duplica. El botón se bloquea mientras guarda y «Guardado» aparece sólo con la respuesta del servidor. |
| Cambiar la planificación desde la pantalla (D216) | No hay ruta para eso: sólo se registran resultados (`set_log`, `set_skip`) de filas del plan vigente de la sesión. Series fuera del plan o de otro día se rechazan. |
| Personal que ya no trabaja ahí conserva permisos con la pantalla abierta | `gymContext` lee `staff_membership.status = 'active'` en cada pedido. Revocar no espera a que cierre sesión (STF-09). |

## Lo que ve cada uno

| Quién | Ve |
| --- | --- |
| Pantalla, sin identificar | Nombre del gimnasio y la sede, el QR opcional de la app |
| Pantalla, socio identificado | Nombre y la inicial del apellido; programa vigente: nombre, versión, fecha, semanas, indicaciones, días, ejercicios, prescripción, descanso, notas del equipo y demostraciones. D216: por serie, la sugerencia de REPI (con una explicación neutra si el motor la ajustó por una señal de salud) y la última vez comparable; al registrar, las series del entrenamiento abierto en ese gimnasio. Nunca notas personales, sensaciones, molestias, chats ni fotos |
| Recepción, gerencia o dueño | El código vigente del socio y si está pausado. El PIN, sólo una vez, al emitirlo |
| Socio en la app | Su código. Puede cambiar su PIN (4 a 6 números, sin repetidos ni seguidos; 5 cambios por hora) |

## Auditoría

| Acción | Eventos |
| --- | --- |
| Política del gimnasio | `routine_policy.supervised`, `routine_policy.open` |
| Pantalla habilitada o no | `kiosk.enabled`, `kiosk.disabled` |
| Pantallas | `kiosk.device_created`, `kiosk.device_revoked` |
| Credenciales | `kiosk.credential_issued`, `kiosk.credential_reissued`, `kiosk.credential_revoked`, `kiosk.pin_changed` |
| Uso de la pantalla | `kiosk.identified`, `kiosk.identify_failed` (con el id de la credencial, sin datos personales) |
| Registro en la pantalla (D216) | `kiosk.workout_started`, `kiosk.sets_logged` (series guardadas, omitidas y en conflicto), `kiosk.workout_finished`, con la pantalla y la credencial; `set_log.kiosk_id` y `workout_session.kiosk_id` |
| Bloqueos de la política | `routine_policy.blocked` (con el tipo de acción) |
| Personal | `staff.revoked`, `staff.role_changed` |

## Fuera de alcance

- **Una persona mirando por encima del hombro.** El PIN se muestra con puntos. Igual se recomienda ubicar la tablet de forma
  que no se vea el teclado desde atrás.
- **Una tablet robada que sigue autorizada.** El gimnasio la revoca desde el panel. Mientras tanto sólo sirve con códigos y PIN
  válidos, y no guarda datos de personas.
- **Los límites por IP.** Toman el primer `x-forwarded-for`, que en Vercel pone la plataforma.
