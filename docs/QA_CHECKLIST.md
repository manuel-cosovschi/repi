# REPI — Lista de QA de la release

Actualizado: 27/10/2026 (D111). Marcar cada ítem con fecha, entorno y quién lo probó. Lo automático corre en cada release; lo manual, antes de la beta y después de cambios grandes.

## Automático (cada release)

- [x] `pnpm vitest run` — 172/172 (27/10, rc-2026.10.27). Incluye `launch-flows.test.ts` (circuito Coach completo con negativas).
- [x] Dominio — 107/107. Guardas — 11/11. Build — OK.

## Flujos (navegador)

| Flujo | Desktop | 375 px | Fecha |
| --- | --- | --- | --- |
| Sitio público → formulario de contacto | ✓ | ✓ | 27/10 (D104, D109) |
| Admin: ficha → acuerdo → habilitar → invitación | ✓ | — | D79–D102 |
| Coach activa espacio, invita alumno | ✓ | — | D69, D100 |
| Coach arma rutina, duplica, asigna | ✓ | — | D110 |
| Alumno acepta, ve rutina, entrena, finaliza, historial | — | ✓ | D105–D108 |
| Alumno cambia o saltea ejercicio; ve reemplazo aprobado | — | ✓ | 27/10 (D110) |
| Mensajes coach ↔ alumno | ✓ | ✓ | D40 |
| Gym: QR → solicitud → aprobación → programa → sesión | ✓ | ✓ | `annex.test.ts`, D101 |

## Negativas (automáticas, ver archivo)

Usuario sin permiso y organización equivocada (`training`, `gym`, `launch-flows`), invitación ajena o reutilizada (`access`, `launch-flows`), datos inválidos (`training` «valida documento»), reintento sin duplicar (`sync`, `launch-flows`), sesión revocada (`logout`, `access` «recuperación»), proveedor de correo caído (`commercial-delivery`, `mailer`), cuenta comercial suspendida (`launch-flows` LF-04), sesión sin conexión (`sync`).

## Dispositivos (LB-03, pendiente con teléfonos reales)

Para cada uno: iPhone (Safari, instalada desde «Compartir → Agregar a inicio») y Android (Chrome, «Instalar app»).

- [ ] Instalar desde https://repiclub.com/instalar y abrir desde el ícono.
- [ ] Ingresar, aceptar una invitación de prueba.
- [ ] Entrenar 3 series; activar modo avión; 2 series más; cerrar la app; volver a abrir con conexión: las 5 series están y no hay duplicados.
- [ ] Aviso de fin de descanso con la app en segundo plano (D107).
- [ ] Push de un mensaje del coach.
- [ ] Teclado numérico al escribir peso; nada tapado por la barra inferior.
- [ ] Tablet (iPad o Android) en horizontal: panel del coach usable.

## Diseño (cada release con cambios visuales)

Barlow / Barlow Condensed, logo e isotipo originales, paleta Concepto 2, sin desborde horizontal a 375 px, estados vacío/carga/error, contraste, `prefers-reduced-motion`.
