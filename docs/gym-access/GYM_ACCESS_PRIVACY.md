# Gym Access · Privacidad (D127)

Marco: Ley 25.326 de Protección de Datos Personales y guías de la AAIP. **Revisión legal pendiente antes de habilitar la ubicación en un gimnasio real** (pendiente externo).

## Minimización

- El QR no contiene datos de personas.
- Por cada validación se guarda: persona, gimnasio, sede, hora, método, resultado, motivo de rechazo y, si se usó ubicación, **sólo el resultado** (`inside`, `outside`, `inaccurate`, `stale`, `unavailable`). **No se guardan coordenadas.**
- La ubicación se lee una vez, en el momento de validar, sólo si el gimnasio la usa y con el permiso del navegador. Nada en segundo plano.
- La cámara se abre sólo con «Escanear QR del gimnasio» y se apaga al cerrar.
- El dueño ve validaciones (hora, sede, resultado). No hay mapa, recorrido ni tiempo de permanencia.

## Transparencia

- La hoja «Validá tu ingreso» explica qué se pide y, si hay ubicación, que no se guarda dónde está la persona.
- El gimnasio debe informar a sus socios antes de activar el modo con ubicación (texto sugerido en la guía).
- La rutina, el historial, el progreso, la privacidad y la exportación de datos nunca se bloquean.

## Conservación

Las validaciones siguen la política general de retención de REPI para registros operativos. Al eliminar la cuenta, se borran en cascada con el resto de los datos de la persona.

## Pendientes externos

- Revisión legal del modo con ubicación y del texto informativo para socios.
- Inclusión en la Política de privacidad pública de la finalidad «validar el ingreso al gimnasio».
