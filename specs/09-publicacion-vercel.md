# SPEC 09 — Publicación en Vercel

> **Estado:** Approved
> **Depende de:** SPEC 03 (clientes y variables de Supabase), SPEC 05 (tablas `games`/`scores`), SPEC 08 (Viuda en línea y tabla `rooms`)
> **Fecha:** 2026-10-21
> **Objetivo:** Publicar Arcade Vault en Vercel mediante la integración Git con GitHub, conectado al proyecto Supabase remoto, y comprobar en la URL pública que toda la app, incluida Viuda en línea entre varios navegadores, funciona igual que en local.

---

## Por qué existe este spec

La app solo se ha ejecutado con `npm run dev`. Antes de publicarla hay que comprobar que el build de producción pasa, que las variables de Supabase llegan al despliegue y que el modo en línea de Viuda (Realtime, presence, broadcast, anfitrión autoritativo en el navegador) sobrevive a un entorno HTTPS con funciones serverless.

SPEC 08 ya decidió que el transporte es Supabase Realtime precisamente porque Vercel no mantiene WebSockets propios, así que no se espera cambiar código del juego. Lo que sí falta es la plomería de despliegue, una limpieza del repo (hay logs de Playwright versionados) y una verificación real en producción.

Este spec **no cambia funcionalidad**: es configuración, higiene del repo y verificación.

---

## Alcance

**Dentro:**

- Verificar en local que `npm run lint` y `npm run build` pasan y que `npm run start` sirve el build de producción con Viuda en línea operativa.
- Limpiar el repo antes de publicar: dejar de versionar `.playwright-mcp/` (logs de consola) y añadirlo a `.gitignore`.
- Importar el repo `Dev19Carmona/arcade-vault` en Vercel con la **integración Git** (producción desde `master`, previews desde ramas y PR).
- Configurar en Vercel las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en los entornos Production y Preview (mismo proyecto Supabase `mendwbsdxpwrrrqlsmxe`).
- Auditoría de seguridad previa: `get_advisors` (security y performance) de Supabase y comprobación de que ninguna clave secreta está en archivos versionados ni en variables `NEXT_PUBLIC_*`.
- Verificación en la URL `*.vercel.app` de producción: rutas, `GET /api/health`, juegos reales, puntuaciones y una partida de Viuda en línea con al menos 2 navegadores/perfiles distintos.
- Documentar el despliegue en `CLAUDE.md` (sección propia) y en `README.md`.

**Fuera de alcance (para otros specs):**

- Dominio propio y DNS (se usa solo `*.vercel.app`).
- Proyecto o branch de Supabase separado para previews (comparten el proyecto de producción).
- Endurecimiento de seguridad: Supabase Auth, RLS por usuario, canales privados de Realtime, servidor autoritativo para Viuda (siguen los riesgos asumidos de SPEC 05 y SPEC 08).
- Pipeline propio con GitHub Actions, tests automatizados o CI.
- Analítica, Speed Insights, monitoreo de errores y alertas.
- Limpieza programada de `rooms` (`pg_cron`).
- Cambios visuales o de lógica en los juegos. Si la verificación en producción revela un bug, se corrige con un spec o fix aparte salvo que bloquee el despliegue.

---

## Modelo de datos

Este spec no crea tablas, columnas ni migraciones. Solo introduce configuración de entorno:

