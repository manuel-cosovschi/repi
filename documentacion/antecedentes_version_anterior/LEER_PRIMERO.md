# REPI — Handoff auditado para desarrollo

Preparado el 25 de octubre de 2026 a partir de `REPI App Mobile Prototype.zip`, la investigación de Body Intelligence y las definiciones recuperables de la conversación.

**Conclusión:** es un paquete amplio de diseño e interacción, con lógica local y simulaciones. No es una app productiva. Se puede usar para iniciar un desarrollo integral, manteniendo decisiones comerciales/de permisos/BI pendientes y preservando Concepto 2.

## Para revisar

1. [Análisis del ZIP y contraste con requisitos](entregables/01_ANALISIS_DEL_ZIP_Y_HANDOFF.md).
2. [Máster prompt completo para Claude Code](entregables/02_MASTER_PROMPT_CLAUDE_CODE.md).
3. [Decisiones y faltantes concretos](entregables/03_DECISIONES_Y_FALTANTES.md).
4. [Mapa completo de pantallas](entregables/04_MAPA_DE_PANTALLAS.md) y [93 funcionalidades documentadas](evidencia/MATRIZ_REQUISITOS_DOCUMENTADOS.md).

## Para Claude Code

Entregale este paquete completo y usá el contenido de `02_MASTER_PROMPT_CLAUDE_CODE.md` como instrucción inicial. Necesita los prototipos y documentos, no solamente el resumen. Si tenés un handoff más reciente, agregalo: el prompt exige relevar todas sus funcionalidades nuevas, registrar diferencias y no limitarse a las enumeradas en la conversación o a los 93 IDs actuales.

La instrucción humana adicional queda incorporada: **hay más funcionalidades nuevas que Claude Code deberá descubrir en el handoff**. No se inventaron sus nombres ni se presume que estén implementadas. El inventario es extensible y exige evidencia.

## Qué se conserva

- `fuentes/REPI App Mobile Prototype.zip`: ZIP original sin editar.
- `fuentes/REPI_COMPLETE_DESIGN_HANDOFF/`: los 89 archivos originales extraídos, sin cambios.
- `fuentes/Investigacion_Tecnica_REPI_Body_Intelligence.pdf`: investigación original.
- `evidencia/`: auditorías de código/requisitos/BI, verificaciones del navegador, inventarios, hashes, consola, capturas y extracción del PDF.

Las marcas “aprobado”, prioridades y estados del handoff se contrastaron, no se asumieron como hechos. El informe distingue observación de código/navegador, declaración documental, propuesta y decisión pendiente. Los mensajes previos del asistente que la recuperación devolvió sólo como referencias opacas no fueron inventados.

**Concepto 2 Friendly Performance permanece como contrato visual.** La intro 1a “El punto” es una decisión de motion distinta. Se incorporaron los escritorios Coach/Gym/Admin y el alcance abierto de Club, pagos y Body Intelligence sin confundir una demo con un sistema conectado.

## Profundizar en la evidencia

- [Auditoría de código:26 hallazgos](evidencia/AUDITORIA_CODIGO.md).
- [Verificación en navegador y error adicional de lifecycle](evidencia/VERIFICACION_EN_NAVEGADOR.md).
- [Auditoría de requisitos/diseño y contradicciones](evidencia/AUDITORIA_REQUISITOS_DISENO.md).
- [Reconciliación de Body Intelligence con fuentes primarias](evidencia/BODY_INTELLIGENCE_AUDIT.md).
- [Assets verificados:40 PNG,20 hashes distintos](evidencia/ASSETS_VERIFICADOS.md).
- [Inventario original con hashes](evidencia/inventario_zip.json).
- [Verificación final del paquete](evidencia/VERIFICACION_FINAL.json).

No se modificaron los prototipos ni se publicó una aplicación. Los cambios utilizados para probar controles fueron datos ficticios locales; la publicación de prueba se retiró y las altas/turnos/programas temporales desaparecieron al recargar. No se subieron fotos o videos personales ni se efectuaron pagos.
