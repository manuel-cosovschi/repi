# REPI Control · limitaciones y costos

## Limitaciones conocidas

| Tema | Situación | Cómo seguir |
| --- | --- | --- |
| **Socios sin cuenta** | La pantalla necesita un socio con cuenta en el gimnasio (`gym_member`), porque ahí se asignan los programas. Quien nunca abrió REPI hace el alta una vez por el QR de la sede, una invitación o recepción. Después no necesita la app, el email ni la contraseña. | Si el titular lo pide: «socio gestionado» sin email, creado por recepción. Es una identidad sin acceso propio y requiere decisión de producto y de privacidad (D213). |
| **Registro de series en la pantalla** | La pantalla es sólo de consulta, como pidió el máster: no registra nada. Lo realizado se registra en la app, si el socio la usa. | — |
| **Demostraciones** | Muestra los videos que subió el gimnasio (URL firmada) y los enlaces como QR. Si el gimnasio no cargó demostraciones, no hay. La demo no trae videos. | — |
| **Cambio manual de ejercicio «sólo por hoy»** | Sigue permitido en modo supervisado: es registrar lo que realmente hizo (máquina ocupada). No cambia el programa. Lo bloqueado es que REPI lo proponga o lo aplique. | Si el titular quiere bloquearlo también, es un cambio chico en `setExerciseChange`. |
| **Avisos al socio** | Si el gimnasio pasa a supervisado, el socio lo ve al abrir la app (nota en Entrenar). No hay push ni email del cambio. | Opcional: novedad de REPI por gimnasio. |
| **Identificación** | Sólo código y PIN. Sin NFC, carnet con QR ni lector biométrico. | El carnet digital (`RC1`) podría servir como factor futuro; requiere diseño. |
| **Dispositivos** | Probado en Chromium (tablet, teléfono y escritorio, emulados). No probado en un iPad, una tablet Android ni un monitor táctil reales. | Probar en el equipo real del primer gimnasio antes de activarlo. Wake Lock y pantalla completa dependen del navegador. |
| **Pausa por intentos** | La pausa de la pantalla vale por equipo. Alguien con muchos equipos autorizados podría sumar intentos, pero cada código igual se pausa a los 5 y se anula a los 10. | — |
| **Escala** | El kiosco hace 2 o 3 consultas livianas por identificación. Sin prueba de carga. | — |
| **Dossier y precios** | El dossier muestra un escenario ilustrativo («$30.000 + $95 por socio activo»), como pidió el máster. CLAUDE.md dice «tarifa por cliente y total acordado, no activaciones». | **Revisar la frase «por socio activo» antes de compartir.** El precio se edita en el bloque «DATOS EDITABLES» de `marketing/dossier/repi-control/dossier.html`. |

## Costos

| Concepto | Costo |
| --- | --- |
| Infraestructura | Ninguno nuevo. Mismas tablas, la misma base y el mismo hosting (Vercel Hobby, Supabase). Sin servicios ni dependencias nuevas. |
| IA | Ninguno. El modo supervisado **reduce** el uso de IA: bloquea la IA del socio. La pantalla no usa IA. |
| Música de los films | Gratis, con licencia CC BY 4.0 (Kevin MacLeod). La atribución está en /creditos y en el reproductor. |
| Producción de videos y dossier | Herramientas locales: HyperFrames vía npx en caché, Chromium y ffmpeg. Sin servicios pagos ni voces. |
| Hardware | A cargo del gimnasio: tablet o monitor táctil, soporte y wifi. |