| Variable                               | Dónde (Vercel)      | Valor                                                               |
| -------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Production, Preview | `https://mendwbsdxpwrrrqlsmxe.supabase.co` (igual que `.env.local`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview | `sb_publishable_…` (igual que `.env.local`)                         |

- Son variables públicas por diseño (se incrustan en el bundle del cliente). `SUPABASE_DB_PASSWORD` del `.env` local **no** se sube a Vercel: la app no la usa.
- `NEXT_PUBLIC_*` se resuelve en tiempo de **build**: cambiarla en Vercel exige un nuevo despliegue.
- Sin `vercel.json`: la detección automática del preset Next.js basta. Solo se crea si la verificación demuestra que hace falta algo concreto.

### Archivos que cambian

```
.gitignore        añade .playwright-mcp/
.playwright-mcp/  deja de estar versionado (git rm --cached; los archivos locales se conservan)
CLAUDE.md         sección «Despliegue» (URL, variables, flujo Git, cómo verificar)
README.md         sección breve «Despliegue»
specs/09-publicacion-vercel.md
```

Los pasos en el panel de Vercel (importar el repo, cargar variables, desplegar) los ejecuta el usuario; no dejan archivos en el repo.

---

## Plan de implementación

Antes de tocar nada, leer en `node_modules/next/dist/docs/` la guía de despliegue (`deploying`) y la de `proxy`, porque Next 16 tiene diferencias frente a lo conocido, y consultar con `search_docs` los límites de Realtime del plan de Supabase del proyecto (conexiones concurrentes y mensajes por segundo).

1. **Build de producción en local.** Ejecutar `npm run lint` y `npm run build`; corregir lo que falle. Servir con `npm run start` y recorrer `/`, `/games`, `/juego/viuda`, `/juego/viuda/jugar`, `/acceso` y `/salon`, y `GET /api/health`. Verificación: build sin errores; `{"ok":true}`; sin errores nuevos en consola.
2. **Viuda en línea sobre el build de producción.** Con `npm run start`, jugar una ronda completa de Viuda en línea con 2 pestañas (anfitrión y jugador). StrictMode no aplica en producción, por lo que esta prueba detecta dependencias de comportamiento de desarrollo. Verificación: se crea la sala, se une el segundo jugador, se juega una ronda y cada uno ve solo su mano.
3. **Higiene del repo.** Añadir `.playwright-mcp/` a `.gitignore` y ejecutar `git rm -r --cached .playwright-mcp`. Confirmar con `git ls-files` que no queda ningún `.log` ni `.env*` salvo `.env.example`. Verificación: `git status` limpio tras el commit; los archivos locales siguen en disco.
4. **Auditoría de Supabase y secretos.** Ejecutar `get_advisors` (security y performance) sobre el proyecto y registrar los avisos en el spec o en `CLAUDE.md` como riesgos conocidos, sin corregirlos aquí. Buscar con `git grep` cadenas como `service_role`, `SUPABASE_DB_PASSWORD` o claves JWT en archivos versionados. Borrar de `rooms` las filas de prueba de desarrollo. Verificación: ninguna clave secreta en el repo ni en el historial reciente; avisos anotados.
5. **Importar el proyecto en Vercel.** El usuario importa `Dev19Carmona/arcade-vault` desde GitHub, con preset Next.js detectado, rama de producción `master`, comandos por defecto (`next build`) y sin directorio raíz personalizado. Antes del primer despliegue carga las dos variables en Production y Preview. Verificación: el primer despliegue termina en estado Ready y el log de build no muestra errores ni avisos de variables ausentes.
6. **Verificación en producción (`*.vercel.app`).**
   - Las rutas del paso 1 cargan, `/api/health` responde `200 {"ok":true}` y el favicon, las portadas y los estilos se ven.
   - Asteroids y Tetris se juegan y su puntuación se guarda y aparece en el ranking.
   - Viuda VS CPU se juega entera.
   - Viuda en línea con **2 navegadores o perfiles distintos** (idealmente un móvil por datos móviles): crear sala, listar sala abierta, unirse con código, iniciar, jugar una ronda y llegar al duelo.
   - Cerrar la pestaña de un jugador muestra «desconectado»; pausar y reenganchar funciona; cerrar la pestaña del anfitrión cierra la sala.
   - Revisar la consola y la pestaña de red: sin errores de WebSocket, CORS ni 4xx/5xx inesperados.
7. **Preview de una rama.** Subir una rama con un cambio trivial, comprobar que Vercel genera el preview y que la app y `/api/health` funcionan allí con las variables de Preview. Verificación: URL de preview con `{"ok":true}`.
8. **Documentación.** Añadir a `CLAUDE.md` la sección «Despliegue» (URL de producción, variables y entornos, despliegue automático desde `master`, previews que comparten datos con producción, recordatorio de que `NEXT_PUBLIC_*` requiere redeploy, qué verificar tras cada despliegue) y un resumen en `README.md`. Verificación: lectura de ambos archivos.

---

## Criterios de aceptación

- [ ] `npm run lint` y `npm run build` terminan sin errores en local.
- [ ] `.playwright-mcp/` está en `.gitignore` y `git ls-files` no lista ningún `.log` ni `.env*` salvo `.env.example`.
- [ ] No hay claves secretas (`service_role`, contraseña de BD) en archivos versionados ni en variables `NEXT_PUBLIC_*`.
- [ ] `get_advisors` se ejecutó y sus avisos quedaron anotados como riesgos conocidos.
- [ ] Las filas de prueba de `rooms` se borraron antes de publicar.
- [ ] El repo está importado en Vercel y el despliegue de producción de `master` está en estado Ready.
- [ ] Production y Preview tienen `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] En la URL de producción, `GET /api/health` responde `200` con `{"ok":true}`.
- [ ] En producción cargan `/`, `/games`, `/juego/viuda`, `/juego/viuda/jugar`, `/acceso` y `/salon` sin errores 404/500 ni errores nuevos en consola.
- [ ] Asteroids y Tetris guardan su puntuación en `scores` desde la URL de producción y la puntuación aparece en el ranking.
- [ ] Viuda VS CPU se juega completa en producción.
- [ ] Viuda en línea en producción, con 2 navegadores o perfiles distintos: crear sala, aparecer en la lista de salas abiertas, unirse por código y por la lista, iniciar y jugar una ronda hasta el duelo; cada jugador ve solo su mano.
- [ ] En producción, la desconexión de un jugador se marca como «desconectado», el reenganche funciona en pausa y cerrar al anfitrión cierra la sala con el aviso «El anfitrión se desconectó».
- [ ] La pestaña de red no muestra errores de WebSocket/Realtime ni CORS durante una partida en línea.
- [ ] Un push de una rama distinta de `master` genera un preview en el que `/api/health` responde `{"ok":true}`.
- [ ] `CLAUDE.md` y `README.md` documentan el despliegue con la URL de producción.

---

## Decisiones tomadas y descartadas

- **Sí:** integración Git de Vercel con GitHub (producción desde `master`, preview por rama/PR). Cero secretos de despliegue en GitHub y es el flujo por defecto de Vercel.
- **No:** Vercel CLI manual ni GitHub Actions. El primero no despliega solo; el segundo añade tokens y mantenimiento sin beneficio en un MVP sin tests.
- **Sí:** solo `*.vercel.app` por ahora. **No:** dominio propio; se aborda en un spec aparte cuando exista.
- **Sí:** un único proyecto Supabase compartido entre Production y Preview (decisión del usuario). **No:** branch o proyecto Supabase para previews: aíslan los datos pero exigen migraciones, variables y flujo extra. Consecuencia aceptada: salas y puntuaciones de previews se mezclan con las reales.
- **Sí:** solo auditar y documentar la seguridad (decisión del usuario). **No:** endurecer RLS ni canales aquí; auth real, RLS por usuario y servidor autoritativo van en un spec propio, como ya dejó dicho SPEC 08.
- **Sí:** dejar de versionar `.playwright-mcp/` y añadirlo a `.gitignore`; son logs locales de pruebas, no código.
- **Sí:** sin `vercel.json`, preset automático de Next.js. Se añade solo si la verificación lo exige.
- **Sí:** las variables `NEXT_PUBLIC_*` se cargan en el panel de Vercel; **no** se sube `.env.local` ni `SUPABASE_DB_PASSWORD`.
- **Sí:** verificación manual en producción con varios navegadores, igual que SPEC 08 (el proyecto no tiene framework de tests).
- **Sí:** no tocar código de juegos en este spec; los bugs que aparezcan solo en producción se corrigen en el mínimo cambio necesario o en un spec propio.
- **Nota:** `.env.example` contiene hoy los valores reales de URL y publishable key (SPEC 03 los preveía vacíos). Al ser claves públicas por diseño, no es una fuga y no se cambia aquí.

---

## Riesgos identificados

| Riesgo                                                                                    | Mitigación                                                                                                                             |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| El build de producción falla por tipos o lint que `next dev` toleraba                     | Paso 1 antes de conectar Vercel; corregir en local                                                                                     |
| Variables ausentes o mal escritas en Vercel (los clientes lanzan error explícito)         | Cargarlas antes del primer despliegue; comprobar `/api/health`; redeploy tras cualquier cambio de `NEXT_PUBLIC_*`                      |
| Viuda en línea funciona en local pero falla en producción (Realtime, canales, StrictMode) | Pasos 2 y 6 con build de producción y dos navegadores distintos; revisar consola y red                                                 |
| Límites del plan de Realtime (conexiones y mensajes) con la app pública                   | Consultar límites con `search_docs` antes de publicar; el juego difunde solo en cambios de estado; documentar el límite en `CLAUDE.md` |
| RLS abierta con la app pública permite falsear `scores` o abusar de `rooms`               | Riesgo asumido por el usuario; `get_advisors` lo registra; se resuelve en un spec de seguridad                                         |
| Cualquiera con la URL puede llenar `rooms` o `scores` de basura                           | Mismo riesgo asumido; limpieza manual de filas; la lista de salas ya filtra por latido de 60 s                                         |
| Previews con datos mezclados con producción                                               | Aceptado por el usuario; no usar previews para pruebas que ensucien `scores`                                                           |
| Secretos en el historial de git                                                           | Paso 4 revisa archivos y historial reciente; si apareciera alguno, rotarlo antes de publicar                                           |
| El anfitrión en una pestaña en segundo plano o móvil pierde temporizadores y latidos      | Ya mitigado en SPEC 08 con marcas de tiempo; verificar en el paso 6 con un móvil real si es posible                                    |
| `proxy.ts` añade latencia o falla en el runtime de Vercel                                 | Verificar rutas y sesión en el despliegue; leer la guía de `proxy` de Next 16 antes del paso 5                                         |

---

## Qué **no** está en este spec

- Dominio propio y DNS.
- Proyecto o branch de Supabase aislado para previews.
- Auth real, RLS por usuario, canales privados y servidor autoritativo.
- GitHub Actions, CI y tests automatizados.
- Analítica, monitoreo de errores y alertas.
- Limpieza programada de `rooms`.
- Cambios de funcionalidad o diseño en los juegos.

Cada uno de estos puntos, si se aborda, va en su propio spec.
