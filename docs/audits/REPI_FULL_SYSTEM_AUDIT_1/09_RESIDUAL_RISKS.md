# 09 — Riesgos residuales y pendientes

Auditoría FSA1, 09/11/2026. Lo que queda abierto, lo que no se pudo verificar y lo que depende de una decisión del titular.

## 1. Decisiones del titular (cambian producto o permisos)

| # | Tema | Situación | Propuesta |
| --- | --- | --- | --- |
| D-1 | **Quitar a alguien del equipo o cambiarle rol o sede (STF-09, P1)** | El producto sólo permite invitar. Un ex entrenador conserva el acceso a fichas, cola y programas hasta que alguien lo cambie en la base. El servidor ya respeta `staff_membership.status = 'revoked'` en el pedido siguiente (probado en `gym.test.ts`) | Definir quién revoca a quién. Propuesta: el dueño (`gym.config`) y la gerencia en su sede revocan roles distintos de dueño; las tareas asignadas vuelven a la cola con un evento; queda auditado. **Mientras tanto, mitigación operativa (§2)** |
| D-2 | **Qué ve la gestión de las series del socio (STF-01)** | Integrado: dueño, gerencia y recepción ven asistencia y adherencia agregadas; las series (peso, repeticiones, RIR, sensación, notas) son del equipo de entrenamiento de la sede (D178, D191). La otra opción evaluada dejaba a la gestión ver peso, repeticiones y RIR sin notas ni sensación | Confirmar. Si se quiere la otra, es un cambio de una línea en `memberDetail` |
| D-3 | **Lesiones en «No vino el profe» y la rutina sin programa (COM-07, P2)** | Esas sugerencias no leen las lesiones ni las molestias registradas; el cerebro de REPI sí, con consentimiento de salud | Excluir por reglas, en el servidor y sin enviar salud al proveedor, los ejercicios de una zona con lesión activa; o exigir el consentimiento de salud |
| D-4 | **Reintento del email transaccional (COM-09, P2)** | Código, restablecer contraseña, consentimiento del tutor y decisión de alta se intentan una vez. Desde FSA1 los fallos quedan registrados (COM-03) | Una cola de emails con reintento acotado, o reintento en el momento para 429 y 5xx |
| D-5 | **5 archivos huérfanos en Storage (83 KB)** | Fotos de progreso de usuarios demo ya borrados, subidas en la prueba de PP1 del 06/11. La causa está corregida (INF-01) | Autorizar su borrado, después de un respaldo, con `scripts/operations/storage-orphans.sql` como evidencia |
| D-6 | Ajustes de diseño (UI-13, UI-14) | Una sección sin `h1`; el dock del entrenamiento alto en tableta apaisada | Decidir con diseño |

## 2. Mitigación de D-1 hasta que exista la función

Para quitar el acceso a alguien del equipo, en el editor SQL de Supabase:

1. Correr un «Respaldo» y esperar que termine en verde.
2. En una transacción, con el mismo manejo de roles que los scripts alojados (`set local role repi_app`):
   - `update staff_membership set status = 'revoked' where user_id = '<id>' and org_id = '<org>'`;
   - un `audit_event` con la acción `staff.revoked_manual`.
3. Sus tareas asignadas quedan visibles para la gerencia, que las devuelve a la cola desde «Seguimiento de sala».

El cambio rige en el pedido siguiente de esa persona: no hace falta que cierre sesión.

## 3. Defectos abiertos de baja gravedad

| ID | Tema |
| --- | --- |
| MEM-06 | Carrera teórica: la pantalla podría mostrar el valor anterior de una corrección hasta recargar (IndexedDB ya no lo pierde) |
| IMP-10 | Cambiar de variante en la revisión de importación conserva el `opId` |
| IMP-11 | El mensaje de IA incompleta habla de «historial» al importar rutinas |
| COM-08 | «No vino el profe» acepta las repeticiones de la IA tal cual (es sólo una sugerencia) |
| COM-10 | `assist_new` avisa sólo al piso en turno; la gestión se entera a los 15 min (diseño) |
| INF-03 | `search_path` de dos triggers: se incorpora en la próxima migración |

## 4. No verificado en este entorno

| Qué | Por qué | Cómo verificarlo con seguridad |
| --- | --- | --- |
| Safari, iPhone, Android y Firefox reales | Sólo hay Chromium; no se instalaron navegadores | El titular, en su iPhone: entrenar con y sin conexión, Mi cuerpo, fotos e importación |
| Push real (FCM/APNs) | Sin claves VAPID locales | En producción con una cuenta demo y un teléfono: activar avisos en «Avisos» y recibir uno |
| Entrega real de email (Resend) | Sólo proveedor simulado; nunca a personas reales | `/api/cron/mail-test` hacia una casilla del titular |
| IA real (OpenAI): fotos, PDF, capturas, chat, inyección de instrucciones | Las pruebas usan un proveedor simulado; no se gastó en el proveedor | Muestras sintéticas en producción con una cuenta demo |
| Storage real (Supabase o proxy) | Local usa disco | El respaldo diario ya restaura y verifica; el borrado se verifica en producción con una demo (08) |
| Ingreso con Google o Apple con 2FA | Proveedores no configurados | Cubierto por la misma regla en el servidor (`/callback/:id`); probar si se activan |
| Admin y Ventas en la UI | No hay rol demo | Verificados por API y e2e en build propia; recorrido con una cuenta admin real |
| Zona segura y teclado virtual | Chromium no los emula | Prueba en un teléfono |
| Límites por IP fuera de Vercel | Toman el primer `x-forwarded-for` | En Vercel lo fija la plataforma; revisar sólo si se cambia de hosting |
| Carga (1000 socios, profesores concurrentes) | El máster pide no hacer pruebas agresivas en producción; no hubo un entorno de carga | Pendiente: escenario sintético en una base descartable. Referencia actual: consulta más lenta de `repi_app` 0,41 s |

## 5. Riesgos de escala conocidos

- **196 claves foráneas sin índice** (07 §6): pesan en los borrados en cascada de la purga de demos. Revisar cuando el `delete` más lento de `repi_app` pase de 2 s en `pg_stat_statements`.
- **Paginación del historial por `endedAt` estricto:** dos sesiones con el mismo `endedAt` en el borde de una página podrían saltarse. Probable sólo con historiales importados en lote.
- **El cronograma de respaldos depende de GitHub:** los turnos llegan con 6 a 8 h de demora (07 §4). No se pierde ningún día y el vigilante cubre 30 h.

## 6. Lo que esta auditoría no es

- No es una habilitación legal ni contractual para el lanzamiento comercial (términos, privacidad, menores, datos de salud).
- No es una garantía de ausencia de defectos: cubre lo verificado en 02 con la evidencia citada.
- No incluye pruebas en dispositivos físicos ni de carga.
