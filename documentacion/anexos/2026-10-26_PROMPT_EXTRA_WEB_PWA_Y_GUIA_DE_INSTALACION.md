# REPI — Lanzamiento web y guía para agregar a inicio

26/10/2026 · Anexo para el desarrollo en curso · Concepto 2 aprobado.

Incorporá este anexo al `MASTER_PROMPT.md` y al anexo `2026-10-26_PROMPT_EXTRA_ACCESO_ALTAS_Y_FACTURACION.md` de esta misma carpeta. Conservá las decisiones comerciales, altas por aprobación y funcionalidades del handoff vigente. Este documento es una especificación adicional, no evidencia de implementación terminada.

## Decisión confirmada por el usuario

La primera versión de Repi será web. En computadoras se usará desde el navegador; en teléfonos, como web app agregada a la pantalla de inicio. Al escanear un QR de gimnasio o abrir un enlace de invitación, la persona llega a la web de Repi y ve una guía interactiva para agregarla a inicio **antes de registrarse o iniciar sesión**. Luego continúa con el flujo de acceso correspondiente.

Una vez que Repi esté funcionando satisfactoriamente en varios gimnasios y con varios entrenadores personales, el usuario quiere lanzar versiones en App Store y Google Play. Esa distribución corresponde a una etapa futura; no reemplaza ni condiciona el lanzamiento web.

## Experiencia inicial y guía

1. Abrir QR/enlace en una ruta pública de entrada que pueda mostrar la guía sin una cuenta ni sesión. Reconocer el origen: solicitud Gym/sede, invitación de alumno, staff o responsable comercial. Mostrar únicamente información pública o mínima de la invitación; no revelar datos personales del destinatario antes de verificar su identidad.
2. En móvil, presentar una introducción breve con la marca aprobada: “Agregá Repi a tu pantalla de inicio” y una explicación sencilla del acceso mediante el ícono. Usar “Agregar a inicio” o “Instalar Repi”, según la capacidad real del entorno, sin simular una descarga de tienda.
3. Adaptar los pasos al dispositivo y navegador, con imágenes o ilustraciones fieles, avance/retroceso, texto accesible y alternativa para elegir manualmente iPhone/Android si la detección es incorrecta. La guía puede explicar controles del navegador; no puede manipularlos ni dibujar un botón falso del sistema que prometa instalar.
4. Al abrir Repi desde el ícono, continuar hacia el alta o login y recuperar el contexto del ingreso. Una vez identificado el usuario, respetar invitación, aprobación, estado del vínculo y permisos existentes.

Propuestas de experiencia para resolver casos reales:

- Ofrecer “Continuar en el navegador” sin obligar a terminar la instalación. La guía sigue apareciendo antes del primer acceso móvil por esos enlaces; agregar a inicio se recomienda, pero no equivale a aprobar la membresía ni debe bloquear la recuperación de una cuenta.
- No repetir la introducción en cada acceso ni interrumpir una sesión de entrenamiento. En modo app/standalone ir directamente al paso pendiente o espacio autorizado. Desde el navegador, recordar que la guía fue omitida o vista sin afirmar por ello que la app está instalada.
- En escritorio, continuar al acceso web y ofrecer opcionalmente un QR/enlace para abrir en el teléfono. No imponer instrucciones de teléfono al panel de recepción.
- Mantener una opción “Cómo agregar Repi a inicio” en ayuda/configuración para consultarla después.
- Dar acceso prioritario a recuperación de cuenta, enlaces de verificación y pasos de seguridad. No consumir ni hacer vencer un enlace por obligar a recorrer una guía; conservar el contexto y respetar su vencimiento real.

Estas opciones son recomendaciones de este anexo; la decisión humana confirmada es web primero y guía antes del alta/login móvil.

## Variantes por plataforma

- iPhone/iPad: explicar el menú para compartir y “Agregar a la pantalla de inicio”; cuando corresponda a la versión, indicar la opción para abrir como web app. Verificar textos y posiciones en las versiones soportadas. No prometer un diálogo de instalación programático universal ni pedir permisos push durante la guía inicial.
- Android y navegadores compatibles: ofrecer el botón propio de instalación únicamente cuando el navegador entregue la capacidad real (`beforeinstallprompt`). Si no está disponible, mostrar los pasos manuales adecuados; su ausencia no prueba que la app esté instalada. Un rechazo permite continuar y no dispara diálogos repetidos.
- Navegadores internos de mensajería, correo o redes: explicar cómo abrir en un navegador compatible y permitir copiar el enlace de continuación. No garantizar que un botón pueda abrir siempre una app externa; conservar la alternativa manual.
- Modo privado, entorno incompatible, pantalla pequeña, lector de pantalla y conexión interrumpida: dar instrucciones y salida útiles. La guía debe poder navegarse por teclado, respetar reduced-motion y no depender sólo de dibujos.

