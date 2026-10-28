# REPI Connect · Roles y permisos

Actualizado: 28/10/2026 (D126). Todo se autoriza en el servidor por capacidad y sede (`gymContext`, `need`, `scopedLocation`); la interfaz sólo oculta lo que el servidor igual rechazaría.

| Acción | Socio | Entrenador de sala | Coordinador | Gerente | Dueño | REPI Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Crear pedido | Sí (sólo en sus gimnasios con Connect) | — | — | — | — | — |
| Ver sus pedidos, línea de tiempo y resultado | Sólo los propios | — | — | — | — | — |
| Comentar un pedido abierto | Sólo los propios | — | — | — | — | — |
| Cancelar | Propio, mientras nadie lo atiende | No | Cualquiera activo, con motivo | Igual | Igual | — |
| «¿Te sirvió?» | Una vez, con el pedido resuelto | — | — | — | — | — |
| Ver bandeja «Sala» y detalle con contexto | — | Su sede | Sus sedes | No | No | No |
| Tomar, atender, registrar, seguimiento, transferir, resolver | — | Con turno o permiso fuera de turno | Igual | — | — | — |
| Aceptar o rechazar un traspaso | — | Sólo quien lo recibe | Igual | — | — | — |
| Disponible / Ocupado | — | Con turno iniciado | Igual | — | — | — |
| «Seguimiento de sala» (sólo números) | — | No | Sus sedes | Su sede | Todas | — |
| Activar o desactivar el piloto | — | — | — | — | — | Sí |

## Lo que nadie del gimnasio ve por Connect

- Chats del socio con su coach privado, ni los del equipo de sala (siguen en «Mensajes», D40).
- Sesiones y series del programa de un coach privado: si el pedido sale de ese entrenamiento sólo queda el nombre del ejercicio.
- Salud, fotos, medidas, nutrición o laboratorios. Los formularios avisan si el texto parece tener datos de salud.
- Notas personales del entrenador (`gym_note` personal).

## Gestión

El dueño y la gerencia no abren el detalle de un pedido (responde «Tu rol no tiene acceso», prueba automática) y el tablero no incluye textos: sólo conteos, tiempos y estados. El uso por profesor se muestra en orden alfabético con la aclaración de que no es un ranking.

## Separación con Repi Coach

Los pedidos pertenecen a la organización del gimnasio donde se crean. Un coach que no es personal del gimnasio no entra a ninguna ruta de Connect (404). Un profesor que además tiene alumnos privados ve en la barra lateral en qué organización está; los pedidos del gimnasio nunca se convierten en tareas de su espacio de coach.

## Casos probados (tests/connect.test.ts)

Socio ajeno 404 · profesor de otra sede 404 · `organization_id` propio con tarea ajena 404 · `organization_id` ajeno 404 · coach privado 404 · dueño sin acceso al detalle · profesor sin acceso al tablero · el piso no cancela · el socio no resuelve · dos tomas simultáneas · reintento de red · cancelación durante una toma · historial no editable · bandera apagada.
