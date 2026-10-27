# REPI — Retomar acá

Actualizado: 27/10/2026, preparación de continuidad. Máster activo: ../../MASTER_PROMPT.md.

## Objetivo inmediato

Cerrar una primera versión web/PWA utilizable por gyms y coaches cuanto antes; completar después el resto. No reconstruir núcleo, G · Atlética ni M01–M05 si las pruebas del código actual confirman que funcionan.

## Snapshot

Commit observado al inicio: 25ea04a3b9263bbd797aed3c09b97168b698d773. En esta revisión se cambiaron documentos y se agregaron docs/continuidad/; no se cambió código de producto ni DB. El directorio documentacion/historial/2026-10-27_antes_de_continuidad/ conserva entradas anteriores. Git puede mostrar esos cambios sin commit; respetarlos. Releer Git al arrancar por posible trabajo posterior de Claude.

## Primera acción concreta

1. Leé el máster y ESTADO_ACTUAL.md, revisá Git y las rutas de acceso/PWA.
2. Confirmá si ya hay guía de instalación/continuidad agregada después de este snapshot. Si falta, implementá el corte PWA previo al login conforme al anexo: guía por dispositivo, conservar/recuperar invitación/QR, salida navegador y acceso desde inicio. Reutilizá auth/service worker; no crear una app nueva.
3. Si ya está resuelto, siguiente bloqueo: mailer productivo (el inspeccionado falla en producción). Prepará un adaptador y configuración verificable; credenciales y proveedor requieren decisión del titular, no inventarlas.
4. Antes de pruebas de integración, revisá/endurcé la guarda de TEST_DATABASE_URL, porque global-setup borra esquemas. Durante la preparación documental no se ejecutó esa suite.
5. Continuá por los gates V1 y dejá evidencia. No dediques el bloque inicial a BI experimental ni a repetir motion.

## Bloqueos externos conocidos

Proveedor/remitente email, dominio/hosting/DB/almacenamiento durable, claves push productivas y teléfonos, textos/menores/retención, condiciones de cobro/corte/piloto. Ver DECISIONES_PENDIENTES.md. Implementar trabajo independiente mientras se concretan; no declarar lanzamiento por pasar pruebas simuladas.

## Pruebas de esta revisión

Se revisó documentación/código de forma acotada y se verificará la integridad de este paquete documental. No tests/build de la app, no migraciones, no correos externos, no despliegue. Los números de tests del desarrollador anterior son históricos y se deben distinguir de una ejecución nueva.

## Plantilla de actualización al cerrar cada bloque

- Fecha, objetivo y commit actual:
- Cambios sin commit y archivos tocados:
- Comportamiento real logrado / limitaciones:
- Comandos ejecutados, entorno y resultados:
- Migraciones y compatibilidad de datos/cola:
- Dependencias/configuración nuevas (sólo nombres, sin secretos):
- Decisiones confirmadas / propuestas / pendientes:
- Gates de lanzamiento que cambian de estado y evidencia:
- Próxima acción concreta y archivos de entrada:
- Servicios activos necesarios (puertos/propósito, sin credenciales):
