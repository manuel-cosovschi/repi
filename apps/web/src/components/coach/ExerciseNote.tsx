"use client";
// D174: nota por ejercicio (pedido de un entrenador): una indicación debajo del ejercicio que el alumno ve al entrenarlo.
// El dato ya existía en el programa (`note` de cada ejercicio); acá se escribe desde la fila del constructor.

export const EXERCISE_NOTE_MAX = 300;

/** Botón «+ Nota» que va junto a «Series y técnica». */
export function NoteButton({ name, onOpen }: { name: string; onOpen: () => void }) {
  return <button type="button" className="ex-note-btn" onClick={onOpen} aria-label={`Agregar una nota a ${name}`}>+ Nota</button>;
}

/** Campo de la nota, a lo ancho de la fila. Si se deja vacío, se cierra solo. */
export function NoteField({ name, value, who, onChange, onEmpty }: { name: string; value: string; who: string; onChange: (v: string) => void; onEmpty: () => void }) {
  return (
    <label className="ex-note">
      <span>Nota</span>
      <input value={value} maxLength={EXERCISE_NOTE_MAX} autoFocus={!value} aria-label={`Nota de ${name}`}
        placeholder={`Indicación para este ejercicio: la ve ${who} al entrenarlo`}
        onChange={(ev) => onChange(ev.target.value)} onBlur={() => { if (!value.trim()) onEmpty(); }} />
    </label>
  );
}
