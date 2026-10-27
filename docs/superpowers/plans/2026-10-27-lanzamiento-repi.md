# Repi — cierre de seguridad, operación y lanzamiento

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** entregar una versión vendible y operable, preservando diseño y funciones existentes, con evidencia de lo verificado y dependencias externas explícitas.
**Architecture:** mantener Next/React, dominio compartido, PostgreSQL/Drizzle y Better Auth. Resolver primero fallas de autorización y recuperación administrativa; verificar luego flujos, operación y presentación. Trabajar en rama codex/lanzamiento-repi dentro de la carpeta solicitada; ningún push a main hasta verificar el bloque desplegable. (27/10 11:30: Bloque A y la mayor parte de B verificados y llevados a main por Claude; ver PROXIMA_SESION.)
**Tech Stack:** Next 16.4.3, React 19.3, TypeScript, PostgreSQL, Drizzle, Better Auth, PWA, Vercel/Supabase/Resend.
**Spec:** MASTER_PROMPT.md, REPI_SELECCION_VISUAL.md, decisiones D82–D86 y mandato directo del usuario 27/10/2026 de ejecución autónoma completa.

## Global Constraints

- Concepto 2 + G Atlética, paleta/logo originales; conservar M01–M05.
- D82 vigente: guía móvil sin salida «continuar en navegador»; corregir documentos anteriores contradictorios.
- QR no es membresía. Toda autorización se evalúa por organización, sede, rol, turno y relación vigente.
- Facturación SaaS por total acordado, independiente de activaciones; precios negociables, períodos cerrados inmutables.
- No claves demo ni buzón de códigos en entorno con clientes reales. No inventar identidad del primer Admin.
- Pruebas destructivas sólo DB local descartable validada antes de conexión y nuevamente antes de DROP.
- Autonomía autorizada; no preguntas. No afirmar validación física móvil, legal, pagos o funciones que no se comprobaron.

## Review Focus

1. Rol alto en sede A y bajo en B no combina permisos. Pruebas negativas por sede y fuera de turno.
2. Pausa/baja jamás se revierte aceptando consentimiento o recuperando contraseña. Prueba por servicio y ruta.
3. Demo bloqueada no recupera acceso por OTP/magic link. Primer Admin necesita cuenta real verificada, 2FA y ticket de uso único.
4. Logout desde cualquier contexto borra datos privados locales incluso en otra pestaña. Probar retorno offline.
5. Fallo de correo/almacenamiento/operación conserva estado recuperable y muestra error honesto; no éxito falso.

## Bloque A — seguridad y acceso administrativo

- [x] Endurecer tests/global-setup.ts, setup-env.ts y scripts/seed-demo.ts; tests unitarios sin DB para URLs engañosas y separación de bases.
- [x] Bloquear dominio demo sembrado en autenticación hospedada con pruebas; preservar demo guiada aislada .invalid.
- [x] Crear mecanismo de primer Admin de un solo uso: ticket hash con vencimiento generado sólo desde CLI privilegiada, cuenta verificada real y 2FA, consumo transaccional, auditoría; sin contraseña generada ni credenciales públicas.
- [x] Corregir completeGymConsent para transición pending_consent → active únicamente y organización habilitada; regresiones de suspensión/baja.
- [x] Corregir autorización por sede y turno, afterHours, carrera de QR y reactivación sin consentimiento; pruebas negativas de mezcla de roles.
- [ ] Revisión independiente del diff y suite relevante antes de despliegue.

## Bloque B — integridad, PWA y privacidad local

- [x] Centralizar salida/cambio de identidad y limpieza multitab de caché/IndexedDB sin mezclar usuarios.
- [x] Completar iconos 192/512 derivados del original, manifest/guía y pruebas de navegador.
- [x] Lectura de video con Range/206/416 y limpieza reintentable de objetos huérfanos.
- [x] Bienvenida comercial con error/reintento honesto y cierre/condiciones serializados.
- [ ] Actualizaciones PWA con cola pendiente, recarga offline y flujos gym/coach completos.

## Bloque C — operación y venta

- [x] Backups DB + objetos, restauración ensayada sobre destino aislado; nunca sobrescribir producción para probar.
- [x] CI tipado/build/tests locales descartables y comprobaciones de migración.
- [ ] Guías por rol, alta comercial, ventas/demo y propuesta editable con funcionalidades reales.
- [ ] Preparar release/despliegue verificable, comprobar correo/QR/programa/comunidad/media en entorno autorizado.
- [ ] Actualizar estado, decisiones, gates y continuidad. Diferenciar verificaciones automáticas de pendientes físicos/jurídicos/contratación.

## Trabajo posterior

Continuar catálogo por prioridad V1.1/V2/BI según evidencia y dependencias. El objetivo permanece activo hasta cumplir el alcance o identificar una dependencia externa repetida; no declarar app completa por un build exitoso.
