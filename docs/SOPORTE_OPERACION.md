# REPI — Soporte e incidentes (procedimiento operativo)

27/10/2026 · N-O11 · D93. Propuesta operativa para el piloto; el titular confirma responsables, horarios y plazos de respuesta (no hay SLA comprometido).

## Canal

- **Ayuda y soporte** en `/ayuda`: enlace en el login («¿No podés entrar?»), en Perfil del alumno y junto a «Cerrar sesión» en Coach, Gym y Admin. Abierta sin sesión para quien no puede entrar.
- Cada consulta recibe un código `S-XXXXXX` (sin 0/O ni 1/I/L) para referirse a ella por correo o teléfono. El código no da acceso a nada.
- Con sesión: la consulta queda ligada a la cuenta y la persona ve estado y respuesta en la misma pantalla.
- Sin sesión: se guarda sólo el correo que escribió, **sin verificar** y sin ligarlo a una cuenta aunque coincida. La respuesta es la misma exista o no la cuenta. Límites: 5 envíos cada 10 min por IP y 3 por día por correo.
- Datos técnicos opcionales (casilla visible, activada por defecto con la lista exacta): versión, navegador, si está instalada, conexión, cantidad de cambios sin sincronizar y ruta sin query. Nada de entrenamientos, mensajes ni salud. El servidor descarta cualquier otro dato.

## Atención (REPI Admin → Soporte)

1. Revisar «Abiertas» (los incidentes abiertos van primero; el Resumen muestra el conteo).
2. **Tomar** la consulta (pasa a «En revisión»).
3. Identificación mínima: con sesión se ven nombre y correo de la cuenta; sin sesión, sólo el correo escrito. No pedir contraseñas, códigos 2FA ni datos de salud.
4. Resolver por los caminos propios de la persona:
   - Contraseña olvidada → «Olvidé mi contraseña» (`/acceso?step=rec1`).
   - App de autenticación perdida → códigos de respaldo. Sin códigos: verificar identidad por un canal independiente (correo verificado de la cuenta + confirmación del responsable de su gym/coach) y escalar al titular; no hay reseteo de 2FA desde la consola.
   - Sin acceso a su gym/coach → la relación la resuelve la organización (bandeja de altas, reactivación); REPI no la crea.
   - Datos sin sincronizar → pedir que no cierre sesión ni borre datos del navegador; revisar logs (`docs/DESPLIEGUE.md`) por la versión y la hora.
   - Privacidad (exportar/eliminar) → Perfil «Tus datos» y `docs/PRIVACIDAD_OPERACION.md`.
5. Responder por el correo de contacto. Registrar en «Respuesta» lo que se respondió (con sesión, la persona lo ve) y en «Nota interna» lo que sólo ve REPI. Marcar como respondida (exige respuesta). Se puede reabrir; todo queda en la auditoría (`support.*`, sin el texto).

**Nunca:** entrar a la cuenta de otra persona, cambiar su email o contraseña, leer chats, notas o salud para resolver una consulta, ni confirmar a un tercero si un correo tiene cuenta.

## Incidentes

Un incidente afecta a varias personas, a una organización completa, a datos (pérdida o mezcla) o a la seguridad.

1. **Marcar como incidente** en la consulta (o en la primera que lo reporte) y anotar el alcance en la nota interna.
2. Diagnóstico: `vercel logs` / panel de Vercel (filtrar `"level":"error"`), resumen Admin (accesos denegados, avisos push fallidos), estado de Supabase.
3. Contención: revertir el deploy desde Vercel («Promote» del deploy anterior) si el problema vino con una versión; la PWA ofrece actualizar sin borrar pendientes (D92). Si hay datos en riesgo, respaldo inmediato (`pnpm ops:backup --source=hosted`).
4. Comunicar a los responsables de las organizaciones afectadas por correo, sin datos de otras personas.
5. Cerrar con respuesta (qué pasó, qué se hizo, qué queda) y quitar la marca de incidente si fue una falsa alarma. Si hubo exposición de datos personales, el titular decide las notificaciones que correspondan (pendiente de política, G11).

## Pendiente del titular

- Responsable(s) de soporte y horario; plazo de primera respuesta para el piloto.
- Correo de contacto público (hoy el canal es el formulario; las respuestas salen del correo del equipo).
- Procedimiento de verificación de identidad para recuperar 2FA sin códigos de respaldo.
