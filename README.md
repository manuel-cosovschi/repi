# REPI

Monorepo del desarrollo de REPI. Guía del encargo: `MASTER_PROMPT.md`. Documentación viva: `docs/`. Fuentes auditadas (no editar): `handoff/`.

## Requisitos
Node ≥22, pnpm 9, PostgreSQL 16 local.

## Arranque local
```bash
pnpm install
createdb repi_dev && createdb repi_test
cp .env.example apps/web/.env.local   # completar DATABASE_URL, TEST_DATABASE_URL y secretos
pnpm db:migrate
pnpm db:seed                          # datos DEMO ficticios (Gym Norte, Agustín Pérez Coach)
pnpm dev                              # http://localhost:3000/acceso
```
Códigos de correo en `http://localhost:3000/dev/mailbox` (sólo desarrollo). Invitaciones DEMO: `R7K2QX` (alumno), `S4M9TA` (staff). Coach DEMO `agustin@demo.repi.app` con 3 plantillas y la clienta DEMO `valentina@demo.repi.app`. Contraseña DEMO en `apps/web/scripts/seed-demo.ts`.

## Pruebas
```bash
pnpm test
```

## Estructura
- `apps/web` — Next.js (App Router), API `/api/access/*`, Better Auth, Drizzle + migraciones en `drizzle/`.
- `packages/domain` — reglas puras (Acceso, tokens Concepto 2) compartidas cliente/servidor.
- `scripts/` — inventario (`pnpm inventory`) y copia de assets de marca.
