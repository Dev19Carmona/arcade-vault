# SPEC 02 — Homepage (landing) de Arcade Vault

> **Estado:** Aprovado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-13
> **Objetivo:** Portar el homepage de `references/templates/home-about/` (`home.jsx`) a la ruta `/` del App Router, moviendo la Biblioteca de la SPEC 01 a `/games`, solo en su parte visual y con datos estáticos.

---

## Por qué existe este spec

La SPEC 01 dejó la Biblioteca en `/`, así que el sitio no tiene una página de presentación. El prototipo `references/templates/home-about/` añade una landing (hero, ventajas, juegos destacados, estadísticas, actividad, precios y CTA final) y un nav con "Inicio". Este spec la incorpora y reubica la Biblioteca, lo que obliga a tocar los enlaces de la SPEC 01 que apuntaban a `/`.

El prototipo también incluye la pantalla "Acerca de" + Contacto (`about.jsx`); queda fuera y se aborda en otro spec.

---

## Alcance

**Dentro:**

- Pantalla **Home** en `/` con las secciones de `home.jsx`: hero con siluetas flotantes y dos CTA, "¿POR QUÉ ARCADE VAULT?" (4 tarjetas), "JUEGOS DISPONIBLES AHORA" (6 mini-tarjetas), franja de estadísticas, "ACTIVIDAD EN VIVO" (últimas puntuaciones + top del día), "PRECIOS" (plan único + 3 preguntas frecuentes) y CTA final.
- Mover la Biblioteca de `/` a `/games` sin cambiar su comportamiento.
- Actualizar la navegación: enlace "Inicio" (`/`), "Biblioteca" (`/games`), "Salón de la Fama" (`/salon`), tanto en la barra como en el panel móvil.
- Revelado al hacer scroll (`.reveal` → `.in`) mediante `IntersectionObserver`.
- Portar a `app/globals.css` los estilos de la landing desde `references/templates/home-about/styles.css`.
- Reapuntar los enlaces internos de la SPEC 01 que hoy llevan a `/` pensando en la Biblioteca.
- Metadata de la página `/` y de `/games`.

**Fuera de alcance (para specs futuros):**

- Pantalla "Acerca de" + Contacto (`about.jsx`), su ruta y el enlace "Acerca de" del nav.
- Datos reales: actividad en vivo, top del día, contadores y precios son texto fijo.
- Backend, autenticación real o envío de formularios.
- Sistema real de créditos (el contador "CRÉDITOS · 03" sigue siendo estático).
- Los estilos del gamepad y de las variantes de tema presentes en `styles.css` del prototipo.
- Tests automatizados (el proyecto no tiene framework de tests).
- Internacionalización; la UI queda solo en español.

---

## Modelo de datos

Este spec no introduce persistencia ni estructuras de sesión nuevas. Reutiliza `Game` y `GAMES` de `lib/games.ts` (SPEC 01) y añade datos estáticos de contenido en `lib/home.ts`:

```ts
// lib/home.ts
export type HomeColor = "cyan" | "magenta" | "yellow" | "green";

export interface Feature {
  icon: "GAMEPAD" | "FREE" | "TROPHY" | "ROCKET";
  title: string;
  desc: string;
  color: HomeColor;
}

export interface HomeStat { n: string; unit: string; sub: string }

export interface RecentScore {
  player: string;
  game: string;          // título visible, no id
  score: number;
  ago: string;           // texto ya formateado, p. ej. "hace 2 min"
  color: HomeColor;
}

export interface TopPlayer { rank: number; player: string; score: number }

export interface FaqItem { q: string; a: string }
```

Contenido fijo exportado: `FEATURES` (4), `HOME_STATS` (3), `RECENT_SCORES` (7), `TOP_PLAYERS` (5), `PRICING_PERKS` (6), `FAQ` (3). Los valores son los de `home.jsx`.

Convenciones:

- Números con `toLocaleString("es-ES")`.
- "JUEGOS DISPONIBLES AHORA" usa `GAMES.slice(0, 6)`; no se duplica el catálogo.
- Las ruta de la Biblioteca se define en un único lugar (constante `ROUTES` o equivalente en `lib/`) para no repetir el literal `"/games"`.

---

## Plan de implementación

Antes de escribir código, leer la guía relevante de `node_modules/next/dist/docs/` (Next 16 tiene cambios incompatibles). La interfaz se diseña con la skill `/frontend-design`, tomando `references/templates/home-about/` como fuente de verdad.

