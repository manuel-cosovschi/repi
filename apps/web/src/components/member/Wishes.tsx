"use client";
// D139 → D217: «Lo que buscás entrenando» pasó a ser «Tu perfil de entrenamiento» (TrainingProfile). Se conserva el nombre
// anterior como envoltorio fino para no romper importaciones viejas; la app del alumno usa TrainingProfile directamente.
import { TrainingProfile } from "./TrainingProfile";

export function Wishes(props: { offline: boolean; flash: (m: string) => void }) {
  return <TrainingProfile {...props} />;
}
