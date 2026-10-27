"use client";
// Unidad de peso del alumno (F-HX-23, D95). La provee MemberApp desde /api/me/training; todo se guarda en kg.
import { createContext, useContext } from "react";
import type { WeightUnit } from "@repi/domain";

export const UnitContext = createContext<WeightUnit>("kg");
export const useUnit = () => useContext(UnitContext);
