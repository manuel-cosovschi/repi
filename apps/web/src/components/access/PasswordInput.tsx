"use client";
// Campo de contraseña con botón para ver u ocultar lo escrito (pedido de alumnos: en el teléfono es fácil equivocarse).
// Arranca oculto; mostrarla es una decisión de la persona en ese momento y no se recuerda.
import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Ic } from "@/components/ui/Ic";

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <span className="ac-pw">
      <input {...props} type={shown ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="button" className="ac-pw-eye" aria-pressed={shown} aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-controls={props.id} onClick={() => setShown((x) => !x)}>
        <Ic i={shown ? EyeSlash : Eye} size={20} />
      </button>
    </span>
  );
}
