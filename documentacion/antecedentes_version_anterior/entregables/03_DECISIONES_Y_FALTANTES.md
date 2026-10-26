# REPI — Decisiones pendientes y faltantes del handoff

25/10/2026. Este registro prepara decisiones concretas; no solicita respuestas para completar la auditoría. Las opciones son propuestas de trabajo, no decisiones ya tomadas. Claude Code debe ampliar la lista si el handoff nuevo revela otras funcionalidades o contradicciones.

## Qué puede avanzar sin nuevas decisiones

Inventario abierto, contrato Concepto 2, componentes accesibles, núcleo de entrenamiento persistido/offline, versionado, autenticación, separación de contextos, autorización mínima, estados faltantes, pruebas, métricas deterministas, motor de facturación parametrizable en pruebas, corrección de defectos y documentación. Diseñar extensiones coherentes del sistema no obliga a rediseñar marca ni a preguntar por cada control.

## Registro de decisiones

| ID | Decisión concreta | Evidencia/conflicto | Tratamiento antes de resolver |
|---|---|---|---|
| D01 | Elegibilidad de alumno/socio facturable | Brief: vínculo aceptado/vigente; Coach: activo+programa; Gym: entrenamiento/uso o cuenta activa | Implementar política versionada y datos necesarios; no elegir una regla de cobro real por inferencia |
| D02 | Medición temporal de elegibles | Admin propone máximo, día de cobro o promedio; “pagar total” no confirma máximo | Separar elegibilidad de agregación; calcular ejemplos de alternativas sin activar facturación |
| D03 | Precios y tramos | ARS 700, 450/380/320, mínimo 150.000, BI 60, anual 10% son ilustrativos | Mostrar sólo DEMO; decidir marginal/global, fronteras, mínimo, módulos y descuentos |
| D04 | Período, corte, emisión y cobro | Snapshot fin de período vs día configurable 1–28 | Definir cronología/zona horaria, altas/bajas/pausas, prorrateo, impuestos y redondeo |
| D05 | Proveedor y alcance fiscal | Mercado Pago candidato; checkout no diseñado; factura interna ≠ fiscal | Adaptador y pruebas; sin cargos reales ni promesa fiscal sin integración |
| D06 | Acceso a salud/nutrición/BI del staff Gym | “Gym no ve” vs matriz que concede Grant a sala/coordinador | Dueño/gerente sin acceso; no ampliar permisos de staff hasta precisar profesional, propósito, relación y base aplicable |
| D07 | Supervisión de managers por sede/individuo | Usuario pide efectividad/seguimiento; docs alternan agregados/scope Gym/sede | Conservar supervisión autorizada y no chats privados; resolver acciones y campos concretos por scope |
| D08 | Trabajo remoto y gating de turno | Usuario pide escritorio desde casa; prototipo exige turno para ciertas acciones | Diseñar after-hours/remoto y atribución; no eliminar modo remoto ni abrir todo indiscriminadamente |
| D09 | Reviews: elegibilidad, cadencia, identidad, muestra y rango | n = 5 vs n = 10; cadencia y visibilidad rotuladas como supuestos; “95%” sin método | Preparar alternativas y datos; no publicar agregados engañosos ni prometer anonimato no implementado |
| D10 | Roles/coordinación/recepción y permisos de moderación/publicación | Sin pantallas propias; capacidades y títulos se mezclan | Matriz por acciones/sede; reutilizar UI sólo si satisface el rol; no dar permiso por nombre de cargo |
| D11 | Relación dual del alumno | Está requerida pero falta selector/flujo en v3 | Diseñar identidad única con relaciones independientes; no mezclar historial/chats/grants |
| D12 | Consentimiento y derechos sobre datos | Seis toggles BI, dominio ocho tipos; default compartido y SQL TRUE contradictorios | Nada sensible compartido por defecto; separar guardar/IA/compartir, fuentes y revocación |
| D13 | Retención, borrado, edades y proveedores de datos sensibles | Fotos, videos, PDFs, modelos, colas y backups sin política completa; 90 días video es supuesto | Minimización y diseño de ciclo de vida; resolver población/transferencias/roles con revisión pertinente antes de activar esos tratamientos |
| D14 | BI: catálogo anatómico y métricas | Nueve regiones UI vs 28/14 pares con 16 grupos PDF; fórmula de carga no coincide con texto | Conservar nueve visibles y exposición registrada; no afirmar fatiga/tejido medido; versionar fórmulas propuestas |
| D15 | BI: motor, validación, costos y comparabilidad | PDF contiene fitter ineficaz, estudio no ejecutado, licencias/costos no uniformes | Evaluación separada con flags; no declarar reconstrucción validada o exacta; datos manuales siguen disponibles |
| D16 | BI: importación documental | Sin diseño de revisión; snippets omiten cualitativos y tienen códigos discutibles | Diseñar revisar/corregir/rechazar/provenance; no graficar inferencias sin aceptar ni diagnosticar |
| D17 | Motion, contraste y fidelidad | 520 ms vs ≤500 ms; blanco/oscuro sobre cian; runtime rompe lifecycle | Mantener identidad, reconciliar criterio accesible y verificar comportamiento; no cambiar Concepto 2 |
| D18 | Secuencia de entrega completa | MVP/V1 cambió en docs sin prueba de aprobación; chat/Gym fueron reubicados | Hoja de ruta propuesta, alcance final íntegro; experimentos no bloquean módulos independientes |
| D19 | Alcance adicional de un handoff nuevo | Usuario confirma que habrá más funcionalidades que las enumeradas | Inventario exhaustivo al comenzar, delta, evidencia, nuevos IDs, dependencia/aceptación; nunca cerrar en 93 |

