# 12 · Experiencia Coach (REPI Coach)

Prototipo: `prototypes/REPI Desktop Coach.dc.html`. Responsive con sidebar full/rail/drawer.

- **Panel (SCR-C-01):** KPIs clicables; pendientes con acción directa (molestia reportada 4/10 → Salud; sin actividad → cliente; sin programa → crear; mensajes; programa que vence → duplicar; pago vencido); agenda del día con nota de turnos en gym.
- **Clientes (SCR-C-02):** split view; búsqueda, filtros, orden; ficha con 8 pestañas:
  - Resumen: alertas, stats, planificado vs hecho, objetivos.
  - Rendimiento: tabla de ejercicios clave (1RM estimado Epley, Δ, sparkline, mejor serie), series semanales por grupo vs plan, fortalezas/a mejorar (heurística determinista, revisable), check-in 14 días.
  - Rutinas: programa + registro de sesiones con notas del alumno.
  - Progreso: curva del ejercicio principal.
  - Salud (Grant): lesiones con restricción en programa, molestias 0–10, condiciones/medicación/alergias/apto; aviso "REPI no hace diagnósticos".
  - Nutrición (Grant): objetivo, días en rango, hidratación, macros, kcal/día con banda, peso, último día.
  - Mi cuerpo (Grant por tipo).
  - Pagos.
- **Constructor (SCR-C-03):** lista de programas, nombre editable, días como pestañas con **nombre editable**, agregar ("Día N")/quitar día, ejercicios con series/reps/RIR/descanso, reordenar, quitar, biblioteca con búsqueda, indicación al cliente, duplicar, asignar (copia por cliente, fecha de inicio).
- **Mensajes (SCR-C-04)** y **Pagos (SCR-C-05):** tabla alineada (Cliente/Monto/Vencimiento/Estado/acción), registrar pago manual, suscripción REPI Coach con regla de facturable.
- **Espacios:** switcher a Gym Norte (entrenador de sala).

No diseñado: alta/invitación de clientes, calendario, importación CSV, configuración/perfil público, versionado y prescripciones avanzadas (superseries, tempo, RPE por serie), biblioteca CRUD, IA.
