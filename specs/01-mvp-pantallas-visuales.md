# SPEC 01 — MVP visual de Arcade Vault (5 pantallas)

> **Estado:** Aprovado
> **Depende de:** ninguna
> **Fecha:** 2026-10-13
> **Objetivo:** Portar las cinco pantallas del prototipo `references/templates/` (biblioteca, detalle, reproductor, acceso y salón de la fama) a rutas del App Router de Next.js, solo en su parte visual y con datos simulados.

---

## Por qué existe este spec

El código actual en `app/` es el scaffold de Create Next App y solo tiene el layout con las fuentes y el tema en `app/globals.css`. El prototipo en `references/templates/` es HTML + JSX con React por CDN y un router por hash; no es reutilizable tal cual. Este spec lo traduce a la arquitectura real del proyecto (App Router, TypeScript estricto) y fija una base visual sobre la que construir los juegos y el backend en specs posteriores.

---

## Alcance

**Dentro:**

- Pantalla **Biblioteca** en `/`: hero, buscador por nombre, chips de categoría, grilla de tarjetas con efecto tilt y estado vacío "NO HAY RESULTADOS".
- Pantalla **Detalle** en `/juego/[id]`: portada, etiquetas, descripción larga, métricas, botones de acción y tabla "MEJORES PUNTUACIONES".
- Pantalla **Reproductor** en `/juego/[id]/jugar`: HUD, marco CRT con arena decorativa, pausa, fin de partida, modal de puntuación final con guardado.
- Pantalla **Acceso** en `/acceso`: pestañas iniciar sesión / crear cuenta, formulario, "jugar como invitado" y botones sociales (solo visuales).
- Pantalla **Salón de la Fama** en `/salon`: pestañas por juego, podio top 3, tabla de 12 filas y fila "tu mejor marca" si hay sesión.
- Navegación global (barra superior, menú móvil, contador de créditos) y footer, ambos en `app/layout.tsx`.
- Catálogo de 8 juegos y puntuaciones generadas con semilla, portados desde `data.jsx`.
- Sesión simulada y guardado de puntuaciones en `localStorage` (`av_user`, `av_scores`).
- Diseño responsive equivalente al del prototipo (menú hamburguesa en móvil).

**Fuera de alcance (para specs futuros):**

- Implementación real de cualquier juego (la arena del reproductor es decorativa).
- Backend, base de datos y autenticación real (OAuth con Google/GitHub, validación de contraseñas, verificación de correo).
- Mostrar en los rankings las puntuaciones guardadas en `av_scores` (el prototipo solo las escribe).
- Sistema real de créditos (el contador "CRÉDITOS · 03" es estático).
- Tests automatizados (el proyecto no tiene framework de tests).
- Internacionalización; la UI queda solo en español.

---

## Modelo de datos

Este spec no introduce persistencia nueva más allá de las dos claves de `localStorage` del prototipo. Tipos en `lib/games.ts` y `lib/session.ts`:

```ts
// lib/games.ts
export type GameCategory = "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";
export type GameColor = "cyan" | "magenta" | "yellow" | "green";

export interface Game {
  id: string;            // slug, p. ej. "bloque-buster"
  title: string;
  short: string;
  long: string;
  cat: GameCategory;
  cover: string;         // clase CSS existente, p. ej. "cover-bricks"
  color: GameColor;
  best: number;
  plays: string;         // texto ya formateado, p. ej. "12.4K"
}

export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  date: string;          // "DD/MM/2026"
}

// lib/session.ts
export interface User { name: string }          // MAYÚSCULAS, máx. 10 caracteres
export interface SavedScore {
  game: string;          // Game["id"]
  score: number;
  name: string;
  at: number;            // Date.now()
}
```

Claves de `localStorage`:

- `av_user`: `User | null` serializado en JSON.
- `av_scores`: `SavedScore[]` serializado en JSON.

Convenciones:

- Números con `toLocaleString("es-ES")`.
- `seededScores(seed, count)` es determinista (mismo seed, mismo resultado) para no romper la hidratación. Las semillas son las del prototipo: `id.length * 17 + 3` en detalle y `tab.length * 23 + 7` en salón.
- Todo acceso a `localStorage` va dentro de `try/catch` y solo en cliente.

