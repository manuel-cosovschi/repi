# REPI — Interruptores por módulo

Código: `apps/web/src/lib/features.ts` (D111). Prueba: `apps/web/tests/features.test.ts`.

Un módulo apagado no se muestra: no hay botones hacia pantallas vacías ni capacidades anunciadas antes de tiempo. Apagar **no borra datos** y no cambia la base; encenderlo después recupera todo.

| Clave | Por defecto | Qué controla | Por qué |
| --- | --- | --- | --- |
| `adaptive` | encendido | «No vino el profe» / «Entrenar por mi cuenta» en Entrenar; botón «Reemplazos» en ambos constructores | Reglas sin IA, probado (D108, D110) |
| `club` | encendido | Pestaña «Club» del socio en su gimnasio | Publicación voluntaria con moderación, probado |
| `nutrition` | apagado | Pestaña «Nutrición» en la ficha del coach | Falta la carga desde la app del alumno: sería una pantalla vacía |
| `body` | apagado | Pestaña «Mi cuerpo» en la ficha del coach | Body Intelligence sin implementar (BI-1) |
| `exercise_video` | apagado | Recuadro de video en la sesión activa | Faltan medios licenciados |

## Cambiar sin tocar código

Variable `NEXT_PUBLIC_REPI_FEATURES` en Vercel, separada por comas: el nombre enciende, `-nombre` apaga. Ejemplo: `body,-club`. Claves desconocidas se ignoran. Se fija en el build: después de cambiarla hay que hacer **redeploy**.

## Regla para módulos nuevos

1. Nace con su clave en `FEATURES`, apagado.
2. Se prueba (unidad, integración y navegador) con la clave encendida en dev.
3. Se enciende en producción por defecto sólo cuando su fila de `RELEASE_READINESS.md` está verificada.
4. Los permisos se validan siempre en el servidor: el interruptor oculta la entrada, no reemplaza la autorización.
