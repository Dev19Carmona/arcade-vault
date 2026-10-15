# SPEC 03 — Integración base de Supabase

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-15
> **Objetivo:** Conectar la app de Next.js al proyecto remoto de Supabase con clientes tipados de navegador y servidor, refresco de sesión en `proxy.ts` y un endpoint `/api/health`, sin cambiar todavía la UI ni la persistencia simulada.

---

## Por qué existe este spec

Las SPEC 01 y 02 dejaron la app como MVP visual: sesión y puntuaciones viven en `localStorage` (`av_user`, `av_scores`). El siguiente paso es un backend real con Supabase, pero migrar auth y puntuaciones a la vez toca demasiadas áreas. Este spec deja lista solo la infraestructura (paquetes, variables de entorno, clientes, proxy, tipos y convención de migraciones) para que las specs de autenticación y puntuaciones se apoyen en ella sin decisiones de plomería pendientes.

---

## Alcance

**Dentro:**

- Instalar `@supabase/supabase-js` y `@supabase/ssr`.
- Variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`, más plantilla versionada `.env.example`.
- Cliente de navegador (`lib/supabase/client.ts`) y de servidor (`lib/supabase/server.ts`) basados en `@supabase/ssr`, tipados con `Database`.
- `proxy.ts` en la raíz que refresca la sesión de Supabase en cada petición (helper en `lib/supabase/proxy.ts`).
- Tipos generados en `lib/supabase/database.types.ts` (vía MCP `generate_typescript_types`).
- Carpeta `supabase/migrations/` como convención para las migraciones de specs futuras.
- Route handler `GET /api/health` que comprueba la conexión con el proyecto remoto.

**Fuera de alcance (para specs futuros):**

- Autenticación real: reemplazar `av_user`, formulario `/acceso`, OAuth, sesión en la barra (SPEC 04).
- Tablas y RLS: perfiles, puntuaciones, catálogo de juegos (SPEC 04/05).
- Reemplazar `av_scores` o alimentar rankings con datos reales.
- `SUPABASE_SECRET_KEY` / service role y cualquier cliente admin.
- Supabase local con CLI y Docker.
- Cambios visuales en cualquier pantalla.
- Tests automatizados (el proyecto no tiene framework de tests).

---

## Modelo de datos

Este spec no crea tablas ni migraciones. Introduce solo configuración y tipos:

```ts
// lib/supabase/database.types.ts — generado, no editar a mano
export type Database = {
  public: {
    Tables: {};
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  }; /* … */
};
```

Variables de entorno:

| Variable                               | Dónde                        | Valor                                        |
| -------------------------------------- | ---------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `.env.local`, `.env.example` | URL del proyecto (`get_project_url` del MCP) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env.local`, `.env.example` | `sb_publishable_…` (`get_publishable_keys`)  |

Convenciones:

- `.env.example` lleva los nombres con valor vacío; `.gitignore` añade `!.env.example`.
- El `.env` existente (`SUPABASE_DB_PASSWORD`) no se modifica.
- Migraciones futuras: `supabase/migrations/<YYYYMMDDHHMMSS>_<nombre>.sql`, versionadas en git y aplicadas al remoto con `apply_migration` del MCP usando el mismo nombre.
- Tras cada migración se regenera `lib/supabase/database.types.ts`.
- `lib/supabase/server.ts` solo se importa desde código de servidor; `client.ts` solo desde client components.

---

## Plan de implementación

Antes de escribir código, leer en `node_modules/next/dist/docs/` las guías de `proxy` (`01-app/01-getting-started/16-proxy.md`, `01-app/03-api-reference/03-file-conventions/proxy.md`), `cookies()` y route handlers; Next 16 tiene cambios incompatibles (p. ej. `cookies()` asíncrono, `proxy.ts` en lugar de `middleware.ts`).

1. **Dependencias.** `npm install @supabase/supabase-js @supabase/ssr`. Verificación: `npm run build` pasa.
2. **Variables de entorno.** Obtener URL y publishable key con el MCP; crear `.env.local` y `.env.example`; añadir `!.env.example` a `.gitignore`. Verificación: `git status` muestra `.env.example` y no `.env.local`.
3. **Tipos.** Generar `lib/supabase/database.types.ts` con `generate_typescript_types` y crear `supabase/migrations/.gitkeep`. Verificación: `npm run lint` pasa.
4. **Clientes.** Crear `lib/supabase/client.ts` (`createBrowserClient<Database>`) y `lib/supabase/server.ts` (`createServerClient<Database>` con `await cookies()`, `getAll`/`setAll`, `setAll` en `try/catch` para Server Components). Ambos fallan con un error claro si falta alguna variable. Verificación: `npm run build` pasa.
5. **Proxy.** Crear `lib/supabase/proxy.ts` con `updateSession(request)` (crea el cliente sobre las cookies de la petición/respuesta y llama a `auth.getClaims()`), y `proxy.ts` en la raíz que lo invoca con un `matcher` que excluye `_next/static`, `_next/image`, `favicon.ico` e imágenes. Verificación: todas las rutas de SPEC 01/02 cargan igual.
6. **Health check.** Crear `app/api/health/route.ts` (`GET`, dinámico): usa el cliente de servidor y hace una petición a `${URL}/auth/v1/health` con la publishable key; devuelve `200 { ok: true }` o `503 { ok: false, error }`. Verificación: `curl http://localhost:3000/api/health` → `{"ok":true}`.
7. **Documentación.** Actualizar `CLAUDE.md` (stack, variables de entorno, ubicación de clientes, convención de migraciones). Verificación: lectura.

