# Cómo continuar con otro Claude

## Si cambiás de chat/cuenta pero seguís en esta computadora

Abrí **la misma carpeta Repi** como proyecto en Claude Code y pegá PROMPT_INICIAL.md. Los archivos, Git y servicios locales siguen donde están; no hace falta exportar el chat ni crear otra app. Antes de alternar, pedile al Claude actual que termine su bloque o deje checkpoint y guardá todos sus archivos. Evitá que dos Claudes editen simultáneamente el mismo módulo. No cierres una tarea a mitad de una migración.

El estado se reconstruye del código, del historial y de docs/continuidad/PROXIMA_SESION.md. Si el otro Claude avanzó después del corte de este documento, su evidencia posterior y el Git actual se revisan antes de ejecutar el próximo paso.

## Si además cambiás de computadora o entorno

La carpeta contiene código/documentación/assets, pero **no incluye automáticamente PostgreSQL ni las credenciales ni todo el almacenamiento privado**. Verificar si hay datos reales que deban conservarse antes de empezar. No correr seed para reemplazar una base que existe.

Transferir mediante repositorio privado o copia controlada: código, lockfile, migraciones, scripts, documentación, handoff vigente y assets. Omitir node_modules, .next, cachés de render, archivos temporales y dependencias regenerables. Si se comparte un ZIP con terceros, no incluir .env*, credenciales, tokens, backups de datos reales ni archivos privados de usuarios. .env.example se puede compartir tras revisar que no contiene secretos. No asumir que un ZIP respeta .gitignore.

Si hay DB y archivos privados a migrar, realizar backup/restauración por un canal seguro independiente, con autorización y verificación de datos. Documentar el procedimiento y nombres de variables, nunca copiar valores secretos al máster. Configurar el nuevo entorno con el titular de las credenciales. Test y producción deben usar bases distintas.

Seguir README para comandos locales, verificando scripts actuales. `pnpm install --frozen-lockfile`, tipos y build sólo cuando el entorno esté preparado; migraciones según el entorno correcto. La suite de integración elimina esquemas de su DB de test, por lo que hay que verificar su destino y reforzar la guarda. No correr seeds o DROP contra desarrollo con datos útiles o producción.

## Checkpoint antes de agotar contexto

Pedir al Claude saliente que actualice PROXIMA_SESION.md: commit, cambios sin commit, archivos, qué funciona, pruebas exactas, migraciones pendientes, decisiones, servicios activos y próximo paso ejecutable. Guardar trabajo sin inventar un commit ni hacer push automáticamente. No depender de mensajes del chat o memoria de una cuenta.

La documentación de continuidad ya fue creada; el próximo Claude debe mantenerla, no generar otro paquete equivalente desde cero. La evidencia de un desarrollo posterior prevalece sobre el snapshot del 27/10, sin perder las decisiones humanas.
