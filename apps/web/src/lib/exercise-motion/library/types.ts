// Una entrada de la biblioteca oficial de REPI Exercise Motion: la demostración (animación vectorial propia), la técnica
// escrita, los músculos y qué ejercicios del catálogo demuestra. Se revisa por PR: nada se publica sin revisión.
import type { MuscleId } from "../muscles";
import type { MotionSpec } from "../types";

export type MotionEntry = {
  /** Identificador estable del movimiento canónico (kebab-case, sin acentos). */
  id: string;
  /** Sube cuando cambia la animación o la técnica. */
  version: number;
  /** Nombre visible del movimiento. */
  title: string;
  /** Nombres EXACTOS del catálogo global que esta demostración muestra tal cual (mismo equipo, agarre y posición). */
  catalog: string[];
  /**
   * Ejercicios del catálogo parecidos pero no idénticos: se ofrece la demostración avisando la diferencia («Variante
   * compatible: …»). Nunca se presentan como el ejercicio exacto.
   */
  compatible?: { name: string; difference: string }[];
  /** Equipamiento, en palabras simples («barra», «banco plano», «polea alta»). */
  equipment: string[];
  /** Grupo de la biblioteca (igual que el catálogo). */
  group: "Pecho" | "Espalda" | "Hombros" | "Brazos" | "Piernas" | "Glúteos" | "Core";
  motion: MotionSpec;
  technique: {
    /** Cómo se prepara (posición, agarre, ajuste de la máquina). 2–4 frases cortas. */
    setup: string[];
    /** Cómo se ejecuta una repetición. 2–4 frases. */
    execution: string[];
    /** Claves para pensar durante la serie (muy cortas). 2–4. */
    cues: string[];
    /** Errores comunes y cómo corregirlos. 2–4. */
    mistakes: string[];
    /** Respiración, si aporta. */
    breathing?: string;
  };
  anatomy: { primary: MuscleId[]; secondary: MuscleId[] };
  /** Revisión: «internal» = revisada por el equipo de REPI contra la técnica estándar; «professional» = validada por un profesional. */
  review: { status: "internal" | "professional"; date: string; notes?: string };
};