No confundir un acceso directo que abre el navegador con una PWA que abre en modo independiente. Detectar capacidades, verificar el resultado disponible y utilizar lenguaje acorde. Un clic en “Ya lo agregué” sólo expresa una acción del usuario; no acredita instalación ni concede acceso.

## Conservar gimnasio e invitación al cambiar de contexto

Este es un criterio obligatorio: instalar/agregar a inicio no debe dejar a la persona sin una forma de retomar su alta.

No asumir que el navegador inicial, el navegador externo y la app instalada comparten cookies, almacenamiento o sesión en todos los dispositivos. No depender únicamente de `localStorage` o de los parámetros de la primera URL. Probar el lanzamiento desde el ícono y el cambio entre esos contextos.

Mantener una identidad de aplicación y punto de inicio estables. No crear una app distinta por gimnasio ni colocar tokens personales, OTP, credenciales o datos privados en `id`, `start_url` o manifiestos públicos/cacheables. El contexto de entrada debe recuperarse sin convertirlo en autorización.

Implementar continuidad automática cuando sea verificable y una recuperación explícita cuando no lo sea:

- Gym: conservar el identificador público de gimnasio/sede. Si se pierde al abrir desde inicio, permitir recuperar el destino con el código público de esa sede o reescaneando el QR desde el flujo de alta. El código sólo localiza la sede; la aprobación humana sigue siendo obligatoria.
- Invitación personal: después de verificar el mismo correo del destinatario, permitir retomar las invitaciones pendientes válidas desde el servidor, o introducir el código de invitación vigente. Exigir los mismos controles de destinatario, caducidad, revocación y consumo único que en el acceso por enlace.
- Si se usa un identificador de continuación, debe ser opaco, acotado en tiempo y alcance, y no otorgar por sí mismo membresía ni sesión. Restringir redirecciones a destinos internos autorizados. No consumir la invitación al renderizar la guía, instalar la app, previsualizar un enlace o abrirlo desde un cliente de email.
- Si ya había una solicitud enviada, volver a ella sin duplicarla. Si existe una cuenta o membresía, recuperarla sin exigir otro registro. No mezclar contexto de gimnasios si la persona abre dos enlaces diferentes: mostrar el destino y permitir confirmar cuál quiere continuar.

No prometas continuidad automática idéntica en todos los navegadores. El resultado aceptable es continuidad comprobada o recuperación guiada, sin perder derechos ni conceder acceso por el hecho de instalar.

## Integración con el código existente

La lectura puntual del 26/10 encontró `apps/web/src/app/manifest.ts`, `apps/web/public/sw.js` y experiencia móvil en `components/member`. El manifiesto observado arranca en `/app` y declara un ícono de 162 px; D35 registra pendientes de íconos. No se encontró una guía de instalación en la búsqueda de ese momento. Verificá el código actual antes de modificarlo: hay desarrollo concurrente.

- Resolver una entrada pública y el inicio sin sesión para que no terminen en 404, un espacio incorrecto o un bucle entre guía y login. Respetar sesiones existentes y los accesos directos a pasos pendientes.
- Completar el manifiesto, referencias desde las páginas, alcance, identidad estable, presentación standalone y assets de instalación adecuados a los navegadores objetivo. Validar dimensiones y calidad reales de íconos; no declarar tamaños que el archivo no tiene. Mantener Concepto 2 sin redibujar el logo. Usar los assets aprobados adecuados o registrar con precisión cuál falta y qué prueba impide cerrar.
- No declarar instalación lista sólo por tener un manifiesto y un service worker. Verificarla con HTTPS en un entorno de prueba y con dispositivos reales compatibles.
- Reutilizar el service worker y la cola offline existentes. No cachear tokens, códigos de verificación, datos de otra persona ni respuestas privadas en la página pública de instalación. Revisar actualizaciones y aislamiento de caché sin romper entrenamientos pendientes.
- Una actualización de la web no debe exigir reinstalar el ícono ni destruir datos pendientes. Ofrecer aplicar una actualización en un momento seguro si la versión puede afectar una sesión en curso.
- Mantener registro/login, aceptación de invitación y aprobación de socios como operaciones que requieren conexión al servidor. No simularlas offline.

## Notificaciones para piso y recepción

