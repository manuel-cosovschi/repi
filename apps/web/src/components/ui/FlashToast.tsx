"use client";
// Aviso del staff (Coach, Gym y Admin) con salida M06: entra con co-pop (200 ms, sin cambios) y, al irse, una copia inerte
// baja 6 px y se desvanece en 150 ms. El texto se anuncia por la región aria-live de cada app (este cuadro es aria-hidden).
import { useLayoutEffect, useRef } from "react";
import { ghostOut } from "@/lib/ghost";

export function FlashToast({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const n = ref.current; return () => ghostOut(n, "toast"); }, []);
  return <div ref={ref} className="co-toast" aria-hidden="true">{text}</div>;
}