1. **Mover la Biblioteca a `/games`.** Crear `app/games/page.tsx` con el contenido actual de `app/page.tsx` (hero + `LibraryView`) y dejar temporalmente `app/page.tsx` redirigiendo o con un enlace a `/games`. Verificación: `/games` muestra las 8 tarjetas y `npm run build` pasa.
2. **Reapuntar enlaces.** Cambiar a `/games` los enlaces que significan "Biblioteca": `Link href="/"` en `components/game-player.tsx` ("VOLVER AL VAULT"), `components/hall-of-fame.tsx` y `app/juego/[id]/page.tsx`. La redirección tras login en `components/auth-form.tsx` (`router.push("/")`) se mantiene en `/` por ser la página de inicio. Verificación: cada botón lleva a la pantalla esperada.
3. **Navegación.** En `components/nav.tsx`, añadir sección `inicio` (solo `pathname === "/"`), mover `biblioteca` a `/games` y `/juego*`, y añadir el enlace "Inicio" a barra y panel móvil; el logo apunta a `/`. Verificación: el enlace activo es correcto en `/`, `/games`, `/juego/caida` y `/salon`.
4. **Datos de contenido.** Crear `lib/home.ts` con los tipos y constantes del modelo de datos. Verificación: `npm run lint` y `npm run build` pasan.
5. **Estilos.** Portar a `app/globals.css` las secciones `HOME PAGE`, `ACTIVITY` y `PRICING` de `references/templates/home-about/styles.css` (incluidas `@keyframes bounce`, `float`, `tickin`, `pulse-led`, `.reveal`/`.reveal.in`), sin las secciones `ABOUT PAGE`, `GAMEPAD` ni `Theme variants`. Verificación: no se rompen las pantallas de la SPEC 01.
6. **Hook de revelado.** Crear `components/use-reveal.ts` (client) con el `IntersectionObserver` de `useReveal`, respetando `prefers-reduced-motion` (si está activo, marca todo como `.in`). Verificación: los bloques `.reveal` pasan a `.in` al entrar en pantalla.
7. **Hero y siluetas.** Crear `components/home/hero.tsx` y `components/home/floating-silhouettes.tsx` (server, SVG inline). CTA "EXPLORAR JUEGOS" → `/games`; "CREAR CUENTA" → `/acceso`. Verificación: el hero se ve en `/` con ambos botones navegando.
8. **Ventajas y juegos.** Crear `components/home/features.tsx` (con `FeatureIcon`) y `components/home/games-preview.tsx`; cada mini-tarjeta enlaza a `/juego/[id]` y el botón "VER TODOS LOS JUEGOS" a `/games`. Verificación: aparecen 4 tarjetas y 6 mini-tarjetas.
9. **Estadísticas, actividad, precios y CTA final.** Crear `components/home/stats.tsx`, `activity.tsx`, `pricing.tsx` y `final-cta.tsx`; "VER SALÓN" → `/salon`, "EMPEZAR GRATIS" → `/acceso`, "INSERTAR MONEDA" → `/games`. Verificación: todas las secciones renderizan con los datos de `lib/home.ts`.
10. **Página y metadata.** Reemplazar `app/page.tsx` por la composición del home con `useReveal` aplicado desde un único wrapper client, y añadir `metadata` en `app/page.tsx` y `app/games/page.tsx`. Verificación: el título de la pestaña cambia entre `/` y `/games`.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] `/` muestra el titular "EL ARCADE CLÁSICO ESTÁ DE VUELTA" y las secciones `// 01` a `// 04` más el CTA final "¿LISTO PARA JUGAR?".
- [ ] `/games` muestra las 8 tarjetas de la Biblioteca y conserva buscador, chips de categoría y estado "NO HAY RESULTADOS".
- [ ] El botón "EXPLORAR JUEGOS" del hero navega a `/games`.
- [ ] El botón "CREAR CUENTA" del hero navega a `/acceso`.
- [ ] "JUEGOS DISPONIBLES AHORA" muestra exactamente 6 mini-tarjetas y cada una navega a `/juego/[id]` del juego correcto.
- [ ] "VER TODOS LOS JUEGOS" y "INSERTAR MONEDA" navegan a `/games`.
- [ ] "VER SALÓN" navega a `/salon`; "EMPEZAR GRATIS" navega a `/acceso`.
- [ ] La sección "ACTIVIDAD EN VIVO" muestra 7 filas de puntuaciones y 5 del top del día, con números en formato `es-ES`.
- [ ] La sección "PRECIOS" muestra el plan "JUGADOR VAULT" con 6 ventajas y 3 preguntas frecuentes.
- [ ] La barra y el panel móvil muestran "Inicio", "Biblioteca" y "Salón de la Fama"; no aparece "Acerca de".
- [ ] "Inicio" está activo solo en `/`; "Biblioteca" lo está en `/games`, `/juego/[id]` y `/juego/[id]/jugar`; "Salón de la Fama" en `/salon`.
- [ ] El logo del nav lleva a `/`.
- [ ] "VOLVER AL VAULT" del reproductor, el botón de volver de `/juego/[id]` y el de `/salon` llevan a `/games`.
- [ ] Iniciar sesión desde `/acceso` redirige a `/`.
- [ ] Los bloques `.reveal` quedan ocultos al cargar y reciben `.in` al hacer scroll hasta ellos; con `prefers-reduced-motion: reduce` aparecen visibles de inmediato.
- [ ] A 375 px de ancho no hay scroll horizontal en `/` y las rejillas colapsan a 2 y 1 columnas según el prototipo.
- [ ] Recargar `/` con sesión iniciada no produce warnings de hidratación en la consola.
- [ ] Las pantallas de la SPEC 01 (`/juego/[id]`, `/juego/[id]/jugar`, `/acceso`, `/salon`) se ven igual que antes de este spec.

