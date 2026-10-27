# REPI — Procedimiento de exportación y eliminación de datos (V1)

Actualizado: 27/10/2026. Requisito: F-PR-02 / N-O12 (docs/continuidad/CATALOGO_COMPLETO.md). Decisión: D75. **Borrador operativo técnico**: la política de retención, los plazos legales y el responsable del tratamiento están pendientes (docs/continuidad/DECISIONES_PENDIENTES.md). No reemplaza asesoramiento legal.

## Qué puede hacer la persona (autoservicio)

- **Descargar sus datos**: Perfil → «Tus datos» → «Descargar mis datos» (`GET /api/me/export`). JSON inmediato con cuenta, vínculos, aceptaciones, permisos compartidos, entrenamientos y series, check-ins, molestias, lesiones, pedidos, mensajes que envió, publicaciones del Club y lista de archivos (sin el archivo). Nunca incluye mensajes ni notas de otras personas. Cada descarga queda en `audit_event` (`privacy.export`).
- **Pedir la eliminación**: Perfil → «Pedir que eliminen mi cuenta» (`POST /api/me/deletion`). Queda un `privacy_request` pendiente; puede cancelarlo mientras siga pendiente. Pedirla **no** corta el acceso ni borra nada.

## Qué hace REPI (operador con REPI Admin + 2FA)

1. Abrir REPI Admin → **Privacidad**. Ver el pedido (email al momento del pedido, nota).
2. Verificar identidad: el pedido sale de una sesión autenticada de esa cuenta; si hay dudas, confirmar por el email registrado.
3. Revisar dependencias antes de borrar:
   - ¿Es responsable de un gimnasio/coach con contrato vigente? Coordinar traspaso de responsable antes (no dejar una organización sin titular).
   - ¿Hay obligación de conservar algo (facturación, disputas, auditoría)? Conservarlo y anotarlo.
4. Ejecutar el borrado con una herramienta controlada (SQL en el editor de Supabase o script revisado), dentro de una transacción. Borrar el usuario (`delete from "user" where id = …`) elimina en cascada sesiones, cuentas de acceso, entrenamientos, series, check-ins, molestias, lesiones, pedidos, archivos registrados y mensajes de sus conversaciones como socio. Después borrar del bucket privado los objetos de `media_object` de esa persona (las claves están en `storage_key`; listarlas **antes** del borrado).
5. Registrar el resultado en Privacidad → «Registrar como resuelto» (qué se borró y qué se conservó y por qué) o «Rechazar» (motivo). Queda `resolved_by`, `resolved_at` y `audit_event`.
6. Avisar a la persona por email cuando haya proveedor de correo (D24/D70). Hasta entonces, por el canal acordado.

## Copias de seguridad

Los backups (cuando existan: plan pago de Supabase o exportación programada) conservan los datos borrados hasta que rotan. Explicarlo en la respuesta y en los textos legales cuando se definan. Plan gratuito actual: sin PITR ni backups descargables garantizados (gate G10 pendiente).

## Pendiente (V1.1)

Borrado automatizado con verificación, plazos legales, exportación de archivos (videos/imágenes) en el paquete y aviso por email.
