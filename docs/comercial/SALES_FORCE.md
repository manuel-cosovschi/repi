# REPI Sales Force & Commission OS (D207)

Módulo comercial nativo dentro de REPI: vendedores, CRM, cierres declarados, atribución, comisiones y liquidaciones. Comparte clientes, contratos, condiciones versionadas, pagos registrados, invitaciones y correo con el Admin existente. No es un CRM separado, no mueve dinero y no emite comprobantes fiscales.

## Estado

- **Técnico:** integrado y verificado localmente (dominio, integración sobre `repi_test`, build y recorrido en navegador sobre `repi_dev`). **No publicado.** Migración 0049 **no aplicada** en producción.
- **Producto:** pedido del titular (master prompt 07/11/2026). Las reglas económicas reales (planes, porcentajes, mínimos) **no están cargadas**: las define Admin.

## Arquitectura

| Capa | Archivos |
| --- | --- |
| Dominio puro | `packages/domain/src/sales.ts` (+ `sales.test.ts`): estados y capacidades del vendedor, pipeline y transiciones, duplicados, vista previa del cierre, validación de planes, motor `desiredEntries` + `diffLedger`, cortes de liquidación |
| Servidor | `apps/web/src/server/sales/`: `core` (guardas, avisos, bitácora), `reps`, `crm`, `deals`, `commissions`, `payouts`, `insights`, `admin-routes` |
| API vendedor | `apps/web/src/app/api/ventas/[[...path]]/route.ts` |
| API Admin | `/api/admin/sales/*` (despachado desde `api/admin/[[...path]]` hacia `server/sales/admin-routes.ts`) |
| Interfaz | `/ventas` (`components/sales/SalesApp.tsx`), `/ventas/activar/[token]` (reutiliza `AccessFlow`), `/ventas/liquidacion/[id]` (resumen imprimible), Admin › Ventas y Vendedores (`components/admin/AdminSales.tsx`), `styles/sales.css` |
| Ganchos en código existente | `commercial/services.ts` (`createClientTx`, `addTermTx`, `publishTermNotice`; sincroniza comisiones al habilitar o suspender; no borra clientes con venta aprobada o comisiones), `commercial/payments.ts` (sincroniza al registrar o anular un pago), `access/services.ts` (espacio «REPI Ventas»), `sign-up` (flujo `seller`), `createLead` y `/conoce` (`?ref=`) |

## Tablas (migración 0049, aditiva)

`sales_region`, `sales_rep`, `sales_rep_invitation`, `commission_plan`, `commission_plan_version`, `sales_rep_plan`, `sales_prospect`, `sales_opportunity`, `sales_activity`, `sales_deal`, `sales_attribution`, `sales_request`, `commission_entry`, `payout_batch`, `payout_item`, `payout_payment`, `sales_target`, `sales_material`, `sales_notice` y `commercial_lead.referral_code`.

Invariantes en la base: un vendedor por cuenta y un email activo por vendedor; una invitación pendiente por vendedor; venta única por `(vendedor, clave idempotente)`; una atribución vigente por organización; una solicitud de frecuencia abierta por vendedor; asiento con `key` única y una sola reversión por asiento; **trigger que impide UPDATE/DELETE en `commission_entry`**; un asiento en una sola liquidación (`payout_item.entry_id` único); una liquidación abierta por vendedor y moneda; pagos con clave idempotente. Dinero en `bigint` (unidades menores), fechas de negocio `AAAA-MM-DD` en hora argentina.

## Permisos

- Todo se valida en el servidor. El vendedor se resuelve desde la sesión (`requireRep`), nunca desde parámetros. Un recurso ajeno responde 404 y queda en `audit_event` como `access.denied`.
- Admin: `requireAdmin` (2FA) en cada servicio. Un vendedor que llama a `/api/admin/*` recibe 404.
- Estados: **activo** todo lo suyo; **pausado** lee sin escribir; **suspendido / desvinculado** sólo comisiones, liquidaciones, avisos y perfil (sus derechos devengados). Invitado y pendiente: sin acceso.
- El vendedor nunca: aprueba ventas, edita planes, registra pagos, habilita clientes, modifica contratos o ventas aprobadas, ve datos de socios (entrenamiento, salud, chats) ni prospectos/clientes/liquidaciones de otros. En duplicados ve que existe un prospecto de otro vendedor, sin datos.