## Diseño y contratos todavía necesarios

| Área | Entrega faltante que debe ser concreta |
|---|---|
| Identidad | Registro/login, verificación, recuperación, expiración/revocación, invitaciones, onboarding por rol y relación |
| Entrenamiento | Sin programa, guardado local/servidor, offline, reintento/conflicto, sesión pausada/incompleta, PR comparable, versionado/copias y programación avanzada |
| Coach | CRUD de clientes, biblioteca y medios, CSV con preview, calendario/asistencia, salud/nutrición/check-in desde alumno, solicitud real de grants |
| Gym | Remoto, after-hours, coordinación/recepción, acciones concurrentes, scopes de sede, revisión/atribución, mensajes autorizados, reservas si se mantienen |
| Reviews | Captura en app alumno, elegibilidad, invitación, privacidad de autor, moderación/aviso/apelación y método de agregados |
| Relación dual | Selector gym+coach, contexto activo, datos visibles, separación de chats/grants y cambio/baja de relación |
| Comunidad | Video con validaciones y almacenamiento privado, progreso de subida real, estados/retención/borrado, nuevo récord vs intento válido |
| Club amplio | Ámbitos/feed, reacciones/comentarios, rankings/trofeos/equipos, publicación voluntaria, perfiles y moderación según inventario |
| Pagos | Contrato de cálculo, ejemplos límite, checkout/pasarela, estados, conciliación, cambios efectivos, fiscal y comunicación de variaciones |
| Admin | Alta funcional, planes por defecto editables, soporte/flags/salud/costos, definiciones MRR/ARR/churn, permisos mínimos |
| Notificaciones | Centro, preferencias, email/push, autorización/plataformas, estados de entrega y texto sin datos sensibles |
| BI | Cámara real opcional, calidad, fallos, evaluación/recursos, grants completos, exportar/borrar, laboratorio/documentos y experimento validado separado |
| IA | Casos, fuentes, aprobación humana, datos permitidos, costo/límites, fallos/rollback y separación de heurística/LLM |
| Diseño técnico | Componentes reutilizables, tokens completos, iconos/fuentes/licencias, imágenes reales, accesibilidad, responsive y motion probado |
| Operación | Arquitectura/APIs/datos, migraciones, CI/pruebas, configuración, observabilidad, backups/restauración y criterios de lanzamiento |

## Correcciones documentales, sin alterar las fuentes

- Añadir `designed:1` a un manifest corregido derivado; no tocar el original preservado.
- Expandir el ID compuesto `F-RC-01..05`.
- Completar 33 criterios vacíos y 51 entradas sin estados; separar estado de diseño de aceptación productiva.
- Dar trazabilidad a reseña del socio, selector dual, salud/nutrición/check-in y requisitos originales agrupados.
- Unificar scope y jerarquía entre reglas, matriz, pantallas, datos y tests; no copiar contradicciones a código.
- Distinguir políticas aprobadas, declaraciones de aprobación dentro de docs, supuestos y datos ficticios.
- Ampliar mapa de implementación a todas las entradas requeridas, incluidas SCR-N y novedades.
- No declarar responsive completo,24 motions verificadas, cifrado, RLS, persistencia o integración de pagos porque figuren en texto.

## Condición para llamar “completo” al handoff de desarrollo

Cada requisito vigente descubierto tiene fuente, estado, dueño de decisión cuando aplica, pantalla/estado, acción, entidad, permiso, dependencia y prueba; cada conflicto tiene resolución o bloqueo acotado; cada asset/dependencia tiene procedencia/licencia; cada módulo tiene Definition of Done verificable. Las funciones sin diseño siguen en el alcance con tareas de diseño, y los experimentos siguen identificados como experimentos hasta contar con evidencia.
