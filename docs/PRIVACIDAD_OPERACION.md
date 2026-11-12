# REPI — Procedimiento de exportación y eliminación de datos (V1)

Actualizado: 27/10/2026. Requisito: F-PR-02 / N-O12 (docs/continuidad/CATALOGO_COMPLETO.md). Decisión: D75. **Borrador operativo técnico**: la política de retención, los plazos legales y el responsable del tratamiento están pendientes (docs/continuidad/DECISIONES_PENDIENTES.md). No reemplaza asesoramiento legal.

## Qué puede hacer la persona (autoservicio)

- **Descargar sus datos**: Perfil → «Tus datos» → «Descargar mis datos» (`GET /api/me/export`). JSON inmediato con cuenta, vínculos, aceptaciones, permisos compartidos, entrenamientos y series, check-ins, molestias, lesiones, pedidos, mensajes que envió, publicaciones del Club, peso corporal y objetivo, lista de fotos de progreso (cada foto se descarga desde Progreso › Fotos) y lista de archivos (sin el archivo). Nunca incluye mensajes ni notas de otras personas. Cada descarga queda en `audit_event` (`privacy.export`).
- **Pedir la eliminación**: Perfil → «Pedir que eliminen mi cuenta» (`POST /api/me/deletion`). Queda un `privacy_request` pendiente; puede cancelarlo mientras siga pendiente. Pedirla **no** corta el acceso ni borra nada.

## Qué hace REPI (operador con REPI Admin + 2FA)

1. Abrir REPI Admin → **Privacidad**. Ver el pedido (email al momento del pedido, nota).
2. Verificar identidad: el pedido sale de una sesión autenticada de esa cuenta; si hay dudas, confirmar por el email registrado.
3. Revisar dependencias antes de borrar:
   - ¿Es responsable de un gimnasio/coach con contrato vigente? Coordinar traspaso de responsable antes (no dejar una organización sin titular).
   - ¿Hay obligación de conservar algo (facturación, disputas, auditoría)? Conservarlo y anotarlo.
4. Ejecutar el borrado con una herramienta controlada (SQL en el editor de Supabase o script revisado), dentro de una transacción. Borrar el usuario (`delete from "user" where id = …`) elimina en cascada sesiones, cuentas de acceso, entrenamientos, series, check-ins, molestias, lesiones, pedidos, archivos registrados y mensajes de sus conversaciones como socio. Después borrar del bucket privado los objetos de `media_object` de esa persona (las claves están en `storage_key`; listarlas **antes** del borrado). Desde 0046 incluye las fotos de progreso (`progress/<usuario>/…`); peso, objetivo y fotos se borran en cascada con el usuario.
5. Registrar el resultado en Privacidad → «Registrar como resuelto» (qué se borró y qué se conservó y por qué) o «Rechazar» (motivo). Queda `resolved_by`, `resolved_at` y `audit_event`.
6. Avisar a la persona por email cuando haya proveedor de correo (D24/D70). Hasta entonces, por el canal acordado.

## Copias de seguridad

Los backups (cuando existan: plan pago de Supabase o exportación programada) conservan los datos borrados hasta que rotan. Explicarlo en la respuesta y en los textos legales cuando se definan. Plan gratuito actual: sin PITR ni backups descargables garantizados (gate G10 pendiente).

## Pendiente (V1.1)

Borrado automatizado con verificación, plazos legales, exportación de archivos (videos/imágenes) en el paquete y aviso por email.

## Fecha de nacimiento declarada después del registro (D203)

**Quién la declara:** si una cuenta no tiene fecha de nacimiento, la persona la declara una vez desde Progreso (Mi cuerpo o Fotos), con `POST /api/me/birth-date`. Es necesaria para usar el peso corporal, las fotos de progreso y las calorías.

**Qué queda registrado:** `audit_event` `account.birth_date_declared` con la elegibilidad resultante, sin la fecha.

**Corrección:** si la fecha es incorrecta, la corrige REPI desde soporte, con evidencia y registro. La app no permite reemplazarla, para que una persona menor no pueda pasar como adulta.

## Asistente REPI (Adaptive Coaching 3.0, D210)

- **Qué guarda, sólo de la persona:**
  - preferencias del asistente;
  - lo que pidió que recuerde (con vencimiento: lo temporal vence solo; lo revocado se borra a los 30 días);
  - conversaciones;
  - avisos que REPI mostró o calló;
  - acciones que propuso o ejecutó con su resultado;
  - uso de IA **sin contenido** (sólo tokens, costo y resultado).
- **Quién lo ve:** sólo la persona.
  - El entrenador ve «Señales de REPI»: análisis de datos registrados, con origen. Requiere su consentimiento de entrenamiento; en el gimnasio, además `program.edit`.
  - Ni el entrenador ni la gerencia ven la conversación ni la memoria. REPI Admin ve sólo agregados de uso y costo, sin datos de alumnos.
- **Autoservicio:**
  - «Mis datos» exporta todo lo del asistente (`exportBrainData`).
  - Perfil → Asistente REPI permite ver y borrar lo que recuerda, y apagar avisos y push.
  - Borrar la cuenta lo elimina por cascada.
- **Retención diaria** (cron `purge-media` → `purgeBrainRetention`):
  - mensajes: 180 días;
  - avisos resueltos, suprimidos o vencidos: 90 días;
  - uso de IA: 400 días.
- **Demos:** la purga de demos borra todo por cascada.
- **IA (OpenAI, gasto aprobado por el titular el 07/11/2026):**
  - Sólo para conversación libre, con un contexto mínimo: sin emails, nombres de terceros, fotos, notas privadas de otros ni salud sin consentimiento.
  - Topes: 30 mensajes por persona por día, US$2 por día en total y US$20 por mes por organización. Al tope, o sin clave, responde por reglas.
  - Se cambia en Admin → Coaching IA.
- **Salud y menores:**
  - Ante frases de alarma responde con un texto fijo (parar y llamar al 107/911) y nunca diagnostica.
  - Con menores o edad desconocida no habla de peso corporal ni de alimentación, y no manda push de coaching.