## Recorridos

1. **Alta:** Admin › Vendedores › Nuevo vendedor → «Crear e invitar» → correo con `/ventas/activar/<token>` → crea o usa su cuenta (email verificado y coincidente) → completa perfil → `/ventas`.
2. **Captación:** prospecto + oportunidad (alta rápida desde el teléfono), actividades, tablero/tabla, próximas acciones, enlaces `tel:`/WhatsApp/`mailto:` que no se registran como enviados.
3. **Cierre:** «Registrar venta» guiado (cliente → condiciones con vista previa → cierre y evidencia → revisar). Admin › Ventas › Cierres: pedir corrección, rechazar o aprobar (crear cliente en borrador o vincular a contrato; cantidad y precio como versiones con fecha de efecto; plan; vendedor asignado; reparto opcional).
4. **Incorporación:** sigue el circuito existente de Clientes (aceptación registrada → habilitación → bienvenida). El cliente aparece en «Mis clientes» con su etapa.
5. **Comisión:** eventos verificados (aprobación, habilitación, `billing_payment` registrado) → `syncContract` → asientos. Anular un pago revierte. Admin › Comisiones › «Recalcular desde eventos» es idempotente.
6. **Liquidación:** Admin › Liquidaciones: borrador por frecuencia (o «hasta hoy»), aprobar, registrar pagos totales o parciales, anular pago, cancelar sin pagos, CSV contable, resumen imprimible.
7. **Renegociación:** venta «Ampliación o renegociación» o «Renovación» sobre un cliente propio → nuevas versiones de `contract_term`; por socio comisiona sólo los adicionales.
8. **Desvinculación:** Admin › ficha › «Desvincular» corta el CRM en el servidor; «Reasignar cartera» mueve prospectos y clientes asignados (el cierre y lo devengado se conservan).

## Fórmulas (también en `SALES_DEFINITIONS`)

- Contratado mensual = cantidad acordada × precio por unidad vigentes hoy (por moneda). **No es cobrado.**
- Cobrado = `billing_payment` registrados y no anulados de contratos atribuidos en el período.
- Conversión = ventas aprobadas en el período ÷ oportunidades creadas en el período. Tiempo a cierre = días promedio oportunidad → aprobación.
- Comisión %: `round_half_up(importe × bps / 10000)` en centavos. Recurrente: cobros con fecha en `[inicio, inicio + N meses)`.
- Cada cobro cuenta para una sola venta: la última aprobada cuyo inicio es ≤ a la fecha del cobro.
- Estados de un asiento: devengada (en retención) → disponible → en liquidación → pagada; revertida = compensada por su asiento negativo.

## Habilitación segura en producción

1. Workflow «Respaldo» en verde (`docs/RESPALDOS.md`).
2. Aplicar `apps/web/scripts/operations/hosted-0049.sql` (una transacción, como `repi_app`; ensayado: huella igual a `migrate.ts`, RLS en las 19 tablas, reintento falla entero, reversión que se niega con datos, revertir y reaplicar). Reversión: `scripts/rollback/0049_sales_force.down.sql`.
3. Integrar el PR. El código anterior es compatible con 0049 aplicada.
4. Smoke con datos ficticios (`*.invalid`): crear vendedor, invitar, aceptar, prospecto, venta, aprobar, plan, habilitar, pago de prueba, liquidar; después anular y limpiar.
5. Interruptor: `REPI_SALES=off` oculta el módulo (rutas 404) sin borrar datos.

## Decisiones pendientes del titular

- Planes reales (componentes, porcentajes, montos, retención, mínimos, topes) y su moneda; tratamiento fiscal/laboral de los vendedores.
- Regla para renegociaciones con otro vendedor (hoy: el cobro va a la última venta aprobada vigente) y repartos estándar.
- Si los vendedores con responsable comercial deben ver el pipeline de su equipo (hoy: no).
- Medios de cobro de los vendedores: REPI no guarda CBU/alias; se coordinan por fuera.
- Subida de archivos de evidencia (hoy: referencia o enlace) y PDF generado en servidor (hoy: imprimible desde el navegador).
- Asistencia con IA (resúmenes, borradores): no implementada; el módulo funciona sin IA y ya ofrece faltantes y alertas deterministas.
