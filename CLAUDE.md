# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Comandos

```bash
npm run dev     # servidor de desarrollo (next dev)
npm run build   # build de producción
npm run start   # servir el build
npm run lint    # eslint (flat config en eslint.config.mjs)
```

No hay framework de tests configurado.

## Estado del proyecto

Arcade Vault es una plataforma para jugar online y competir por puntos. Se desarrolla con **Spec Driven Design** (comandos `/spec` y `/spec-impl`, skills de `Klerith/fernando-skills`).

El código actual en `app/` es todavía el scaffold de Create Next App (`app/page.tsx`, metadata por defecto en `app/layout.tsx`). La implementación real aún no está portada.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript estricto + Tailwind CSS v4 (`@import "tailwindcss"` y `@theme inline` en `app/globals.css`, sin `tailwind.config`). Alias de imports: `@/*` → raíz del repo. Los tipos globales como `LayoutProps<"/">` vienen de Next (ver `app/layout.tsx`).

Backend: Supabase (`@supabase/supabase-js` + `@supabase/ssr`) contra el proyecto remoto `mendwbsdxpwrrrqlsmxe`, también accesible por MCP (`.mcp.json`). La sesión y las puntuaciones de la app siguen siendo simuladas en `localStorage` hasta las specs de auth y puntuaciones.

## Supabase

- **Variables de entorno** (en `.env.local`, ignorado por git; plantilla en `.env.example`): `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). El `.env` existente solo guarda `SUPABASE_DB_PASSWORD`. No se usa secret/service role key.
- **Clientes** en `lib/supabase/`, tipados con `Database`:
  - `client.ts`: `createClient()` para client components.
  - `server.ts`: `createClient()` asíncrono para Server Components, Server Functions y Route Handlers.
  - `proxy.ts`: `updateSession()`, invocado desde `proxy.ts` (raíz) para refrescar la sesión en cada petición. Next 16 usa `proxy.ts`, no `middleware.ts`.
- **Tipos**: `lib/supabase/database.types.ts` es generado (MCP `generate_typescript_types`); no se edita a mano y se regenera tras cada migración.
- **Migraciones**: archivos `supabase/migrations/<YYYYMMDDHHMMSS>_<nombre>.sql` versionados en git, aplicados al remoto con `apply_migration` del MCP usando el mismo nombre.
- **Health check**: `GET /api/health` responde `200 { ok: true }` o `503 { ok: false, error }`.

## Juegos

Convención para portar un juego real (el resto del catálogo en `lib/games.ts` sigue simulado en `components/game-player.tsx`):

- **Motor** en `lib/games/<juego>/`: TypeScript sin `window`/`document`; expone `createXEngine({ onChange, onGameOver })` con `update(dt)`, `draw(ctx)`, `setKeys`, `reset` y `getSnapshot`. Las entidades reciben el `ctx` por parámetro.
- **Componente** en `components/games/<juego>-canvas.tsx` (client): monta el `<canvas>`, registra teclado y `requestAnimationFrame`, y los limpia al desmontar. Props: `paused`, `runId` (cambiarlo reinicia), `onChange`, `onGameOver`. Escalado con `.game-canvas` en `app/globals.css`.
- **Integración**: `GamePlayer` elige el canvas real según `gameId`; el HUD, la pausa y el modal de fin son de la plataforma y el puntaje se guarda con `saveScore` (`av_scores`).
- **Registro**: `components/games/registry.ts` mapea el `id` de la tabla `games` al canvas real (`GAME_CANVASES`); `GamePlayer` lo consulta y, sin entrada, usa la simulación. Los canvas emiten `GameSnapshot` (`lib/games/types.ts`: `score`, y opcionales `lives`, `level`, `stats`); el HUD solo muestra lo que el juego reporta.
- **Juegos reales**:
  - `asteroids` (Asteroids, `lib/games/asteroids/`; solo teclado: `←` `→` `↑` `Espacio`). Fuente original en `references/started-games/02-asteroids/`.
  - `tetris` (Tetris, `lib/games/tetris/`; canvas 800×600 con tablero 10×20 centrado y vista previa a la derecha; 8 piezas, incluida la tuerca; solo teclado: `←` `→` mover, `↑`/`X` rotar, `↓` soft drop, `Espacio` hard drop). Fuente original en `references/started-games/03-tetris/`.
  - `viuda` (Viuda, `lib/games/viuda/`; juego de cartas de póker por vidas, diseño propio sin fuente original, ver `specs/07-juego-viuda.md`; canvas 800×600, tú contra 3 CPU, 3 vidas cada uno). Cada ronda: sorteo inicial (solo ronda 1), 5 cartas por jugador y 5 en la viuda; la viuda empieza cerrada y se abre cuando alguien cambia las 5 o cuando pasan todos; CAMBIAR 5 siempre está disponible y CAMBIAR 1 solo con la viuda abierta; las vueltas son ilimitadas hasta que alguien llame; tras un "llamo" los demás juegan una última vuelta (cambiar o pasar) y al volver a quien llamó se muestran las manos; el duelo quita 1 vida a la peor mano. Puntuación: solo victoria (`3000 + 300 × vidas`), derrota = 0. El motor expone además `press(code)`, `setPointer(x, y)` y `click()`; el canvas convierte el ratón a coordenadas lógicas. Teclas: `P` paso, `L` llamo, `C` cambiar 5, `X` cambiar 1, `1`–`5` carta propia, `Q W E R T` carta de la viuda, `Espacio`/`Enter` continuar; el ratón también funciona. Cover `cover-viuda` en `app/globals.css`.

## `references/templates/`

Prototipo de diseño de referencia (HTML + JSX con React por CDN y Babel, no es código de la app). Es la fuente de verdad del diseño/UX a portar a `app/`:

- `Arcade Vault.html` + `styles.css`: entrada y estilos.
- `app.jsx`: router casero basado en estado (`route.name`: `biblioteca`, `detalle`, `player`, `auth`, `salon`) sincronizado con `location.hash`.
- Pantallas: `biblioteca.jsx`, `detalle.jsx`, `reproductor.jsx`, `auth.jsx`, `salon.jsx` (salón de la fama); `nav.jsx` y `data.jsx` (catálogo de juegos).
- Persistencia simulada en `localStorage` (`av_user` para sesión, `av_scores` para puntuaciones).

Al portarlo, se traduce a rutas del App Router en lugar del router por hash.

## Skills

Usa siempre /frontend-design para diseñar la interfaz de usuario.
