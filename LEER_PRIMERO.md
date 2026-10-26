# REPI — Carpeta lista para desarrollo

Abrí esta carpeta completa como espacio de trabajo para Claude Code. El punto de partida es [MASTER_PROMPT.md](MASTER_PROMPT.md). El [mensaje inicial](PROMPT_INICIAL.md) está listo para copiar.

## Organización

```text
Repi/
├── MASTER_PROMPT.md       Guía activa: leer primero
├── CLAUDE.md              Instrucciones de entrada del proyecto
├── PROMPT_INICIAL.md      Mensaje listo para copiar
├── LEER_PRIMERO.md        Esta guía
└── handoff/
    ├── entregables/       Análisis, decisiones y mapa de pantallas
    ├── evidencia/         Auditorías, inventarios, pruebas y capturas
    ├── fuentes/
    │   ├── REPI_COMPLETE_DESIGN_HANDOFF/
    │   │   ├── prototypes/     Código de los prototipos
    │   │   ├── assets/         Marca Concepto 2 y referencias
    │   │   └── …              Especificaciones e inventarios completos
    │   ├── Investigacion_Tecnica_REPI_Body_Intelligence.pdf
    │   └── REPI App Mobile Prototype.zip
    └── LEER_PRIMERO.md    Guía original del paquete auditado
```

Los archivos de configuración que ya estaban en esta carpeta se conservaron. Se copió el paquete auditado completo; las fuentes originales permanecen intactas. El máster de la raíz tiene las rutas adaptadas a esta organización. La copia dentro del handoff conserva la versión auditada como antecedente.

## Orden de trabajo

1. Leer el máster completo.
2. Revisar [análisis](handoff/entregables/01_ANALISIS_DEL_ZIP_Y_HANDOFF.md), [decisiones pendientes](handoff/entregables/03_DECISIONES_Y_FALTANTES.md) y todo el handoff de Claude Design.
3. Incorporar funcionalidades adicionales descubiertas, incluyendo las ausentes de los resúmenes.
4. Contrastar [investigación Body Intelligence](handoff/fuentes/Investigacion_Tecnica_REPI_Body_Intelligence.pdf) con su [auditoría](handoff/evidencia/BODY_INTELLIGENCE_AUDIT.md).
5. Iniciar desarrollo desde la raíz, por etapas verificables, conservando Concepto 2 y diferenciando implementaciones reales de simulaciones.

No hace falta pasar la investigación por separado: ya está incluida. El desarrollo debe usar las fuentes y auditorías; el paquete todavía no equivale a una aplicación productiva.

Verificación de organización: [integridad de la copia y archivos preservados](handoff/evidencia/ORGANIZACION_DESKTOP.json).
