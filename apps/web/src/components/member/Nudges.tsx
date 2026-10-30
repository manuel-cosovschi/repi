"use client";
// D168: invitaciones de REPI a rankings, desafíos y trofeos, calculadas con lo que la persona entrena (server/community/nudges).
// Cada una se puede descartar («Ahora no»): queda descartada en este teléfono; una situación nueva (otro puesto, otro desafío)
// trae otra invitación. Sumarse al ranking o subir un intento lo decide la persona con un toque.
import { useCallback, useEffect, useState } from "react";
import { ChartBar, Lightning, Medal, Trophy, X, type Icon } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { Ic } from "@/components/ui/Ic";

export type NudgeAction = "challenge" | "ranking_optin" | "club" | "progress";
export type Nudge = { id: string; title: string; body: string; cta: string; action: NudgeAction; challengeId?: string; exerciseId?: string };
export type NudgeGo = (n: Nudge) => void;

const ICON: Record<NudgeAction, Icon> = { challenge: Trophy, ranking_optin: ChartBar, club: ChartBar, progress: Medal };
const KEY = "repi:nudges:off";
const dismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const dismiss = (id: string) => { try { localStorage.setItem(KEY, JSON.stringify([...dismissed(), id].slice(-80))); } catch { /* sin almacenamiento: vuelve a aparecer */ } };

/**
 * Lista de invitaciones. `only` filtra por tipo de acción (por ejemplo, sólo desafíos en la pestaña Desafíos) y `exclude`
 * deja afuera un tipo por prefijo de id (los desafíos nuevos ya están en la lista de Desafíos); `max` cuántas
 * se muestran. `refresh` recarga desde afuera (al volver de entrenar).
 */
export function Nudges({ go, flash, only, exclude, max = 2, refresh = 0, title = "REPI te propone" }: { go: NudgeGo; flash: (t: string) => void; only?: NudgeAction[]; exclude?: string; max?: number; refresh?: number; title?: string }) {
  const [list, setList] = useState<Nudge[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api<{ orgId: string | null; nudges: Nudge[] }>("/api/me/gym/nudges").then((x) => { setOrgId(x.orgId); setList(x.nudges); }).catch(() => setList([])), []);
  useEffect(() => { void load(); }, [load, refresh]);
  if (!list) return null;
  const off = dismissed();
  const shown = list.filter((n) => !off.includes(n.id) && (!only || only.includes(n.action)) && !(exclude && n.id.startsWith(exclude))).slice(0, max);
  if (!shown.length) return null;
  const act = async (n: Nudge) => {
    if (n.action !== "ranking_optin") { go(n); return; }
    if (!orgId) return;
    setBusy(n.id);
    try {
      const st = await api<{ showName: boolean }>(`/api/me/gym/club/ranking?org=${orgId}`, { body: {} });
      flash(`Ya estás en el ranking. Figurás ${st.showName ? "con nombre e inicial" : "como «Socio/a del gym»"}; lo cambiás cuando quieras en Club.`);
      go({ ...n, action: "club" });
    } catch (e) { flash((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <section className="ndg" aria-label={title}>
      <h2><Ic i={Lightning} size={16} weight="fill" color="#00D1FF" />{title}</h2>
      {shown.map((n) => (
        <div key={n.id} className={`ndg-card ndg-${n.action}`}>
          <span className="ndg-ic" aria-hidden="true"><Ic i={ICON[n.action]} size={22} weight="fill" color="#00D1FF" /></span>
          <span className="ndg-txt"><b>{n.title}</b><small>{n.body}</small>
            <button type="button" className="cta sm ndg-cta" aria-busy={busy === n.id || undefined} disabled={busy === n.id} onClick={() => void act(n)}>{n.cta}</button>
          </span>
          <button type="button" className="ndg-x" aria-label={`Ahora no: ${n.title}`} onClick={() => { dismiss(n.id); setList((l) => (l ? [...l] : l)); }}><Ic i={X} size={16} /></button>
        </div>
      ))}
    </section>
  );
}