---

## Decisiones tomadas y descartadas

- **Sí:** Home en `/` y Biblioteca en `/games`. Una landing en la raíz es lo esperable de un sitio público y coincide con el nav del prototipo ("Inicio" + "Biblioteca").
- **No:** Home en `/inicio` con la Biblioteca en `/`. Evitaba tocar enlaces, pero dejaba la raíz sin landing.
- **Sí:** `/games` en inglés, por decisión explícita del usuario.
- **No:** `/biblioteca`, que seguiría el criterio de URLs en español de la SPEC 01. Se registra que `/games` rompe esa convención solo en esta ruta; el resto (`/juego`, `/acceso`, `/salon`) no cambia.
- **Sí:** el nombre del producto es **Arcade Vault**. La petición inicial dice "Accorda", pero el repositorio, `CLAUDE.md` y el prototipo usan "Arcade Vault".
- **Sí:** solo el homepage; "Acerca de" + Contacto va en su propio spec. El nav no enseña enlaces a pantallas que aún no existen.
- **Sí:** datos de actividad, top y estadísticas estáticos, tal como el prototipo. Es un MVP visual sin backend, igual que la SPEC 01.
- **No:** derivar el top y la actividad de `seededScores`; cambiaría los datos del prototipo sin aportar valor real.
- **Sí:** reutilizar `GAMES` para las mini-tarjetas, de modo que el home siempre refleje el catálogo.
- **Sí:** reutilizar el CSS del prototipo en `app/globals.css` en lugar de reescribirlo con utilidades Tailwind, por fidelidad en los efectos neón y las animaciones (misma decisión que la SPEC 01).
- **Sí:** componentes de servidor por defecto (hero, ventajas, precios, etc.) y solo el hook de revelado en cliente, para mantener el HTML de la landing renderizado en servidor.
- **Sí:** respetar `prefers-reduced-motion` en el revelado. El prototipo no lo hacía.
- **No:** portar el gamepad ni las variantes de tema de `styles.css`; pertenecen a otra pantalla que no está en este spec.

---

## Riesgos identificados

| Riesgo                                                                                  | Mitigación                                                                                                             |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Enlaces a `/` olvidados tras mover la Biblioteca, dejando botones apuntando al lugar equivocado | El paso 2 lista los archivos conocidos; verificar con búsqueda de `href="/"` y `push("/")` antes de cerrar el paso.    |
| Contenido `.reveal` invisible si el observador no se ejecuta (JS desactivado o falla del hook)   | Ocultar con `.reveal` solo cuando el hook ya montó (clase en el wrapper) o marcar `.in` ante cualquier error.          |
| Colisión de nombres CSS al pegar los estilos del prototipo (`.stat-n`, `.field`, `.kicker`)      | Portar solo las secciones indicadas y comprobar que no sobrescriben reglas existentes; revisar las 5 pantallas de la SPEC 01. |
| Peso de las animaciones (siluetas flotantes, ticker) en móviles                                  | Se mantienen como en el prototipo; ocultar o reducir en `prefers-reduced-motion`. Optimización real, en un spec aparte. |
| Next 16 cambia APIs respecto a lo conocido                                                       | Leer `node_modules/next/dist/docs/` antes de cada página; `npm run build` valida los tipos.                            |

---

## Qué **no** está en este spec

- La pantalla "Acerca de" + Contacto y su formulario.
- Backend, base de datos o autenticación real.
- Actividad, rankings o estadísticas alimentados por datos reales.
- Créditos funcionales, tienda o monetización.
- Gamepad virtual ni variantes de tema.
- Tests automatizados.

Cada uno de estos puntos, si se aborda, va en su propio spec.
