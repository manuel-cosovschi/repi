# REPI — ubicación y trabajo compartido

## Ubicación activa

El repositorio principal está en `/Users/manuelcosovschi/Proyectos Locales/Repi`, fuera de iCloud. Usar esta carpeta explícitamente como directorio de trabajo. Los espacios del nombre son intencionales: citar rutas en comandos y usar `fileURLToPath` para convertir URLs de archivos.

`~/Desktop/Repi` es una copia histórica congelada. No editarla, ejecutar servidores desde ella ni copiar su estado sobre el repositorio actual. No borrar esa copia: el titular decidirá cuándo hacerlo.

## Continuidad

Leer `CLAUDE.md`, `MASTER_PROMPT.md` y el inicio de `docs/continuidad/PROXIMA_SESION.md`. Las entradas más recientes van primero. Comprobar `git status`, rama y últimos commits antes de actuar; una tarea antigua puede haber sido terminada por otra sesión.

Claude y Codex pueden trabajar sobre este producto. Preservar los cambios ajenos y no repetir funciones ya integradas. Antes de implementar, identificar los archivos que están en uso; preferir trabajo independiente y un checkout aislado cuando haya desarrollo simultáneo. No cambiar la rama de una carpeta que otra sesión está utilizando.

No ejecutar dos suites de integración simultáneas contra la misma base descartable: el inicio de la suite recrea sus esquemas. No correr `next build` sobre el mismo `.next` de un servidor de desarrollo activo. Identificar los procesos por su carpeta antes de detenerlos; no detener servidores de otros proyectos.

Los secretos siguen fuera de Git, en la configuración local ignorada y `~/.repi-secrets/`. Nunca imprimirlos ni trasladarlos a documentación. Seguir las instrucciones de `apps/web/AGENTS.md` al modificar la aplicación.

## Diseño

**Tipografía oficial y definitiva: Barlow (cuerpo e interfaz) y Barlow Condensed (títulos destacados), dirección G · Atlética.** Inter Tight está descartada y esta regla tiene prioridad sobre cualquier máster o pedido que la mencione (Adaptive Coach, Repi Proactivo, Coach, Gym, Body Intelligence). Logo e isotipo originales intactos; no cambiar componentes que ya usan Barlow (confirmado por el titular, 27/10/2026). Fuente de verdad: el handoff de Claude Design y `REPI_SELECCION_VISUAL.md`; contrato en `docs/DESIGN_CONTRACT.md`.
