// Fuente única de tokens. Copia completa de REPI_COMPLETE_DESIGN_HANDOFF/design-tokens.json
// + color.access tomado de REPI Acceso.dc.html (ver docs/DESIGN_CONTRACT.md).
// Regenerar CSS: pnpm --filter @repi/web tokens
export const tokens = {
  "brand": {
    "name": "repi",
    "tagline": "Cada repetición cuenta.",
    "concept": "Concepto 2 · Friendly Performance",
    "logo_rule": "Usar PNG original (assets/logos, assets/brand-original). El vector no existe todavía; no reconstruir con Inter Tight."
  },
  "color": {
    "core": {
      "navy900": "#0B0F14",
      "navy800": "#1A2433",
      "navy700": "#2D3B4F",
      "cyan": "#00D1FF",
      "turquoise": "#5DE6D8",
      "white": "#F8FAFC"
    },
    "dark": {
      "bg": "#0B0F14",
      "surface": "#1A2433",
      "surface_2": "#131C28",
      "border": "#2D3B4F",
      "ink": "#F8FAFC",
      "ink_2": "#E2E8F0",
      "muted": "#94A3B8",
      "accent": "#00D1FF",
      "on_accent": "#0B0F14",
      "light_card": "#F8FAFC"
    },
    "light": {
      "page": "#F3F5F8",
      "surface": "#FFFFFF",
      "border": "#E2E8F0",
      "border_strong": "#D5DCE5",
      "divider": "#EEF2F6",
      "ink": "#0B0F14",
      "ink_2": "#334155",
      "muted": "#5B6B80",
      "accent_text": "#007EA0",
      "accent_text_hover": "#005F79",
      "selection_bg": "#E6F9FE",
      "selection_border": "#9BE6F7",
      "sidebar": "#0B0F14",
      "sidebar_active": "#1A2433",
      "sidebar_muted": "#94A3B8",
      "demo_bar": "#E6EBF1"
    },
    "semantic": {
      "success": "#10B981",
      "warning": "#F59E0B",
      "error": "#EF4444",
      "chip": {
        "info": [
          "#E6F9FE",
          "#006B88"
        ],
        "ok": [
          "#E8F8F1",
          "#047857"
        ],
        "warn": [
          "#FFF4DE",
          "#8A5300"
        ],
        "bad": [
          "#FDECEC",
          "#B42318"
        ],
        "mute": [
          "#EEF2F6",
          "#475569"
        ]
      }
    },
    "usage": "Cian solo para CTA, selección, foco e indicadores; texto sobre cian siempre #0B0F14. Sin gradientes decorativos salvo tarjeta de entrenamiento del día y fondo de visor.",
    "access": {
      "page": "#0E141B",
      "glow": "#13263a",
      "dark_err": "#FCA5A5",
      "light_err": "#B42318",
      "light_note_bg": "#F3F5F8",
      "dark_note_ink": "#CBD5E1",
      "dark_input": "#0B0F14",
      "success_ink": "#10B981",
      "footer_muted": "#5B6B80"
    }
  },
  "typography": {
    "family_ui": "Inter Tight (Google Fonts, SIL OFL) 400/500/600/700",
    "family_mono": "JetBrains Mono 400/500 (etiquetas técnicas, IDs, horarios)",
    "numerals": "tabular-nums en todo",
    "scale": {
      "display": "30–40/600 -0.02em",
      "h1_mobile": "30/600",
      "h1_desktop": "26–28/600 -0.02em",
      "h2": "16–22/600",
      "body": "14–15/400–500",
      "small": "13",
      "caption": "11–12",
      "label_mono": "11/500 uppercase .05–.06em"
    }
  },
  "radius": {
    "chip": 6,
    "small": 8,
    "input": 10,
    "button": "10–14",
    "card_desktop": 16,
    "card_mobile": "14–18",
    "sheet": 24,
    "phone_screen": 52
  },
  "spacing": {
    "base": 4,
    "steps": [
      2,
      4,
      6,
      8,
      10,
      12,
      14,
      16,
      18,
      20,
      22,
      24,
      28,
      32,
      40,
      48
    ],
    "page_pad_desktop": "28px 32px 48px",
    "page_pad_mobile": "18px 16px 40px",
    "card_pad": 20,
    "gap_cards": 16
  },
  "elevation": {
    "modal": "0 30px 80px rgba(11,15,20,.35)",
    "toast": "0 16px 40px rgba(11,15,20,.3)",
    "popover_dark": "0 16px 40px rgba(0,0,0,.4)",
    "cta_glow": "0 6px 20px rgba(0,209,255,.35)"
  },
  "sizes": {
    "touch_min": 44,
    "desktop_btn": "36–42",
    "mobile_cta": "48–56",
    "sidebar_full": 248,
    "sidebar_rail": 72,
    "content_max": 1560,
    "tabbar_h": 84
  },
  "breakpoints": {
    "mobile": [
      375,
      390,
      430
    ],
    "tablet": 768,
    "laptop": 1024,
    "desktop": [
      1280,
      1440
    ],
    "large": 1920,
    "nav_full_min": 1100,
    "nav_rail_min": 768
  },
  "motion": {
    "easing": {
      "std": "cubic-bezier(.2,0,0,1)",
      "out": "cubic-bezier(.05,.7,.1,1)",
      "in": "cubic-bezier(.55,0,1,.45)",
      "spring": "cubic-bezier(.34,1.56,.64,1)"
    },
    "duration_ms": {
      "micro": 150,
      "toast": 200,
      "modal": 200,
      "screen_desktop": 220,
      "screen_mobile": 240,
      "depth": 320,
      "sheet": 320,
      "contextual": 480,
      "celebration": 1200,
      "intro_first": 2670,
      "intro_quick": 520
    }
  },
  "focus": "2px solid #00D1FF, offset 2px (focus-visible)"
} as const;