---

## Plan de implementación

Antes de escribir código, leer la guía relevante de `node_modules/next/dist/docs/` (Next 16 tiene cambios incompatibles; por ejemplo `params` de las páginas dinámicas). Las pantallas se diseñan con la skill `/frontend-design`, tomando `references/templates/` como fuente de verdad.

1. **Datos y utilidades.** Crear `lib/games.ts` con `Game`, `GAMES`, `CATS` y `seededScores` portados de `data.jsx`. Verificación: `npm run lint` y `npm run build` pasan.
2. **Sesión.** Crear `lib/session.ts` y `components/session-provider.tsx` (client) con contexto `{ user, ready, login, signOut, saveScore }`; lee `av_user` en un `useEffect` para evitar errores de hidratación. Montarlo en `app/layout.tsx`. Verificación: la app sigue cargando sin warnings.
3. **Navegación y footer.** Crear `components/nav.tsx` (client) con enlaces, estado activo según `usePathname()`, contador de créditos, botón de sesión y panel móvil; crear `components/footer.tsx`. Envolver `children` en `<main className="av-main">` dentro de `app/layout.tsx`. Verificación: la barra se ve en `/` y los enlaces navegan.
4. **Biblioteca.** Reemplazar `app/page.tsx` por la biblioteca; el filtrado y las tarjetas viven en `components/library-view.tsx` y `components/game-card.tsx` (client). Verificación: buscar y filtrar por categoría funciona, y la tarjeta lleva a `/juego/[id]`.
5. **Detalle.** Crear `app/juego/[id]/page.tsx` (server, con `generateStaticParams` y `notFound()` si el id no existe). Verificación: abrir `/juego/caida` muestra datos y ranking; `/juego/xyz` da 404.
6. **Acceso.** Crear `app/acceso/page.tsx` con `components/auth-form.tsx` (client). Al enviar o jugar como invitado, llama a `login` y redirige a `/`. Verificación: tras entrar, la barra muestra el nombre del usuario.
7. **Reproductor.** Crear `app/juego/[id]/jugar/page.tsx` con `components/game-player.tsx` (client): puntaje simulado por `setInterval`, pausa, fin, modal y guardado vía `saveScore`. Verificación: guardar una puntuación crea la entrada en `av_scores`.
8. **Salón de la Fama.** Crear `app/salon/page.tsx` con `components/hall-of-fame.tsx` (client). Verificación: cambiar de pestaña actualiza podio y tabla; con sesión aparece "TU MEJOR MARCA".
9. **Metadata.** Añadir `metadata`/`generateMetadata` por ruta (título por pantalla). Verificación: el título de la pestaña cambia entre pantallas.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores.
- [ ] `/` muestra las 8 tarjetas de juego y el título "ARCADE VAULT".
- [ ] Escribir "caida" en el buscador deja solo la tarjeta CAÍDA; la búsqueda no distingue mayúsculas.
- [ ] El chip "SHOOTER" muestra exactamente INVASORES y ROCAS.
- [ ] Una búsqueda sin coincidencias muestra "NO HAY RESULTADOS".
- [ ] Hacer clic en una tarjeta o en su botón JUGAR navega a `/juego/[id]` del juego correcto.
- [ ] `/juego/[id]` muestra 10 filas de puntuaciones y el botón "JUGAR AHORA" lleva a `/juego/[id]/jugar`.
- [ ] `/juego/inexistente` devuelve la página 404.
- [ ] En `/juego/[id]/jugar` la puntuación aumenta sola; PAUSA la detiene y REANUDAR la retoma.
- [ ] Pulsar FIN abre el modal con la puntuación final; "GUARDAR PUNTUACIÓN" escribe un registro en `localStorage["av_scores"]` y muestra "PUNTUACIÓN GUARDADA".
- [ ] "JUGAR DE NUEVO" reinicia puntaje, vidas y nivel a 0 / 3 / 1; "VOLVER AL VAULT" navega a `/`.
- [ ] En `/acceso`, la pestaña "CREAR CUENTA" muestra el campo de correo y "INICIAR SESIÓN" lo oculta.
- [ ] Enviar el formulario con usuario "px_kai" guarda `av_user` con nombre `PX_KAI` y redirige a `/`.
- [ ] "JUGAR COMO INVITADO" redirige a `/` sin sesión.
- [ ] Con sesión iniciada, la barra muestra el nombre y al pulsarlo se cierra la sesión y se borra `av_user`.
- [ ] Recargar la página con sesión iniciada mantiene al usuario y no produce warnings de hidratación en la consola.
- [ ] `/salon` muestra podio con 3 posiciones y 12 filas; cambiar de pestaña cambia los datos.
- [ ] En `/salon` la fila "TU MEJOR MARCA" aparece solo con sesión iniciada.
- [ ] A 375 px de ancho no hay scroll horizontal y el botón ≡ abre el panel móvil con los enlaces.
- [ ] El enlace "Biblioteca" aparece activo en `/`, `/juego/[id]` y `/juego/[id]/jugar`; "Salón de la Fama" lo está en `/salon`.

