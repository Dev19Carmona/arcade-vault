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

## `references/templates/`

Prototipo de diseño de referencia (HTML + JSX con React por CDN y Babel, no es código de la app). Es la fuente de verdad del diseño/UX a portar a `app/`:

- `Arcade Vault.html` + `styles.css`: entrada y estilos.
- `app.jsx`: router casero basado en estado (`route.name`: `biblioteca`, `detalle`, `player`, `auth`, `salon`) sincronizado con `location.hash`.
- Pantallas: `biblioteca.jsx`, `detalle.jsx`, `reproductor.jsx`, `auth.jsx`, `salon.jsx` (salón de la fama); `nav.jsx` y `data.jsx` (catálogo de juegos).
- Persistencia simulada en `localStorage` (`av_user` para sesión, `av_scores` para puntuaciones).

Al portarlo, se traduce a rutas del App Router en lugar del router por hash.
