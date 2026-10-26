# REPI_COMPLETE_DESIGN_HANDOFF

Paquete de transferencia del proyecto de diseño REPI (2026-10-25), para que otra IA escriba la especificación maestra para Claude Code sin acceso a la conversación.

## Orden de lectura
00 → 19 → 01 → 02/03 → 05/06 → 07/08 → 10 → 11–17 → 20/21 → 22/23.
Datos legibles por máquina: `features.json`, `screens.json`, `navigation.json`, `design-tokens.json`, `roles-permissions.json`, `implementation-backlog.json` y `MANIFEST.json`.
Los IDs (F-*, SCR-*, AN-*, DEC-*, GAP-*, BL-*) vinculan todos los archivos.

| Archivo | Tema |
|---|---|
| 00_EXECUTIVE_SUMMARY.md | Resumen y conteos |
| 01_COMPLETE_PRODUCT_SPEC.md | Qué es, módulos, principios, límites de la auditoría |
| 02_ALL_FEATURES_INVENTORY.md | 93 funcionalidades |
| 03_COMPLETE_SCREEN_INVENTORY.md | 97 pantallas |
| 04_USER_JOURNEYS.md | Recorridos |
| 05_BUSINESS_RULES.md | Reglas confirmadas / supuestos / abiertas |
| 06_ROLE_PERMISSION_MATRIX.md | Matriz y privacidad |
| 07_DESIGN_SYSTEM.md | Marca, tokens, componentes |
| 08_MOTION_DESIGN_SYSTEM.md | 31 animaciones |
| 09_INTERACTIVE_PROTOTYPES.md | Cómo ejecutar los prototipos |
| 10_DOMAIN_DATA_REQUIREMENTS.md | Modelo conceptual |
| 11–17 | Body Intelligence, Coach, Gym, Desktop, Club, Facturación, IA |
| 18_DECISION_LOG.md | 20 decisiones |
| 19_NEW_FEATURES_AND_CHANGES.md | Cambios respecto del brief original |
| 20_GAP_ANALYSIS.md | 24 brechas + inconsistencias |
| 21_PRODUCT_ROADMAP.md | Prioridades propuestas |
| 22_DEVELOPER_ACCEPTANCE_CRITERIA.md | Criterios de aceptación y E2E |
| 23_DESIGN_IMPLEMENTATION_MAP.md | Pantalla → ruta → fuente |
| CHECKLIST.md | Auto-auditoría |
| assets/ | Kit de marca original completo, capas del logo, handoff anterior |
| prototypes/ | Fuente editable de todos los prototipos, runtime y assets |
| design-tokens/ | JSON + variables CSS |

Carpetas del brief sin contenido propio:
- `fonts-specifications`: ver 07 (Inter Tight y JetBrains Mono, licencia OFL).
- `illustrations` y `3d`: no existen assets.
- `animations`: el código está en los prototipos (ver 08).
- `components`: viven dentro de los .dc.html (ver 07).
- `screenshots`: no se generaron.

Para ejecutar los prototipos: `npx serve prototypes` (ver 09).
