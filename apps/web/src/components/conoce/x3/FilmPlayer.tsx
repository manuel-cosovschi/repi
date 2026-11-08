"use client";
// Sala de proyección: el video ocupa la pantalla en un <dialog> modal (foco atrapado, Escape cierra) y arranca con sonido sólo
// porque la persona lo pidió con un toque. Un solo video a la vez. Mide apertura (film_open), reproducción, 25/50/75 % y fin
// (site_event), venga de donde venga. En un teléfono en vertical, si el film tiene versión 9:16, se abre esa.
// Debajo, sólo una línea con lo que muestra el film. Los films no tienen voz: la pista WebVTT de descripciones queda para los
// lectores de pantalla. La atribución de la música (CC BY 4.0) está en /creditos, enlazada desde el pie.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import type { Video } from "@/content/conoce";
import type { Profile } from "@/lib/site-events";
import { track } from "@/lib/site-track";

type Open = (v: Video, profile?: Profile | null) => void;
const Ctx = createContext<Open>(() => {});
export const useFilm = () => useContext(Ctx);

export function FilmProvider({ children }: { children: React.ReactNode }) {
  const [film, setFilm] = useState<{ v: Video; profile: Profile | null; tall: boolean } | null>(null);
  const dlg = useRef<HTMLDialogElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const marks = useRef(new Set<number>());
  const back = useRef<HTMLElement | null>(null);
  const open = useCallback<Open>((v, profile = null) => {
    back.current = document.activeElement as HTMLElement | null;
    const tall = !!v.srcVertical && window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches;
    marks.current = new Set(); setFilm({ v, profile, tall });
    track("film_open", { profile, target: v.id });
    track("video_play", { profile, target: v.id });
  }, []);
  useEffect(() => {
    if (!film) return;
    dlg.current?.showModal();
    vid.current?.play().catch(() => {});
  }, [film]);
  const close = () => { vid.current?.pause(); dlg.current?.close(); setFilm(null); back.current?.focus?.(); };
  const onTime = () => {
    const el = vid.current; if (!el || !el.duration || !film) return;
    const pct = (el.currentTime / el.duration) * 100;
    for (const m of [25, 50, 75]) if (pct >= m && !marks.current.has(m)) { marks.current.add(m); track("video_progress", { profile: film.profile, target: `${film.v.id}-${m}` }); }
  };
  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog ref={dlg} className="x3-film" aria-label={film?.v.title ?? "Video"} onClose={() => film && close()} onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {film && (
          <div className={`x3-film-box${film.v.vertical || film.tall ? " vertical" : ""}`}>
            <div className="x3-film-head"><b>{film.v.title}</b><button type="button" className="x3-film-x" onClick={close} aria-label="Cerrar el video"><X size={22} weight="bold" /></button></div>
            {/* Proporción fija desde el primer cuadro: el diálogo no salta cuando llegan el póster o los metadatos. */}
            <video ref={vid} controls playsInline preload="metadata" style={{ aspectRatio: film.v.vertical || film.tall ? "9 / 16" : "16 / 9" }}
              poster={(film.tall ? film.v.posterVertical : film.v.poster) ?? undefined} onTimeUpdate={onTime} onEnded={() => track("video_complete", { profile: film.profile, target: film.v.id })}>
              <source src={film.tall ? film.v.srcVertical! : film.v.src!} type="video/mp4" />
              {film.v.captions && <track kind="captions" src={film.v.captions} srcLang="es" label="Español" default />}
              {film.v.descriptionTrack && <track kind="descriptions" src={film.v.descriptionTrack} srcLang="es" label="Descripción en texto" />}
            </video>
            {film.v.summary && <p className="x3-film-sum">{film.v.summary}</p>}
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}
