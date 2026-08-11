# ZacGym — Management System

Next.js 16 (App Router) + Supabase. Entorno de desarrollo local igual al de Workset:
app en `localhost`, Supabase en Docker, Mailpit para mails.

## Arranque

```bash
pnpm install
pnpm db:start     # Supabase en Docker (primera vez baja imagenes)
pnpm dev          # http://localhost:3000
```

Verificar que todo quedo conectado:

```bash
curl http://localhost:3000/api/health   # {"ok":true,...}
```

## Puertos locales

Este proyecto usa el rango **553xx** para poder correr en paralelo con el stack
Supabase de "Project X" (que ocupa 543xx).

| Servicio           | URL                        |
| ------------------ | -------------------------- |
| App (Next dev)     | http://localhost:3000      |
| Supabase API       | http://127.0.0.1:55321     |
| Postgres           | `127.0.0.1:55322` (postgres/postgres) |
| Supabase Studio    | http://127.0.0.1:55323     |
| Mailpit (web)      | http://127.0.0.1:55324     |
| Mailpit (SMTP)     | `127.0.0.1:55325`          |

## Comandos

| Comando           | Que hace                                          |
| ----------------- | ------------------------------------------------- |
| `pnpm dev`        | Dev server                                        |
| `pnpm check`      | lint + typecheck + build (correr antes de commit) |
| `pnpm db:start`   | Levanta Supabase local                            |
| `pnpm db:stop`    | Apaga Supabase local                              |
| `pnpm db:reset`   | Recrea la DB y aplica migraciones + seed          |
| `pnpm db:diff X`  | Genera migracion `X` con el diff del schema local |
| `pnpm db:push`    | Aplica migraciones al proyecto cloud (linkeado)   |
| `pnpm db:types`   | Regenera `src/lib/supabase/database.types.ts`     |
| `pnpm mail`       | Abre Mailpit                                      |

## Credenciales

- `.env.local` — valores del stack local. Ya completo, no tiene secretos reales.
- `.env` — tokens de GitHub / Vercel / Supabase cloud. **Vacio, completar a mano.**
  Plantilla en `.env.example`. Ambos estan gitignoreados.

Para que las MCP tools (`github`, `supabase`) usen esos tokens, arrancar Claude asi:

```bash
set -a; source .env; set +a; claude
```

## Deploy

```bash
gh repo create zacgym-management-system --private --source=. --push
vercel link            # crea/linkea el proyecto
vercel env pull        # baja env vars de produccion a .env.local
vercel --prod          # deploy
```

Para la DB de produccion: `supabase link --project-ref <ref>` y despues `pnpm db:push`.
