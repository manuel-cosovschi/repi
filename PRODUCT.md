# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Gym owners and managers** (primary commercial target). They arrive mostly from a phone, often by scanning the QR on a REPI T-shirt at events such as the ATICMA Awards, and decide whether to ask for a demo or an implementation.
- **Independent personal trainers.** They evaluate whether REPI can hold their clients, programs and follow-up in one place.
- **Members and athletes.** They want to know what to do in each set and see their progress; they reach REPI through their gym or coach.
- **Companies, investors and partners.** They evaluate the product, the B2B2C model and the real implementation.

## Product Purpose

REPI connects the gym, its trainers and each member around every set: programs, set-by-set logging, an explainable target for the next set (Training Intelligence), progress, and the floor team's follow-up. Success on the commercial site is a qualified lead (form, WhatsApp, meeting) or a started guided demo.

## Positioning

Training Intelligence is deterministic and explainable: for each set it shows previous, recommended and real values, and why the next target changed. It never raises the load mid-session. It works for gyms, independent coaches and their members on the same platform, and it already runs in a real gym.

## Operating Context

- **Live demos:** guided demos with fictitious data for four roles (gym owner, floor trainer, member, personal trainer) at `/demo`.
- **QR and analytics:** a permanent QR with UTM tags (`/qr`, `/qr/<campaign>`), and first-party, cookieless analytics (`site_event`).
- **Leads:** the lead form feeds REPI Admin; WhatsApp and email are also offered.

## Capabilities and Constraints

- **Available capabilities:** only those in `docs/comercial/ESTADO_Y_LIMITES.md` and `apps/web/src/content/conoce.ts`.
- **Training Intelligence examples:** must come from the real engine (`@repi/domain/intelligence`) or the demos.
- **Body Intelligence:** only its current stage (weight, goal, private photos). Measurements are in development.
- **Public URLs to keep:**
  - `/conoce`, `/conoce/gimnasios`, `/conoce/entrenadores`, `/conoce/deportistas`, `/conoce/aliados`
  - `/qr`, `/qr/<campaign>`
  - `/demo`
- **Do not fabricate:** prices, metrics, customers, testimonials or results.

## Brand Commitments

- **Concept 2 · Friendly Performance, G · Atlética** (`docs/DESIGN_CONTRACT.md`, `REPI_SELECCION_VISUAL.md`).
- **Type:** Barlow Condensed 700 for headlines, Barlow for body. Inter Tight is discarded.
- **Logo:** original lowercase wordmark with a cyan dot on the «i» (`apps/web/public/brand/wm_full.png`), never redrawn.
- **Palette:**

  | Color | Role |
  | --- | --- |
  | `#0B0F14` | Navy |
  | `#1A2433` | Secondary surface |
  | `#2D3B4F` | Blue-grey |
  | `#00D1FF` | Brand cyan |
  | `#5DE6D8` | Turquoise |
  | `#F8FAFC` | White |
  | `#F4F1EA` | Cream (light experience) |

- **Claim:** «Cada repetición cuenta.»
- **Voice:** Rioplatense Spanish, precise, without empty superlatives.
- **Audio:** commercial films are instrumental only, with no voiceover or synthetic voices.

## Evidence on Hand

- **Smart Center Gym, Mar del Plata:** a real implementation. Logo authorized (`apps/web/public/conoce/smart-center-gym.webp`). No authorized photos of the gym are in the repository yet.
- **Product material:** real product screenshots and screen recordings of the guided demo (`apps/web/public/conoce/shots/`, `apps/web/public/conoce/videos/`).
- **Not available, so never fabricate:** testimonials, usage numbers, percentages or market metrics.

## Product Principles

1. Show the real product doing real things. A demonstration beats a claim.
2. Every number on screen comes from the engine, a demo or a labelled fictitious scenario.
3. Conversion is always one tap away: demo, form or WhatsApp.
4. Explain visually first; text supports, it does not carry the explanation alone.
5. Respect the visitor: no autoplay sound, no aggressive pop-ups, no false urgency.

## Accessibility & Inclusion

WCAG 2.2 AA target. Respect `prefers-reduced-motion`. Every video must be understandable without sound. No essential information may live only inside a 3D or animated effect. Most visitors are on phones, often on mobile data.
