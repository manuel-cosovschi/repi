# REPI — Decisiones y dependencias pendientes

27/10/2026. La decisión vigente se contrasta con docs/DECISIONS.md y anexos. No pedir otra vez precio flexible, base total, QR/aprobación, web-first ni G · Atlética: ya están confirmados. Esta lista no impide avanzar en desarrollo independiente. Preparar opciones concretas y configuración antes de pedir una decisión que sólo el responsable puede tomar.

| Tema | Quién define | Cuándo bloquea | Trabajo posible mientras tanto |
| --- | --- | --- | --- |
| Clientes/sedes del piloto y responsable operativo | Usuario | Activación real y pruebas con sus participantes | Flags por org, checklist onboarding, usuarios DEMO separados |
| Dominio, hosting, DB y almacenamiento durable | Usuario/equipo técnico con presupuesto | Publicación | Configuración/documentación/adaptadores sin contratación |
| Proveedor email, remitente y credenciales/DNS | Usuario/titular de cuenta | Altas y recuperación en producción | Adapter, pruebas de contrato, reintentos y plantillas versionadas |
| Claves VAPID y teléfonos de prueba | Operador | Entrega push afirmada como lista | Cola, bandeja y tests locales; no confundir aceptación del proveedor con entrega |
| Textos Términos/Privacidad/DPA, retención y responsables | Usuario y asesor responsable | Recoger datos reales bajo textos definitivos | Flujos, versionado, borradores claramente rotulados y procedimientos |
| Menores y datos sensibles por rol | Usuario y revisión especializada | Habilitar esos grupos/datos | Grants, restricciones y propuesta de piloto adulto sin imponerla como política final |
| Ciclo, corte, vencimiento, vigente Coach, actualización de totales | Usuario/comercial | Cobro contractual real | Motor versionado y preview con supuestos visibles; no contar activaciones |
| Pago externo/manual inicial o pasarela; fiscalidad, mora, prorrateo | Usuario/comercial/contable | Cobrar/emitir comprobantes/suspender | Registro preparado y sandbox; separar cierre simulado, factura interna y fiscal |
| Acceso corporal/salud del equipo de gym | Producto y privacidad | Conceder permisos adicionales | Mantener limitado; entrenamiento institucional autorizado independiente |
| Relación y fuente de datos publicables en Club | Producto | Usar sesiones privadas de coach en comunidad del gym | Conservar ámbito actual y publicación voluntaria de fuentes autorizadas |
| Multisede actual para ayuda al piso | Producto/operación | Pilotear socios fuera de sede principal | Contexto validado o piloto con una sede declarada, sin inventar presencia |
| Cola tras baja y retención de registros previos | Producto/privacidad | Garantizar recuperación y cierre correcto | Errores explícitos, no bucles/reintentos eternos, sin reactivar permisos |
| RIR histórico 5 y escala visible 4+ | Producto | Normalizar la escala | Mostrar valor histórico sin reescribir; mantener semántica actual |
| Récord presencial sin video | Producto | Activar esa vía | Mantener validación actual y registrar la alternativa pendiente |
| Reseñas, atribución y after-hours definitivos | Producto/operación | Cambiar reglas que afectan personas | Preservar reglas documentadas, muestras y trazabilidad; no presentarlas como ley |
| Reconstrucción BI, licencias, evaluación y límites | Responsables científicos/técnicos/privacidad | Activar inferencias | Registro/visor genérico/pipeline de evaluación aislados |
| Tiendas e integraciones de salud/relojes | Usuario cuando llegue fase | Distribución/integración externa | Backend/API/enlaces compartidos; nada que bloquee web V1 |

La modalidad manual de piloto, su cohorte y límites de datos son propuestas de este plan. No son acuerdos ya aceptados ni autorizaciones para contactar clientes, cobrar, publicar o hacer un estudio.