---

## Criterios de aceptación

- [ ] `package.json` incluye `@supabase/supabase-js` y `@supabase/ssr`.
- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] `.env.example` está versionado con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vacíos; `.env.local` no aparece en `git status`.
- [ ] Existen `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/proxy.ts`, `lib/supabase/database.types.ts` y `proxy.ts`.
- [ ] No existe `middleware.ts` en el repo.
- [ ] Con `npm run dev`, `GET /api/health` responde `200` y `{"ok":true}`.
- [ ] Con la publishable key alterada en `.env.local`, `GET /api/health` responde `503` con `ok: false`.
- [ ] `/`, `/games`, `/juego/caida`, `/juego/caida/jugar`, `/acceso` y `/salon` se ven y funcionan igual que antes; sin errores nuevos en consola.
- [ ] La sesión simulada (`av_user`) y el guardado en `av_scores` siguen funcionando.
- [ ] Existe `supabase/migrations/` en el repo y el esquema `public` remoto sigue sin tablas.
- [ ] Ninguna clave secreta (service role, password de BD) aparece en archivos versionados ni en variables `NEXT_PUBLIC_*`.

---

## Decisiones tomadas y descartadas

- **Sí:** spec solo de infraestructura; auth y puntuaciones van en specs propias. Mezclarlas tocaba más de tres áreas.
- **Sí:** `@supabase/ssr` con clientes separados de navegador y servidor; es el patrón oficial para App Router con sesión en cookies.
- **No:** solo `@supabase/supabase-js` con sesión en `localStorage`; no funciona en Server Components ni en el proxy.
- **Sí:** solo el proyecto remoto (`mendwbsdxpwrrrqlsmxe`), ya conectado por MCP.
- **No:** Supabase local con CLI + Docker; añade dependencia de Docker Desktop en Windows sin necesidad en esta etapa.
- **Sí:** migraciones como archivos en `supabase/migrations/` aplicadas con `apply_migration` del MCP; deja historial en git.
- **No:** migraciones solo vía MCP sin archivos; sin trazabilidad.
- **Sí:** publishable key (`sb_publishable_…`), formato actual de Supabase.
- **No:** anon key legacy (JWT).
- **No:** secret / service role key en este spec; nada la necesita todavía.
- **Sí:** `.env.local` + `.env.example` versionado; no se mezcla con el `.env` existente.
- **Sí:** `proxy.ts` (convención de Next 16), no `middleware.ts`.
- **Sí:** `/api/health` como verificación en tiempo de ejecución, en lugar de un indicador visual en la UI o solo build.
- **Sí:** tipos generados con el MCP desde ya, aunque el esquema esté vacío, para que los clientes nazcan tipados.

---

## Riesgos identificados

| Riesgo                                                                    | Mitigación                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| API de `proxy`/`cookies()` en Next 16 distinta a los ejemplos de Supabase | Leer `node_modules/next/dist/docs/` antes de los pasos 4–5; `npm run build` valida tipos. |
| El proxy añade latencia o rompe rutas estáticas/assets                    | `matcher` que excluye estáticos; verificar las rutas de SPEC 01/02 en el paso 5.          |
| Variables ausentes en build o en otro equipo                              | `.env.example` documenta los nombres; los clientes lanzan error explícito si faltan.      |
| Filtrar una clave secreta al cliente                                      | Solo variables públicas en este spec; `.env*` sigue ignorado salvo `.env.example`.        |
| Tipos desactualizados tras futuras migraciones                            | Convención: regenerar `database.types.ts` después de cada `apply_migration`.              |

---

## Qué **no** está en este spec

- Autenticación real ni cambios en `/acceso` o en la barra.
- Tablas, RLS ni migraciones con contenido.
- Puntuaciones o rankings reales.
- Clave secreta o cliente admin.
- Supabase local.
- Tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
