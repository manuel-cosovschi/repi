# Anexo 26/10/2026 — Acceso, altas y facturación: delta y seguimiento

Fuente: `documentacion/anexos/2026-10-26_PROMPT_EXTRA_ACCESO_ALTAS_Y_FACTURACION.md`. Este anexo actualiza el `MASTER_PROMPT.md` en acceso, alta comercial y facturación. El resto del alcance sigue vigente.

Pedidos del usuario en el mismo mensaje (fuera del anexo):
- Pesos más finos al cargar series.
- Sensación por serie con aviso en vivo al entrenador de piso.
- Evolución por ejercicio y perfil en la comunidad.
- Conexión del proyecto con el repositorio de GitHub.

## 1. Qué había antes del anexo (Etapas 1–6)

| Tema | Implementado | Choca con el anexo |
|---|---|---|
| Alta de coach y gym | Autoalta desde Acceso: `createCoachOrganization` y `createGymOrganization` crean la organización operativa con prueba automática de 30 días | Sí: sólo Admin da de alta, tras el acuerdo; sin prueba automática |
| Invitación de alumno | Código de 6 caracteres; el email es opcional; cualquiera con el código la acepta | Sí: debe ir a un correo y el servidor valida que coincida al aceptar |
| Invitación de staff | Exige email, pero al aceptar no se valida la coincidencia | Sí: debe validarse |
| Alta de socio | DNI más padrón: si coincide, entra; si no, pedido a recepción, gerente o dueño | Sí: QR de sede, sin padrón obligatorio, aprobación humana por piso en turno o recepción |
| Turnos | Inicio y cierre real (`shift_log`) por sede, capacidades por rol | Se reutiliza para saber quién está en turno efectivo |
| Push | No hay: sólo contadores con actualización cada 10 s | Hace falta push real con registro de dispositivos y cola |
| Facturación | Sin implementar (Etapa 7). D01–D05 abiertas; la demo mostraba ARS 700 y tramos | El precio es por cliente; se cobra por todos los socios y alumnos acordados, no por uso |
| Admin | Página vacía con 2FA obligatoria | Hace falta el alta comercial, los términos con versión, la vista previa y la regularización |

## 2. Decisiones del anexo

**Confirmadas por el usuario (anexo §1):**
- Acceso cerrado por relación.
- Alta comercial sólo desde Admin, con invitación de bienvenida.
- Precio por unidad negociable por cliente.
- Gym: se factura por todos los socios del acuerdo.
- Coach: se factura por todos los alumnos vigentes.
- Gym: el total lo carga Admin.
- QR fijo de recepción con aviso push al piso en turno y bandeja de recepción.
- Invitación individual para alumnos.
- Una sola identidad por persona.
- Separación de los cobros (Repi al cliente, coach a sus alumnos, gym a sus socios).

**Propuestas del anexo (§2), implementadas como configuración visible:**
- Correo verificado como identidad principal.
- Total de alumnos del coach cargado por Admin.
- Validación humana con método registrado.
- Respaldo de gerente o dueño.
- Revisión mensual.
- Solicitud que vence a las 24 h.
- Ampliación de sede aparte.
- Aviso de escalamiento a los 5 minutos.

**Pendientes comerciales (§12), sin bloquear el desarrollo:**
- Qué cuenta como vigente.
- Ciclo, corte y prorrateo.
- Mora y suspensión.
- Cobertura multisede.
- Confirmación del origen del total del coach.
- Proveedor de email y push en producción.
- Política offline tras una baja.
- Textos legales y menores.

## 3. Cortes de trabajo

1. Alta comercial y contrato:
   - Ficha comercial y aceptación registrada.
   - Habilitación por Admin.
   - Invitación al responsable ligada al email: vence, se revoca, es de un solo uso y al reenviarla se invalida la anterior.
   - Regularización de los clientes existentes.
   - Cierre de las vías de autoalta.
2. Invitaciones ligadas al destinatario: alumno y staff validan el email al aceptar; se rechazan las invitaciones nuevas sin email.
3. Acceso del socio por QR:
   - Enlace público por sede, que se puede revocar y regenerar.
   - Identidad por correo verificado.
   - Solicitud persistida que vence a las 24 h.
   - Ampliación de sede y reactivación como trámites aparte.
   - Cancelación y rechazo con motivo apto para el socio.
4. Bandeja compartida de piso y recepción:
   - Piso resuelve sólo con turno efectivo en esa sede, verificado al confirmar.
   - Recepción, gerencia y dueño resuelven sin turno.
   - Decisión transaccional y única, con método y actor registrados.
5. Push y resiliencia:
   - Suscripciones por dispositivo y cola persistente con reintentos y deduplicación.
   - Texto mínimo en la pantalla bloqueada.
   - Pausa de avisos.
   - Escalamiento.
   - El service worker sigue funcionando para el entrenamiento offline.
6. Cantidad y precio por cliente:
   - Versiones separadas con vigencia, autor, motivo y evidencia.
   - Vista previa del período.
   - Cierre simulado con snapshot (sin cobros reales).
   - Alerta cuando los accesos superan el total acordado.
   - Vista de condiciones para el cliente y pedido de corrección.
7. Pedidos extra del usuario:
   - Peso con decimales y paso elegible.
   - Sensación por serie con aviso en vivo al piso (sólo sesiones del programa del gym).
   - Evolución por ejercicio y perfil de vitrina en Repi Club.
   - Repositorio de GitHub.

Estado: los siete cortes están implementados y verificados. El estado de cada criterio del anexo (§11, 1–21) está en `docs/IMPLEMENTATION_STATUS.md`, sección «Anexo acceso, altas y facturación»: 17 cumplen (dos sin una prueba propia para un caso) y 4 cumplen en parte.

## 4. Qué no se activó
- No se enviaron emails ni avisos push a clientes reales.
- No se cobró nada.
- Email: sólo buzón de desarrollo. Push: claves VAPID de desarrollo, sin prueba en un dispositivo real.
