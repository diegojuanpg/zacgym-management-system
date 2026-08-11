# ZacGym Management System

Sistema de gestion para ZacGym. Datos historicos y scripts previos viven en
`/home/diego/Projects/zac-gym` y `/home/diego/Projects/zacgym-app` (CSVs de
checkins, vencimientos, apps-script) — mirar ahi antes de modelar el schema.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Tailwind CSS v4
- Supabase (`@supabase/ssr` — clientes en `src/lib/supabase/`)
- pnpm, ESLint

## Entorno local

Puertos **553xx** (no 543xx: ese rango lo ocupa el stack de "Project X").
Detalle completo y comandos en `README.md`. Mails locales van a Mailpit
(http://127.0.0.1:55324), nunca salen a internet.

`pnpm check` (lint + typecheck + build) antes de commitear.

## Migraciones

Nunca editar el schema a mano en Studio y dejarlo ahi: hacer el cambio y
`pnpm db:diff <nombre>` para materializar la migracion en `supabase/migrations/`.
Despues `pnpm db:types`.

## Secretos

`.env` (tokens GitHub/Vercel/Supabase cloud) y `.env.local` estan gitignoreados.
Nunca commitear valores reales ni pegarlos en codigo.
