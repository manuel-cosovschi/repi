# REPI — Guion de presentación y demo

Versión 27/10/2026. Los pasos se basan en la demo y los menús implementados; no constituyen una nueva prueba del sitio publicado.

## Preparación

- Abrir [repiclub.com/demo](https://repiclub.com/demo) o, desde Acceso, «Probá REPI sin cuenta».
- Elegir uno de los cuatro perfiles. Cada visita genera un entorno ficticio propio; el borrado está programado a las seis horas. No cargar nombres, salud, videos ni correos de clientes reales en esa demo.
- Usar una ventana o perfil de navegador separado de la cuenta operativa: la demo abre su propia sesión.
- Comprobar el recorrido antes de la reunión. Si no carga, usar capturas identificadas como ejemplo; no mostrar datos reales de otra organización.
- Los identificadores de organización cambian en cada demo. Navegar con el menú; no guardar una URL de un gimnasio ficticio como acceso de un cliente.
- La guía avanza con «Siguiente». No comprueba automáticamente que se haya realizado cada acción sugerida.

## Gimnasio — recorrido de unos 8 minutos

**Apertura sugerida:** «Te muestro cómo entra un socio, cómo lo atiende el equipo y cómo sigue su entrenamiento. Después vemos qué tendría que hacer tu recepción para ponerlo a funcionar».

| Paso | Dónde entrar | Qué hacer y explicar |
| --- | --- | --- |
| 1. Vista del dueño | Demo → Dueño o gerente → Ejecutivo | Mostrar información por sede. Aclarar qué mide cada indicador; los números son ficticios. |
| 2. Alta controlada | Solicitudes de acceso | Abrir la solicitud de Camila. Aprobar indicando un método de validación sólo dentro de la demo. Explicar que el QR solicita acceso y una persona del equipo decide. |
| 3. QR de recepción | Accesos y QR | Mostrar el QR fijo por sede, Descargar, Regenerar y Desactivar. No regenerar un QR real durante una presentación. |
| 4. Equipo | Equipo y servicio | Mostrar tareas, tiempos y reseñas con su contexto. No presentar resultados deportivos como prueba de calidad del empleado. |
| 5. Comunicación del gym | Comunidad | Mostrar novedades, descuentos y desafíos. La cuota del gimnasio y un checkout de productos no forman parte de este módulo. |
| 6. Condiciones | Condiciones REPI | Separar cantidad acordada, precio unitario y accesos habilitados. La cuenta no se calcula por descargas ni por personas que abrieron la app ese mes. |
| 7. Trabajo en sala | Probar otro perfil → Entrenador de sala → Mi turno | Mostrar el aviso de Julián y tocar «Voy». Abrir Cola de asistencia y Traspaso de turno para explicar cómo se reparten lo pendiente. |
| 8. Vista del socio | Probar otro perfil → Alumno o socio | Mostrar Inicio, Entrenar, Progreso, Mensajes y Gym. Señalar que el coach privado y el gimnasio conservan sus contextos. |

**Frase para el alta:** «Si el entrenador no puede usar su teléfono, recepción ve la misma solicitud. El gimnasio sigue siendo quien confirma que esa persona es socia».

**Frase para la comunidad:** «Cada socio elige si participa y qué progreso publica. Compartir información con su entrenador no la vuelve pública».

**Cierre sugerido:** «Para ponerlo a trabajar necesitamos definir las sedes, quién aprueba las altas, quién mantiene las bajas y el total de socios del acuerdo. Con eso te preparo una propuesta concreta».

## Personal trainer — recorrido de unos 7 minutos

**Apertura sugerida:** «Te muestro el circuito de un alumno: invitación, programa, entrenamiento, seguimiento y registro de cobros».

| Paso | Dónde entrar | Qué mostrar |
| --- | --- | --- |
| 1. Prioridades | Demo → Personal trainer → Panel | Actividad y pendientes a atender. Los datos del ejemplo son ficticios. |
| 2. Ficha | Clientes → Valentina | Resumen, Rutinas y Rendimiento. El 1RM es una estimación de Epley calculada a partir de registros; no es una medición física ni un diagnóstico. |
| 3. Programa | Programas | Abrir un programa, revisar días y ejercicios, duplicar o modificar en la demo. Mostrar versión y asignación; no afirmar que toda opción del handoff ya existe. |
| 4. Pedido | Solicitudes | Abrir un pedido de técnica y mostrar cómo se responde o resuelve. |
| 5. Conversación | Mensajes | Chat privado de esa relación. No mostrar mensajes de un cliente real para vender a otro. |
| 6. Cobros | Cobros a alumnos | Crear un cargo ficticio y registrar su pago en la demo. Es un registro manual: la app no mueve dinero ni emite comprobante fiscal. |
| 7. Alumno | Probar otro perfil → Alumno o socio → Entrenar | Empezar una sesión ficticia, cargar una serie y explicar descanso, RIR y sensación. Finalizar sólo si se completó el recorrido; la celebración depende del cierre confirmado. |

**Frase sobre privacidad:** «El alumno decide qué información sensible comparte con vos. Tenerlo como cliente no habilita automáticamente todos sus datos».

**Cierre sugerido:** «El acuerdo contempla todos tus alumnos vigentes, aunque algunos todavía no hayan activado la app. El precio por alumno se negocia con vos y queda registrado».

## Qué decir con precisión

| Evitar | Decir |
| --- | --- |
| «Todo funciona offline». | «El núcleo del entrenamiento guarda en el teléfono y sincroniza al volver la conexión. Altas, mensajes y comunidad requieren red». |
| «El aviso siempre llega al celular». | «Hay avisos push cuando el dispositivo los permite y están activados; lo pendiente sigue en la bandeja». |
| «Ya está en App Store». | «La primera versión es web y se agrega a la pantalla de inicio. Las tiendas quedan para una etapa posterior». |
| «El QR demuestra que sos socio». | «El QR identifica la sede; el equipo valida tu acceso». |
| «Te cobro según los que usan la app». | «Se cobra según el total de socios o alumnos vigente acordado, con precio negociado». |
| «Body Intelligence te diagnostica». | «Las capacidades de Body Intelligence se incorporan por etapas y no se venden como diagnóstico». |

## Referencia de navegación para soporte

Acceso: `/acceso`. Demo: `/demo`. Ayuda de instalación: `/instalar`. Alumno: `/app`. Selector de espacios: `/acceso?step=workspace`. Gym: `/gym/{orgId}`; Coach: `/coach/{orgId}`; Admin: `/admin`. Las tres últimas requieren la sesión y permisos correspondientes.

Las secciones del gym y del coach se eligen desde sus menús. La URL conserva parámetros de navegación, pero no otorga permisos. Los enlaces de invitación son personales y no deben pegarse en material público.
