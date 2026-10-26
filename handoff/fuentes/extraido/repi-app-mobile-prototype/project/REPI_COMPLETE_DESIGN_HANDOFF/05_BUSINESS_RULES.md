# 05 · Reglas de negocio

Tipos: **[C]** confirmada por usuario/brief · **[S]** supuesto de diseño · **[A]** alternativa propuesta · **[?]** sin resolver.

## Relaciones
- [C] Un User puede tener varias relaciones (alumno de coach, socio de gym, staff de gym, coach) sin duplicar cuenta.
- [C] Permisos por organización; nunca se heredan entre organizaciones.
- [S] Socio de gym (`gym_member`) ve la pestaña Gym; cliente de coach no.
- [?] Cómo elige el alumno su relación activa dentro de la app (GAP-24).

## Entrenamiento
- [C] Registrar serie en un toque; descanso por reloj real; autosave.
- [C] Editar un programa no altera el pasado (versionado) — no prototipado.
- [S] Asignar un programa crea una copia por cliente.
- [S] Gym: editar programa institucional requiere turno activo y motivo visible al equipo.
- [C] PR solo si supera registro comparable previo; celebraciones desactivables.

## Turnos y tareas (gym)
- [S] Tomar/completar requiere turno activo (`staff.afterHoursAccess` como excepción).
- [S] Traspaso crea `pending_acceptance`; si no se acepta hasta inicio de turno + 30 min → escala a coordinador.
- [C] Resúmenes de tarea saneados: sin salud ni contenido de chats.
- [S] Atribución a quien completa; trabajo compartido se divide.

## Desempeño del personal
- [C] Categorías separadas, sin puntaje combinado, sin recomendaciones disciplinarias.
- [C] Resultados de entrenamiento solo a nivel sede.
- [S] Promedio de reseñas oculto con n<5 (legacy usaba 10) [?].
- [C] Nunca usar salud/Mi cuerpo para evaluar personal.

## Reseñas
- [S] Una invitación por interacción elegible (programa nuevo/actualizado, técnica, onboarding); ≤1 cada 14 días; descartable.
- [S] Entrenador ve sin nombre; gerencia con nombre; otros socios no.
- [C] Staff no edita texto; moderación: mantener / retirar abusiva / pedir edición; apelación 14 días.
- [C] Publicación externa deshabilitada (requiere política + consentimiento).

## Comunidad del gym (v3)
- [C] El gym publica novedades con imágenes, descuentos, desafíos con premio que se retira en recepción y precios de recepción **sin pago en la app**.
- [C] Romper un récord exige video subido desde la app; el gym recibe notificación; si aprueba, el socio recibe notificación y un logro virtual permanente (sticker/nivel).
- [S] Nivel = 1 + floor(logros/2).
- [S] Aprobar actualiza el récord solo si mejora (`lowerIsBetter` para tiempos).
- [S] Videos privados para validadores; retención 90 días tras decisión.
- [?] ¿Se puede validar sin video en casos excepcionales? (no definido)

## Privacidad y datos sensibles
- [C] Consentimiento por tipo de dato, apagado por defecto; guardar ≠ compartir; revocable; historial de accesos.
- [C] Gym y coach no ven la app del alumno; coach ve datos en su dashboard con Grant.
- [C] Fotos no requieren ropa interior; no se infiere grasa/músculo desde fotos o modelo.
- [C] Requiere revisión legal (Ley 25.326) antes del piloto.

## Facturación SaaS
- [C] Cobrar a coaches/gyms, nunca micropagos de alumnos; separar cobros del coach a sus alumnos.
- [C] Precios configurables, versionados, sin hardcodear; dinero en enteros/decimal exacto.
- [S] Coach: facturable = relación activa con ≥1 programa en el período; pausados no se cobran.
- [S] Gym (contrato demo): facturable = cuenta REPI activa + ≥1 entrenamiento en el período (simulable "cuenta activa").
- [S] Admin: criterio por cliente — **máximo del período (defecto)**, al día de cobro, o promedio; día de cobro 1–28; mínimo; descuento %; plan por tramos / por unidad / fijo; cambios rigen desde el próximo cobro.
- [C] "Si los socios aumentan mes a mes, que se pague el total" (usuario) → criterio máximo.
- [?] Unificar definición de facturable (GAP-03); prorrateos; impuestos; moneda.
- [C] REPI no gestiona cobros gym→socio.

## Cobros del coach a sus clientes
- [C] Manual: registrar pago, vencimientos, estados (al día, vence pronto, vencido, pausa). Pagos online = futuro.
