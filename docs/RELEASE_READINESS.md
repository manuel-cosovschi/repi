# REPI — Matriz de preparación para el lanzamiento

Actualizado: 27/10/2026, commit de la release candidata `rc-2026.10.27` (D111). Directiva vigente: «LAUNCH FIRST MASTER DIRECTIVE» (chat 27/10/2026). Alcance: [MVP_SCOPE.md](MVP_SCOPE.md). Bloqueantes abiertos: [LAUNCH_BLOCKERS.md](LAUNCH_BLOCKERS.md).

**Veredicto:** release candidata técnica lista para una **beta controlada** con coaches y gimnasios elegidos. **No** lista para lanzamiento comercial público: quedan P0 externos (plan de hosting comercial, textos legales revisados, prueba en teléfonos reales) que dependen del titular.

Estados: **Verificado** (prueba automática o navegador con evidencia y fecha), **Corregido hoy** (cambio con prueba, falta verlo en producción), **Parcial**, **Externo** (depende de una decisión, cuenta o dispositivo del titular), **Pendiente**.

Las pruebas de integración corren contra la base descartable `repi_test` (`apps/web/tests/global-setup.ts`); el navegador, en dev local y en https://repiclub.com cuando se indica.

## Coach (mercado P0 del primer lanzamiento)

| ID | Requisito | Prior. | Estado | Evidencia / prueba | Bloqueantes | Área | Validado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LR-01 | Registro, verificación por código, ingreso, recuperación, 2FA de Admin/dueño, sesiones revocadas al cambiar contraseña, cierre de sesión | P0 | Verificado | `tests/access.test.ts`, `security-launch.test.ts`, `logout.test.ts` | — | Identidad | 27/10 |
| LR-02 | Alta comercial: interés en el sitio → Admin registra acuerdo y habilita → el coach activa su espacio con la invitación (sólo su email) | P0 | Verificado | `tests/launch-flows.test.ts` LF-01, `annex.test.ts`, `commercial-delivery.test.ts` | — | Comercial | 27/10 |
| LR-03 | Invitar alumno: ligada al email, de un uso, revocable; cuenta existente suma relación | P0 | Verificado | `access.test.ts` («invitación de alumno»), LF-01 | — | Identidad | 27/10 |
| LR-04 | Rutinas: ejercicios, series, reps/rangos, RIR, descanso, indicaciones, días, duplicar, autoguardado versionado; asignar como copia propia | P0 | Verificado | `training.test.ts` («programas versionados»), LF-01; navegador D110 | — | Programación | 27/10 |
| LR-05 | Entrenar: iniciar, registrar series (peso fino, reps, RIR, nota), descanso, finalizar con RPE; reintentos sin duplicados | P0 | Verificado (emulado) | `training.test.ts`, `sync.test.ts`, LF-01 (misma serie enviada dos veces = 1 registro) | LB-03 teléfonos reales | Entrenamiento | 27/10 |
| LR-06 | Sin pérdida silenciosa: cola offline en IndexedDB, conflictos entre dispositivos explícitos | P0 | Verificado (emulado) | `sync.test.ts` (5 casos), D92 | LB-03 | Entrenamiento | 27/10 |
| LR-07 | Historial del alumno y progreso básico | P0 | Verificado | LF-01 (`myHistory`), `goals.test.ts`, `report.test.ts` | — | Progreso | 27/10 |
| LR-08 | El coach ve sesiones, series, volumen, cambios y notas; ajusta el programa hacia adelante sin tocar lo registrado | P0 | Verificado | LF-01, `training.test.ts` («editar el programa… no reescribe») | — | Seguimiento | 27/10 |
| LR-09 | Mensajes privados coach ↔ alumno con no leídos; sólo participantes | P0 | Verificado | `gym.test.ts` («mensajería»), LF-01 | Push en teléfono real: LB-03 | Comunicación | 27/10 |
| LR-26 | El coach pausa, reactiva o termina la relación con un alumno; terminar revoca lo compartido y conserva el historial | P0 | Verificado | `launch-flows.test.ts` LF-05 (D115) | — | Seguimiento | 27/10 |
| LR-10 | Aislamiento: otro coach no ve clientes, programas, sesiones ni chats; organización equivocada = 404 | P0 | Verificado | LF-01, `training.test.ts`, `access.test.ts`, `denied.test.ts` | — | Seguridad | 27/10 |
| LR-11 | Salud sólo con consentimiento por tipo de dato y revocación inmediata | P0 | Verificado | `access.test.ts` («menores»), `followup.test.ts`, F-PR-05 | — | Privacidad | 27/10 |
| LR-27 | Alta comercial con datos mínimos: sólo nombre visible, moneda, responsable y email; el error nombra lo que falta | P0 | Verificado | `annex.test.ts` («alta comercial con datos mínimos»), navegador local 28/10 con el caso que fallaba en producción (D117) | — | Comercial | 28/10 |
| LR-28 | Ícono de instalación a sangre (sin doble marco en iPhone ni recorte en Android), favicon y máscara de Android | P0 | Corregido hoy | `scripts/brand-icons.ts`, manifest con `any` + `maskable` (D117) | Confirmar en teléfono real (LB-03) | Producto | 28/10 |
| LR-12 | Condiciones comerciales por cliente (cantidad y tarifa acordadas, versionadas, sin importes fijos en código), avisos de cambios, suspensión corta el acceso sin borrar | P0 | Verificado | `condition-notices.test.ts`, `payments.test.ts`, LF-04 | — | Comercial | 27/10 |
| LR-13 | Cobro a REPI: manual y fuera de la app, registrado por Admin; nada se presenta como automático | P0 | Verificado | D102, D109 (G09 resuelto), `payments.test.ts` | — | Comercial | 27/10 |
| LR-14 | Correos reales (verificación, recuperación, invitaciones) por Resend; **ningún código ni enlace personal copiado al buzón que lee Admin** | P0 | Verificado | `mailer.test.ts` («DEMO con Resend: no deja copia»), D111; copia vieja borrada en producción (LB-01 cerrado) | — | Operación | 27/10 |
| LR-15 | Módulos incompletos ocultos (Nutrición, Mi cuerpo, video de ejercicio) con interruptores | P0 | Corregido hoy | `tests/features.test.ts`, [FEATURE_FLAGS.md](FEATURE_FLAGS.md) | — | Producto | 27/10 |
| LR-16 | Rate limiting en ingreso, códigos, invitaciones, contacto y escritura | P0 | Verificado | `ratelimit.test.ts` | — | Seguridad | 27/10 |
| LR-17 | Exportar mis datos y pedir eliminación con procedimiento | P0 | Verificado | `privacy.test.ts`, `docs/PRIVACIDAD_OPERACION.md` | Eliminación la ejecuta Admin (manual) | Privacidad | 27/10 |
| LR-18 | Respaldo y restauración probados | P0 | Verificado | Ensayo 27/10 22:38: `ops:backup --source=hosted --storage` + `ops:restore` en `repi_restore_check` (87 tablas, 148 filas) | LB-05 frecuencia y copia externa | Operación | 27/10 |
| LR-19 | Hosting apto para uso comercial y base sin pausa por inactividad | P0 | Externo | Vercel Hobby es de uso personal no comercial; Supabase gratuito pausa a los 7 días sin actividad y no tiene PITR | LB-02 | Operación | — |
| LR-20 | Términos, privacidad y acuerdo con organizaciones revisados | P0 (público) | Externo | Borrador `v2026.10` publicado (D109) | LB-04 | Legal | — |
| LR-21 | Teléfonos reales iPhone y Android: instalar, abrir desde inicio, entrenar, push | P0 | Externo | Emulación 375 px en cada bloque; `docs/guias/` | LB-03 | QA | — |
| LR-22 | Contacto y soporte publicados (24 h urgencias, $ 30.000 a medida) | P1 | Verificado | D109, https://repiclub.com/#soporte | — | Soporte | 27/10 |
| LR-23 | Registro de errores: logs estructurados en Vercel y auditoría de denegados | P1 | Parcial | `src/server/log.ts`, `denied.test.ts` | LB-06 sin alertas | Operación | 27/10 |
| LR-24 | Primer REPI Admin con 2FA en producción | P0 | Verificado | Consulta a Supabase 27/10: 1 Admin real con 2FA (sin datos personales) | — | Operación | 27/10 |
| LR-25 | Modo de despliegue productivo (sin `REPI_DEPLOY=demo`) | P1 | Verificado | Variable eliminada de Vercel 27/10; `/dev/mailbox` → 404 | — | Operación | — |

