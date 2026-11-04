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
  // D188 (bloque 03/06): tokens semánticos por tema. Los componentes autenticados consumen sólo --ui-*; los grupos de
  // arriba (core, dark, light, semantic, access) quedan como paletas primitivas fijas (sitio público, carteles, pantallas
  // de recepción e informes imprimibles). Claro = «Premium Cream»; Oscuro = «Premium Performance» (los valores del alumno v4).
  // Contrastes medidos (WCAG 2.2): texto ≥ 4,5:1 sobre page, surface y surface-2; accent/control-border ≥ 3:1.
  "theme": {
    "light": {
      "page": "#F4F1EA", "page-2": "#EDE9E0", "surface": "#FFFFFF", "surface-2": "#F7F5F0", "surface-raised": "#FFFFFF",
      "text": "#0E1726", "text-2": "#334155", "muted": "#5A6372", "faint": "#8A8272",
      "border": "#E3DDD2", "border-strong": "#CBC3B5", "divider": "#ECE7DE", "control-border": "#8A8272",
      "primary": "#00D1FF", "primary-hover": "#00BCE6", "on-primary": "#0B0F14",
      "accent": "#0089B0", "accent-2": "#0B766C", "link": "#006F8E", "link-hover": "#00546B", "focus": "#006F8E",
      "accent-tint": "rgba(0, 137, 176, .10)", "accent-tint-strong": "rgba(0, 137, 176, .18)", "accent-line": "rgba(0, 137, 176, .40)",
      "selection-bg": "#E3F4F9", "selection-border": "#7FD3E8",
      "success": "#047857", "warning": "#D97706", "error": "#DC2626",
      "success-text": "#047857", "warning-text": "#8A5300", "error-text": "#B42318",
      "success-tint": "rgba(4, 120, 87, .10)", "warning-tint": "rgba(217, 119, 6, .12)", "error-tint": "rgba(220, 38, 38, .10)",
      "chip-info-bg": "#E3F4F9", "chip-info-ink": "#00627E", "chip-ok-bg": "#E5F5EC", "chip-ok-ink": "#047857",
      "chip-warn-bg": "#FCF0D9", "chip-warn-ink": "#7A4A00", "chip-bad-bg": "#FBE9E7", "chip-bad-ink": "#B42318",
      "chip-mute-bg": "#EDE9E0", "chip-mute-ink": "#475569",
      "fill-subtle": "rgba(14, 23, 38, .04)", "fill-strong": "rgba(14, 23, 38, .08)", "line-subtle": "rgba(14, 23, 38, .10)",
      "overlay": "rgba(14, 23, 38, .45)", "input-bg": "#FFFFFF", "placeholder": "#6B7385", "skeleton": "#EAE5DB",
      "shadow-card": "0 1px 2px rgba(14, 23, 38, .05), 0 6px 20px rgba(14, 23, 38, .05)",
      "shadow-pop": "0 16px 40px rgba(14, 23, 38, .16)", "shadow-modal": "0 30px 80px rgba(14, 23, 38, .22)",
      "sidebar-bg": "#0B0F14", "sidebar-raised": "#1A2433", "sidebar-line": "#1A2433", "sidebar-ink": "#F8FAFC", "sidebar-muted": "#94A3B8", "sidebar-strong": "#2D3B4F",
      "inverse-bg": "#0B0F14", "inverse-text": "#F8FAFC", "inverse-muted": "#94A3B8",
      "tabbar-bg": "rgba(255, 255, 255, .92)", "chart-grid": "#E3DDD2", "chart-track": "#EDE9E0", "chart-soft": "#B9E3EF",
      "demo-bar": "#E6E1D7", "statusbar": "#F4F1EA", "media-bg": "#0B0F14",
      "stripe-a": "#EDE9E0", "stripe-b": "#E4DFD5", "shadow-sm": "0 1px 3px rgba(14, 23, 38, .22)", "cta-glow": "0 6px 18px rgba(0, 137, 176, .28)",
      // Héroes (tarjeta del día, nivel): navy en ambos temas; en Claro son el acento de jerarquía sobre el crema.
      "hero-from": "#1A2433", "hero-mid": "#16202D", "hero-to": "#0F1822", "hero-alt": "#13202E", "hero-line": "#233044", "hero-glow": "#13263A", "hero-stripe-a": "#1D2A3B", "hero-stripe-b": "#223147"
    },
    "dark": {
      "page": "#0B0F14", "page-2": "#0F151D", "surface": "#1A2433", "surface-2": "#131C28", "surface-raised": "#1E2A3C",
      "text": "#F8FAFC", "text-2": "#E2E8F0", "muted": "#94A3B8", "faint": "#66768B",
      "border": "#2D3B4F", "border-strong": "#3A4A61", "divider": "#233044", "control-border": "#6B7D95",
      "primary": "#00D1FF", "primary-hover": "#5DE6D8", "on-primary": "#0B0F14",
      "accent": "#00D1FF", "accent-2": "#5DE6D8", "link": "#00D1FF", "link-hover": "#5DE6D8", "focus": "#00D1FF",
      "accent-tint": "rgba(0, 209, 255, .12)", "accent-tint-strong": "rgba(0, 209, 255, .25)", "accent-line": "rgba(0, 209, 255, .35)",
      "selection-bg": "#12283A", "selection-border": "#00D1FF",
      "success": "#10B981", "warning": "#F59E0B", "error": "#EF4444",
      "success-text": "#6EE7B7", "warning-text": "#FCD38A", "error-text": "#FCA5A5",
      "success-tint": "rgba(16, 185, 129, .16)", "warning-tint": "rgba(245, 158, 11, .16)", "error-tint": "rgba(239, 68, 68, .16)",
      "chip-info-bg": "rgba(0, 209, 255, .14)", "chip-info-ink": "#7DE3FF", "chip-ok-bg": "rgba(16, 185, 129, .16)", "chip-ok-ink": "#6EE7B7",
      "chip-warn-bg": "rgba(245, 158, 11, .16)", "chip-warn-ink": "#FCD38A", "chip-bad-bg": "rgba(239, 68, 68, .16)", "chip-bad-ink": "#FCA5A5",
      "chip-mute-bg": "rgba(148, 163, 184, .14)", "chip-mute-ink": "#CBD5E1",
      "fill-subtle": "rgba(255, 255, 255, .06)", "fill-strong": "rgba(255, 255, 255, .12)", "line-subtle": "rgba(248, 250, 252, .15)",
      "overlay": "rgba(5, 7, 10, .72)", "input-bg": "#0B0F14", "placeholder": "#7C8BA1", "skeleton": "#1A2433",
      "shadow-card": "none",
      "shadow-pop": "0 16px 40px rgba(0, 0, 0, .45)", "shadow-modal": "0 30px 80px rgba(0, 0, 0, .5)",
      "sidebar-bg": "#080B10", "sidebar-raised": "#161F2C", "sidebar-line": "#1E2A3B", "sidebar-ink": "#F8FAFC", "sidebar-muted": "#94A3B8", "sidebar-strong": "#2D3B4F",
      "inverse-bg": "#2A3850", "inverse-text": "#F8FAFC", "inverse-muted": "#CBD5E1",
      "tabbar-bg": "rgba(11, 15, 20, .92)", "chart-grid": "#233044", "chart-track": "#131C28", "chart-soft": "#2D3B4F",
      "demo-bar": "#131C28", "statusbar": "#0B0F14", "media-bg": "#000000",
      "stripe-a": "#1D2A3B", "stripe-b": "#223147", "shadow-sm": "0 2px 8px rgba(0, 0, 0, .4)", "cta-glow": "0 6px 20px rgba(0, 209, 255, .35)",
      "hero-from": "#1A2433", "hero-mid": "#16202D", "hero-to": "#0F1822", "hero-alt": "#13202E", "hero-line": "#233044", "hero-glow": "#13263A", "hero-stripe-a": "#1D2A3B", "hero-stripe-b": "#223147"
    }
  },
  "typography": {
    "family_ui": "Barlow (SIL OFL) 400/500/600/700 · selección G · Atlética (REPI_SELECCION_VISUAL.md, 26/10/2026)",
    "family_display": "Barlow Condensed 700 (SIL OFL), mayúsculas visuales; sólo títulos destacados (h1 y héroes). Nunca chats, formularios, tablas ni textos largos",
    "family_mono": "JetBrains Mono 400/500 (etiquetas técnicas, IDs, horarios)",
    "numerals": "tabular-nums en todo",
    "scale": {
      "display": "38–40/700 -0.015em uppercase (Barlow Condensed)",
      "h1_mobile": "38/700 -0.015em uppercase (Barlow Condensed)",
      "h1_desktop": "30–34/700 -0.01em uppercase (Barlow Condensed)",
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
      "section_fade": 160,
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
