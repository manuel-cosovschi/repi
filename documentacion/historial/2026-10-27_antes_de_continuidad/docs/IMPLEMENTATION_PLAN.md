# REPI — Plan de implementación

Cortes verticales sobre el inventario completo (`docs/PRODUCT_INVENTORY.md`, 166 entradas). El orden sigue `MASTER_PROMPT.md` §16 ajustado a dependencias reales. Ninguna etapa reduce alcance; cada una termina con evidencia en `docs/IMPLEMENTATION_STATUS.md`.

## Etapa 0 — Descubrimiento (hecha)
Inventario abierto con delta del handoff nuevo, decisiones, contrato de diseño. Salida: docs/.

## Etapa 1 — Base ejecutable + Acceso (en curso)
**Fuente:** `REPI Acceso.dc.html`. **IDs:** F-BR-01, F-ID-01..20, F-MO-01 (selector), F-PR-01 (grants iniciales), F-GR-01 (mínimo: aprobar pedidos de socio).
- Monorepo, tokens, assets de marca, componentes base accesibles (campo, CTA, chips, switch, checkbox, lista, nota, alerta, toast).
- Esquema: User/Session/Account/Verification/TwoFactor (Better Auth); Organization, GymLocation, StaffMembership, CoachProfile, CoachClient (relación), GymMember, Invitation, RosterEntry, MembershipRequest, GuardianConsent, LegalAcceptance, ConsentGrant (+ evento), AuditEvent, DevMailbox.
- Flujos: login, verificación, recuperación, 2FA (enrolar/verificar/respaldo), registro coach, registro gym + invitar equipo, invitación alumno/staff, alta de socio por padrón o pedido, menores con adulto, consentimientos, selector de espacio desde datos reales.
- Pruebas: dominio (vitest), integración con Postgres de test, recorrido en navegador 390/1280.
- **Salida:** cada flujo persiste y sobrevive recarga; sin "simular".

## Etapa 2 — Núcleo Coach→programa→alumno
F-CO-01/02/08/09/13, F-CL-01..05/14/15, F-HX-04/05. Programas versionados, copia por asignación (C04), sesión con identidad y prescripción inmutable (C02), registro real con autosave (C01), descanso por timestamp. Superficie alumno PWA desde v4.

## Etapa 3 — Offline y sincronización
F-CL-07/16. IndexedDB local, cola de mutaciones con IDs estables, idempotencia servidor, conflicto conservando ambas versiones, limpieza al logout.

## Etapa 4 — Seguimiento y consentimiento
F-CL-08..13, F-PR-01..06, F-CO-03..07/14..18, F-HX-01..03. Solicitudes de acceso de punta a punta, bandeja del coach, salud/molestias con grant.

## Etapa 5 — Gym operación y gestión
F-GT-*, F-GM-*, F-GP-*, F-GO-*, F-GR-*, F-RV-*, F-MS-02, F-HX-09/12/15/16/26/27. Decisiones D06–D11, D22, D23.
**Estado (26/10/2026):** entregada. Incluye operación, gestión, reseñas, la relación dual (D11) y la mensajería de D40 (F-MS-01/02). Quedan para después F-GR-02 (reservas), F-HX-12/15/16/26, la importación CSV del padrón y la retención de mensajes. Detalle en `docs/IMPLEMENTATION_STATUS.md`.

## Etapa 6 — Comunidad y Club
F-GC-*, F-RC-*, F-HX-10/11/13/14/25. Video privado con validación de archivo.
**Estado (26/10/2026):** entregada. Incluye comunidad del gym completa, carnet y recepción, logros y un núcleo de Repi Club. Quedan F-RC-04 (trofeos 3D), F-HX-12 (D23), F-HX-25 y el resto del alcance amplio del Club (D53). Detalle en `docs/IMPLEMENTATION_STATUS.md`.

## Anexo 26/10/2026 — Acceso, altas y facturación (entregado antes de la Etapa 7)
Actualiza el máster en estos temas (`docs/ANEXO_ACCESO_ALTAS_FACTURACION.md`). Cierra la autoalta de coach y gym; agrega la consola de Admin (alta comercial, aceptación, habilitación, cantidad y precio por cliente con versiones, vista previa y cierre simulado), invitaciones ligadas al email, alta del socio por QR de sede con bandeja compartida piso/recepción, Web Push con cola persistente, y los pedidos extra (peso fino, sensación por serie con aviso al piso, evolución y perfil en el Club). Decisiones D57–D65.

## Etapa 7 — Pagos y SaaS
F-BL-*, F-AD-*, F-CO-17, F-HX-06/17..20/24. Parte comercial ya resuelta por el anexo (D57–D59): queda el cobro real (proveedor, ciclo, corte, prorrateo, mora, fiscal; anexo §12) y los cobros del coach a sus alumnos, que son un flujo separado.

## Etapa 8 — Body Intelligence, IA y resto
F-BI-*, F-AI-01, F-PU-01, F-NT-*, F-CO-10..12, F-HX-07/08/21..23/28, F-BR-02 (motion). Hardening, WCAG 2.2 AA, QA visual y operación.

## Dependencias externas que bloquean activación (no desarrollo)
D20 credenciales OAuth · D21 textos legales · D24 proveedor de email · claves VAPID de producción (D61) · D04–D05 y anexo §12 comerciales · D13/D27 revisión legal de menores y DNI.
