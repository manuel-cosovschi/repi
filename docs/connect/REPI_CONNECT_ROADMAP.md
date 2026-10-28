# REPI Connect · Roadmap

Actualizado: 28/10/2026 (D126).

## CORE — primera entrega (implementado, sin desplegar)

Crear pedido (Inicio y desde el ejercicio) · bandeja «Sala» · tomar con bloqueo · atender · registrar · seguimiento propio o para el próximo turno · transferir con aceptación · resolver con mensaje al socio · cancelar (socio y gestión) · estado y línea de tiempo del socio · «¿Te sirvió?» · disponibilidad declarada · avisos internos y push (nuevo, esperando, traspaso, seguimiento por vencer, resuelto) · tablero «Seguimiento de sala» · bandera por gimnasio · datos demo · pruebas.

## Limitaciones conocidas del Core

- Los motivos son fijos para todos los gimnasios (configurables por gimnasio queda para PLUS).
- Umbrales fijos: aviso a los 15 minutos sin tomar y seguimiento por vencer a 24 h.
- Al pedir ayuda desde un ejercicio reemplazado en esa sesión, el contexto toma el nombre del ejercicio del programa (no el reemplazo).
- El tablero calcula sobre hasta 5.000 pedidos por período y sede seleccionada.
- El socio sólo puede tener pedidos activos en la sede de su membresía principal (o donde recepción registró su ingreso si lo pide entrenando).
- Push depende de VAPID configurado y del teléfono; la bandeja y el centro de avisos son la fuente de verdad.

## PLUS — después del piloto

Motivos y prioridades configurables por gimnasio · reglas de asignación (por turno, por especialidad) · horarios complejos e integración con la grilla de turnos para sugerir destinatario · traspasos automáticos al cerrar turno · seguimientos programados recurrentes · encuesta breve configurable · analítica avanzada (por motivo, franja horaria, socio nuevo vs. antiguo) · preferencias de avisos por tipo.

## AI — futuro, con revisión humana

Resumen asistido del historial de un socio para el profesor que lo recibe · sugerencias de organización de la bandeja · detección de socios que piden ayuda seguido · integración con Adaptive Coach y Repi Proactivo. Requisitos antes de empezar: reglas de seguridad escritas, revisión humana obligatoria, sin datos de salud, costos por gimnasio acotados y opción de apagarlo.