La instalación y el permiso de notificaciones son pasos distintos. Después de que un miembro del staff esté identificado y autorizado, explicarle por qué activar avisos de solicitudes y ofrecer una acción explícita para habilitarlos. Detectar compatibilidad y, si hace falta, mostrar cómo abrir la PWA desde inicio.

En iOS/iPadOS, Web Push está documentado para web apps agregadas a inicio y requiere permiso solicitado a partir de una acción del usuario; verificar compatibilidad vigente al integrar. No garantizar recepción por el hecho de tener el ícono. Recepción mantiene su bandeja funcional aunque el entrenador no haya instalado la PWA, no permita avisos o tenga el teléfono apagado.

Para socios, pedir permisos sólo en el momento en que aportan una utilidad clara, con opción de rechazarlos. No bloquear entrenamiento ni alta por no permitir push.

## Preparación razonable para las tiendas futuras

Conservar cuentas, organizaciones, relaciones, contratos, datos y permisos en el backend compartido. Mantener reglas de negocio reutilizables y contratos de API claros, evitando que sólo funcionen desde componentes web. Mantener las capacidades de dispositivo detrás de adaptadores cuando existan: cámara, notificaciones, archivos y enlaces de entrada.

Preparar enlaces HTTPS estables para QR e invitaciones, de modo que más adelante puedan abrir la web o una app instalada según disponibilidad. No implementar ahora rutas de tienda, badges, binarios, dos apps nativas ni integraciones innecesarias. Tampoco elegir prematuramente un framework móvil ni afirmar que todo el frontend se reutilizará sin adaptaciones.

Cuando se decida pasar a tiendas, evaluar con el producto real si conviene una solución híbrida o nativa, comprobar permisos, enlaces, notificaciones, autenticación y experiencia móvil, y revisar las reglas entonces vigentes. La aprobación de tiendas no está garantizada por empaquetar la web. La versión web y los paneles de escritorio deben seguir funcionando, con las mismas identidades y datos.

## Pruebas y entrega

Agregar este alcance al inventario, decisiones, contrato visual y plan. Marcar como confirmados el lanzamiento web y la guía previa; distinguir las propuestas de experiencia y la distribución futura. Implementar sobre el código existente, sin reiniciar ni reemplazar la autenticación.

Criterios de aceptación:

1. QR de Gym y enlaces de alumno/staff/cliente comercial presentan la guía antes del primer registro/login móvil y conservan el destino correcto.
2. iPhone/iPad, Android y navegador interno tienen instrucciones pertinentes y salida útil si la instalación no está disponible.
3. El botón de instalación sólo invoca una capacidad real; aceptar, rechazar o no recibir el evento no provoca bucles ni afirma éxitos inexistentes.
4. Lanzar desde inicio funciona con y sin sesión. Se omite la guía cuando corresponde y se conserva o recupera el contexto mediante los mecanismos previstos.
5. Invitaciones se recuperan sólo tras verificar el destinatario; abrir guía, instalar o previsualizar no las consume. Vencidas/revocadas no se reactivan.
6. Cambiar entre dos gimnasios o enlaces no mezcla solicitudes, roles ni permisos; reabrir una solicitud no la duplica.
7. “Continuar en el navegador”, ayuda posterior, recuperación de cuenta y escritorio funcionan sin exigir instalación.
8. El contexto de continuación no habilita acceso ni acepta redirecciones externas; manifiesto, logs y cachés no exponen credenciales de invitación.
9. Ícono, nombre, presentación y pantalla inicial conservan Concepto 2, con assets reales de calidad suficiente y dimensiones comprobadas.
10. Actualizar la web/service worker conserva la sesión de entrenamiento y operaciones pendientes conforme a la política de sincronización.
11. Push se solicita en el momento adecuado a personal autorizado; rechazo/incompatibilidad deja funcionando la bandeja de recepción.
12. Pruebas en dispositivos reales distinguen instalación, apertura desde inicio y entrega real de push. Informar modelos/entornos, resultados y límites. Una captura responsive de escritorio no prueba esos comportamientos.

Entregá el delta implementado, evidencias y pendientes concretos. No publicar en tiendas ni afirmar que la app fue aprobada como parte de esta tarea.

## Fuentes técnicas

- [MDN: instalación de PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- [MDN: disponibilidad y uso de beforeinstallprompt](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event).
- [Apple: agregar un sitio a la pantalla de inicio](https://support.apple.com/guide/iphone/bookmark-a-website-iph42ab2f3a7/ios).
- [WebKit: Web Push en iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- [Apple: requisitos de funcionalidad para App Store, apartado 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality).

Verificadas al redactar; revisar la documentación vigente durante la implementación y antes de una futura distribución en tiendas.
