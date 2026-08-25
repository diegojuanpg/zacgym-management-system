# ZacGym Management System

Sistema de gestion para ZacGym. Datos historicos y scripts previos viven en
`/home/diego/Projects/zac-gym` y `/home/diego/Projects/zacgym-app` (CSVs de
checkins, vencimientos, apps-script) — mirar ahi antes de modelar el schema.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Tailwind CSS v4 + Geist (design system de Vercel, copiado en el repo)
- Supabase (`@supabase/ssr` — clientes en `src/lib/supabase/`)
- pnpm, ESLint

## Interfaz

Toda la interfaz se hace con Geist. La fuente de verdad es la skill local
`geist-design-system` (`~/.claude/skills/geist-design-system/`), nunca la web de
Vercel. Antes de usar un componente, leer su `references/<nombre>.md` y copiar
el archivo de `assets/components/ui/` a `src/components/ui/` con sus
dependencias. No re-estilar un componente copiado: componer con tokens y las
variantes que documenta.

- Colores: solo variables `--ds-*` o los tokens semanticos (`bg-background`,
  `text-muted-foreground`, `border-border`). Nada de hex/oklch a mano ni
  `dark:` para colores de token, que `.dark` ya los da vuelta.
- Texto: utilidades `text-heading-*` / `text-copy-*` / `text-label-*` /
  `text-button-*`, no `text-xl font-bold` armado a ojo.
- Superficies: utilidades `material-*` para cards, menus, modales, tooltips.
- Radio: `rounded-md` controles, `rounded-lg` controles grandes, `rounded-xl`
  superficies flotantes.
- Foco: `--ds-focus-ring`, ya viene en los componentes; no sacarlo.
- Iconos: buscar en `assets/components/icons.tsx` de la skill y copiar el que
  haga falta a `src/components/icons.tsx`. Nada de lucide, unicode (`x`, `->`)
  ni SVG dibujado a mano.
- Espaciado: escala de 4px.

El CSS ya esta puesto: `src/app/geist-tokens.css`, `geist-typography.css`,
`geist-materials.css`, `geist-book.css`, importados desde `globals.css`.

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
