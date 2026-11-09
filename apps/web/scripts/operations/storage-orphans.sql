-- Detección de archivos huérfanos en el bucket privado (auditoría FSA1, 09/11/2026). SÓLO LECTURA: no borra nada.
-- Correr en Supabase (SQL editor o MCP) como postgres. Un objeto es candidato a huérfano si ninguna fila de media_object ni
-- de upload_intent lo nombra. Para cada uno muestra la evidencia necesaria para decidir a mano:
--   - dueño: el segundo segmento de la clave (progress/<usuario>/…, video/<usuario>/…) y si ese usuario todavía existe;
--   - antigüedad y tamaño.
-- Nunca borrar sólo por el nombre: un objeto subido hace minutos puede estar a mitad de su registro (upload_intent vence a
-- las 2 h). Borrar sólo lo que tenga más de 24 h, sin fila, con dueño inexistente o ya revisado, y siempre después de un
-- «Respaldo» en verde (el respaldo incluye Storage). Desde FSA1, purgeSandboxes borra los archivos de las demos al vencer.
select o.bucket_id,
       o.name,
       o.created_at,
       (o.metadata->>'size')::bigint as bytes,
       split_part(o.name, '/', 1) as tipo,
       split_part(o.name, '/', 2) as dueno,
       exists (select 1 from "user" u where u.id = split_part(o.name, '/', 2)) as dueno_existe,
       now() - o.created_at > interval '24 hours' as mas_de_24h
from storage.objects o
where o.bucket_id = 'repi-private'
  and not exists (select 1 from media_object m where m.storage_key = o.name)
  and not exists (select 1 from upload_intent i where i.storage_key = o.name)
order by o.created_at;
