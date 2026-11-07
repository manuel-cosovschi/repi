"use client";
// Centro audiovisual (D205). Si hay video (src en content/conoce.ts → VIDEOS) se muestra el póster con «Reproducir» y el
// video carga recién al tocar (preload="none"): nada se reproduce solo. Si no hay video, la captura real del producto, sin
// reproductor ni marcadores vacíos. Mide reproducción, 25/50/75 % y finalización.
import { useRef, useState } from "react";
import { Play } from "@phosphor-icons/react";
import type { Video } from "@/content/conoce";
import type { Profile } from "@/lib/site-events";
import { track } from "@/lib/site-track";

export function Media({ video, shot, alt, profile, phone = true }: { video?: Video | null; shot: string; alt: string; profile?: Profile | null; phone?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const marks = useRef(new Set<number>());
  const ref = useRef<HTMLVideoElement>(null);
  const has = !!video?.src;

  if (!has) {
    return (
      <figure className={phone ? "cn-phone" : "cn-shot"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot} alt={alt} loading="lazy" decoding="async" width={390} height={844} />
      </figure>
    );
  }
  const v = video!;
  const start = () => {
    setPlaying(true);
    track("video_play", { profile, target: v.id });
    requestAnimationFrame(() => ref.current?.play().catch(() => {}));
  };
  const onTime = () => {
    const el = ref.current;
    if (!el || !el.duration) return;
    const pct = (el.currentTime / el.duration) * 100;
    for (const m of [25, 50, 75]) if (pct >= m && !marks.current.has(m)) { marks.current.add(m); track("video_progress", { profile, target: `${v.id}-${m}` }); }
  };
  return (
    <figure className={`cn-video${v.vertical ? " vertical" : ""}`}>
      {playing ? (
        <video ref={ref} controls playsInline preload="none" poster={v.poster ?? shot} onTimeUpdate={onTime} onEnded={() => track("video_complete", { profile, target: v.id })} aria-label={v.title}>
          <source src={v.src!} type={v.src!.endsWith(".webm") ? "video/webm" : "video/mp4"} />
          {v.captions && <track kind="captions" src={v.captions} srcLang="es" label="Español" default />}
        </video>
      ) : (
        <button type="button" className="cn-video-poster" onClick={start} aria-label={`Reproducir: ${v.title}${v.duration ? ` (${v.duration})` : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.poster ?? shot} alt="" loading="lazy" decoding="async" />
          <span className="cn-play" aria-hidden="true"><Play size={26} weight="fill" /></span>
          {v.duration && <span className="cn-dur">{v.duration}</span>}
        </button>
      )}
      <figcaption>{v.title}</figcaption>
    </figure>
  );
}