---

## Decisiones tomadas y descartadas

- **Sí:** rutas `/`, `/juego/[id]`, `/juego/[id]/jugar`, `/acceso`, `/salon`. Es la estructura anidada natural del App Router y las URLs en español son coherentes con la UI.
- **No:** rutas en inglés (`/games`, `/auth`, `/hall-of-fame`) ni copiar los nombres de `route.name` del prototipo.
- **Sí:** reutilizar el CSS ya portado en `app/globals.css` y las fuentes de `next/font` en `app/layout.tsx`. Ya existen las clases del prototipo (`.av-nav`, `.card`, `.crt`, `.podium`, etc.).
- **No:** reescribir con utilidades Tailwind ni CSS Modules; añade trabajo y riesgo de perder fidelidad en los efectos neón/CRT.
- **Sí:** `localStorage` con `av_user` y `av_scores`, igual que el prototipo. Es suficiente para un MVP visual sin backend.
- **No:** cookies ni Server Actions simuladas; es sobreingeniería sin backend real.
- **Sí:** reproductor con simulación del prototipo (arena decorativa y puntaje que sube solo). Permite validar el flujo completo de fin de partida y guardado.
- **No:** pantalla estática "PRÓXIMAMENTE"; no se podría probar el modal ni el guardado.
- **Sí:** `seededScores` determinista, tal como el prototipo. Garantiza que servidor y cliente rendericen lo mismo.
- **Sí:** la página de detalle es de servidor (con `generateStaticParams`) y solo los componentes interactivos son client components.
- **Sí:** el nombre del producto es **Arcade Vault**. La petición inicial dice "Arcade Bot", pero el repositorio, `CLAUDE.md` y el prototipo usan "Arcade Vault".
- **No:** mostrar las puntuaciones guardadas en los rankings; el prototipo no lo hace y queda para un spec con backend.

---

## Riesgos identificados

| Riesgo                                                                      | Mitigación                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Errores de hidratación por leer `localStorage` en el render inicial         | Leerlo solo en `useEffect`; el contexto expone `ready` y la barra no muestra estado de sesión hasta que sea `true`.       |
| `localStorage` bloqueado o con JSON corrupto (modo privado, datos manuales) | Todo acceso va en `try/catch`; ante fallo se trata como sin sesión y sin puntuaciones.                                    |
| Next 16 cambia APIs respecto a lo conocido (`params`, `LayoutProps`, etc.)  | Leer `node_modules/next/dist/docs/` antes de escribir cada página; `npm run build` valida los tipos.                      |
| Efectos CRT/neón y animaciones pesan en móviles                             | Se mantienen como en el prototipo; si se detecta lentitud, se revisa en un spec de rendimiento, no en este.               |

---

## Qué **no** está en este spec

- Ningún juego jugable (Bloque Buster, Caída, Serpentina, etc.).
- Backend, base de datos o autenticación real.
- Rankings alimentados por las puntuaciones guardadas.
- Créditos funcionales, tienda o monetización.
- Tests automatizados.
- Multijugador o modo versus real.

Cada uno de estos puntos, si se aborda, va en su propio spec.
