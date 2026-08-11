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
| `pnpm smoke:auth` | Chequea login, signup cerrado y recuperación      |
| `pnpm check`      | lint + typecheck + build (correr antes de commit) |
| `pnpm db:start`   | Levanta Supabase local                            |
| `pnpm db:stop`    | Apaga Supabase local                              |
| `pnpm db:reset`   | Recrea la DB y aplica migraciones + seed          |
| `pnpm db:diff X`  | Genera migracion `X` con el diff del schema local |
| `pnpm db:push`    | Aplica migraciones al proyecto cloud (linkeado)   |
| `pnpm db:types`   | Regenera `src/lib/supabase/database.types.ts`     |
| `pnpm mail`       | Abre Mailpit                                      |

## Cuentas

No hay signup publico (`enable_signup = false`). Las cuentas se crean a mano en la DB:

```sql
select public.create_staff('diego@zacgym.com', 'una-password-larga', 'admin');
select public.create_staff('sole@zacgym.com',  'otra-password',      'employee');
select public.set_staff_role('sole@zacgym.com', 'admin');   -- cambiar rol
```

Local: `docker exec supabase_db_zacgym-management-system psql -U postgres -d postgres -c "<sql>"`.
Produccion: el SQL Editor del dashboard de Supabase.

El rol (`admin` | `employee`) vive en `auth.users.raw_app_meta_data->>'role'` y viaja
en el JWT — sin tabla de perfiles ni join por request. Se lee con `requireStaff()`
(`src/lib/auth.ts`).

Recuperar contraseña: link por mail (local cae en Mailpit) → `/auth/callback` →
`/nueva-password`. Chequeo del circuito: `pnpm smoke:auth`.

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
