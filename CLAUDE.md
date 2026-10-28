# REPI — Instrucciones de continuidad

Leé MASTER_PROMPT.md como fuente activa del encargo. Después docs/continuidad/ESTADO_ACTUAL.md, PROXIMA_SESION.md y PLAN_LANZAMIENTO_Y_ROADMAP.md. El pedido vigente es **lanzar primero una web/PWA funcional con todo lo principal y completar luego el alcance completo**, no rehacer el proyecto ni terminar toda la investigación antes de lanzar.

Consultá CATALOGO_COMPLETO.md/JSON y FUENTES_Y_PRECEDENCIA.md para el módulo que tocás. El handoff vigente está en handoff/fuentes/extraido/repi-app-mobile-prototype/project/. Hay Acceso/Alumno v4/Coach actualizados fuera del subdirectorio REPI_COMPLETE_DESIGN_HANDOFF; no restaurar v3 por error. Descubrir funciones nuevas con evidencia, sin tratar prototipos como backend.

Preservá Concepto 2 y G · Atlética de REPI_SELECCION_VISUAL.md. **Tipografía oficial y definitiva: Barlow (cuerpo e interfaz) y Barlow Condensed (títulos destacados), dirección G · Atlética.** Inter Tight está descartada y esta regla tiene prioridad sobre cualquier máster o pedido que la mencione (Adaptive Coach, Repi Proactivo, Coach, Gym, Body Intelligence). Logo e isotipo originales intactos; no cambiar componentes que ya usan Barlow (confirmado por el titular, 27/10/2026). Motion M01–M05 tiene implementación posterior en motion.md §12: probar antes de rehacer. Los documentos anteriores de Inter Tight, autoalta, padrón obligatorio, uso como base facturable y precios demo están superados. Tarifa por cliente y total acordado, no activaciones. Identidad no equivale a pertenencia; QR requiere aprobación.

Respetá AGENTS.md del área y las guías locales de Next; mantené stack y cambios existentes. No modificar el handoff original. docs/PRODUCT_INVENTORY.md es generado: actualizar su fuente cuando corresponda, no marcar a mano probado sin evidencia. Separar requisitos confirmados/propuestos de estado técnico y fase.

Antes de ejecutar tests de DB, inspeccioná apps/web/tests/global-setup.ts: elimina esquemas. Exigir base descartable separada de dev/prod y guardas adecuadas. No seeds sobre datos reales, secretos en logs/docs, despliegues o cargos implícitos. Preparar el trabajo reversible y verificable antes de decisiones externas finales.

Al cerrar cada bloque, actualizar PROXIMA_SESION.md con estado, archivos, pruebas, migraciones, decisiones y próxima acción. No depender de contexto del chat. Avanzar en desarrollo autorizado hasta completar el corte; pedir sólo decisiones que cambian negocio/permisos/gasto y no puedan deducirse de las fuentes, sin detener trabajo independiente.