## Gym (puede salir en la misma beta; no bloquea Coach)

| ID | Requisito | Prior. | Estado | Evidencia / prueba | Bloqueantes | Validado |
| --- | --- | --- | --- | --- | --- | --- |
| LR-30 | Alta comercial del gym, dueño con 2FA, sedes | P0 | Verificado | `annex.test.ts` (`world()`), `access.test.ts` («gimnasio») | — | 27/10 |
| LR-31 | Equipo: invitación por email y rol; roles por sede que no se combinan | P0 | Verificado | `access.test.ts`, `gym.test.ts` («roles distintos por sede») | — | 27/10 |
| LR-32 | Socios por QR de sede con aprobación humana; bajas y reactivación | P0 | Verificado | `annex.test.ts`, `security-launch.test.ts` | — | 27/10 |
| LR-33 | Programa institucional con motivo y revisiones; el socio entrena y registra | P0 | Verificado | `gym.test.ts` («programa institucional») | — | 27/10 |
| LR-34 | Cola de sala, turnos y traspasos; pedidos del socio | P0 | Verificado | `gym.test.ts` («turno, cola y traspaso») | — | 27/10 |
| LR-35 | El dueño no lee chats privados, notas personales ni salud | P0 | Verificado | `gym.test.ts` («datos privados de un entrenador», «notas»), D40 | — | 27/10 |
| LR-36 | Métricas operativas básicas desde eventos reales | P1 | Verificado | `gym.test.ts` («métricas desde eventos reales») | — | 27/10 |

Lo avanzado de Gym (Performance Center, reseñas, multi-sede, Club) ya existe y está probado; no es requisito de lanzamiento y se puede apagar por módulo si molesta (Club: `-club`).

## Resultado de las pruebas de la release candidata (27/10/2026)

- Web (integración, base descartable): **178/178** en 35 archivos (D117).
- Dominio: **107/107**.
- Guardas de base y operación: **11/11**.
- Build de producción: OK.
- Navegador local (D109–D110): sitio público y legales a 1009 y 375 px, constructor con reemplazos, hoja «Cambiar» del alumno a 375 px.
- Respaldo + restauración: OK (LR-18).
