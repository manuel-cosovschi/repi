# REPI Connect · Seguimiento de sala

Actualizado: 28/10/2026 (D126). Estado: **Core implementado y probado en local, sin desplegar.** Pedido del titular: «REPI CONNECT — Sistema de asistencia, seguimiento y coordinación de entrenadores de piso» (chat 28/10/2026).

## Qué resuelve

El socio quiere un seguimiento más personal sin pagar un personal trainer. Los profesores de sala atienden a mucha gente en turnos distintos y no tienen una forma ordenada de saber quién pidió ayuda, qué se hizo y qué quedó pendiente. Connect une tres cosas: el pedido del socio, la coordinación del equipo entre turnos y la visibilidad del dueño sobre el servicio.

## Circuito (Core)

1. El socio toca «Pedir ayuda» (en Inicio o desde un ejercicio durante el entrenamiento), elige un motivo y, si quiere, deja un comentario breve. Recibe confirmación y ve el estado en «Mis pedidos».
2. El pedido llega a la bandeja «Sala» de su sede. Quienes están en turno reciben un aviso con texto mínimo (sin el nombre del socio).
3. Un profesor lo toma (nunca dos a la vez), lo atiende y consulta el contexto autorizado: ejercicio, series de esa sesión si es del programa del gym, últimas series, pedidos anteriores e historial institucional.
4. Registra lo que hizo. Puede dejar un seguimiento (para sí con fecha o libre para el próximo turno) o transferirlo a otro profesor con «qué se hizo / qué falta / próximo paso».
5. El siguiente profesor acepta el traspaso, continúa y resuelve con un registro obligatorio y, si quiere, un mensaje para el socio.
6. El socio ve «Resuelto por …» con ese mensaje y puede contestar «¿Te sirvió?» (optativo, una vez).
7. El dueño, la gerencia y la coordinación ven «Seguimiento de sala»: pedidos, resueltos, tiempos de primera atención y de resolución, seguimientos, traspasos, socios atendidos, opinión y evolución semanal. Sólo números.

## Qué no es

- No es un chat nuevo: el chat del equipo de sala con socios (D40) sigue igual.
- No es un servicio médico ni de emergencias. La hoja del socio lo dice siempre y refuerza la orientación si el comentario menciona dolor, mareo u otros síntomas; no genera recomendaciones médicas.
- No usa IA ni inventa urgencias: la prioridad es una regla visible (alta si el socio lo pidió durante su entrenamiento o necesita una rutina nueva).
- No muestra presencia de profesores al socio ni ubicación al equipo: la disponibilidad «Disponible / Ocupado» es la que declara cada profesor durante su turno.

## Activación

Por gimnasio, desde REPI Admin (ficha del cliente → «REPI Connect · seguimiento de sala» → «Activar piloto»), más un interruptor general (`connect` en `features.ts`). Apagado, el gimnasio vuelve a la cola de asistencia de siempre y nada se borra. La demo pública lo trae activo.

## Documentos

[Arquitectura](REPI_CONNECT_ARCHITECTURE.md) · [Roles y permisos](REPI_CONNECT_ROLES.md) · [Modelo de datos](REPI_CONNECT_DATA_MODEL.md) · [API](REPI_CONNECT_API.md) · [QA](REPI_CONNECT_QA.md) · [Demo de 3 minutos](REPI_CONNECT_DEMO.md) · [Roadmap](REPI_CONNECT_ROADMAP.md)
