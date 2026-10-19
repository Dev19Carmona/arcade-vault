# Contrato motor / canvas / registro

Fuente de verdad actual: `lib/games/asteroids/` y `components/games/asteroids-canvas.tsx`. Este documento generaliza ese patrón.

## Estructura por juego

```
lib/games/<id>/
  types.ts       // snapshot del juego, opciones y interfaz del motor
  constants.ts   // W, H y valores del original, sin cambiarlos
  utils.ts       // helpers puros
  entities.ts    // clases/funciones con update(dt) y draw(ctx)
  engine.ts      // create<Id>Engine({ onChange, onGameOver })
components/games/<id>-canvas.tsx   // "use client"
```

## Contrato genérico (`lib/games/types.ts`)

```ts
export interface GameSnapshot {
  score: number;
  lives?: number; // el HUD oculta "Vidas" si es undefined
  level?: number; // el HUD oculta "Nivel" si es undefined
  stats?: { label: string; value: string }[]; // extras, p. ej. LÍNEAS
}

export interface GameCanvasProps {
  paused: boolean;
  runId: number; // cambiarlo reinicia la partida
  onChange: (snapshot: GameSnapshot) => void;
  onGameOver: (finalScore: number) => void;
}
```

El motor de cada juego puede tener un snapshot interno más rico (como `AsteroidsSnapshot`); el componente canvas lo traduce a `GameSnapshot` antes de llamar a `onChange`.

## Motor

```ts
export interface <Id>Engine {
  update(dt: number): void;            // segundos, acotado a 0.05
  draw(ctx: CanvasRenderingContext2D): void;
  setKeys(held: ReadonlySet<string>): void; // KeyboardEvent.code
  reset(): void;
  getSnapshot(): <Id>Snapshot;
  // opcionales según el juego:
  // pressShoot(): void          pulsación de un solo frame
  // setPointer(x: number, y: number): void   coordenadas LÓGICAS, no de pantalla
  // click(): void
}
```

- Emite `onChange` solo si algún campo cambió (compara con el último snapshot emitido). Redondea valores continuos (temporizadores) para no emitir cada frame.
- `onGameOver(score)` una sola vez por partida; `reset()` rearma la bandera.
- El motor no carga assets. Si usa imágenes, las recibe ya cargadas por parámetro en `create<Id>Engine`.

## Componente canvas

Plantilla: copia `components/games/asteroids-canvas.tsx` y cambia solo lo específico del juego.

- Refs `pausedRef`, `onChangeRef`, `onGameOverRef` actualizadas en un efecto sin dependencias; así el motor no se recrea.
- Un único efecto de montaje que crea motor, listeners (`keydown`, `keyup`, `blur`, `visibilitychange`) y el bucle `requestAnimationFrame`; el `return` los limpia todos.
- `GAME_KEYS` = teclas del juego; `isTextTarget(e.target)` para no interferir con inputs; con pausa no se capturan teclas.
- Con pausa: `lastTime = null` y `held.clear()`; el motor no avanza pero `draw` sigue.
- Efecto aparte sobre `runId` que llama a `engine.reset()` (ignora el valor inicial con una ref).
- `<canvas className="game-canvas" width={W} height={H} aria-label="<Título>" />`. Si el juego usa ratón, convierte `clientX/clientY` a lógicas con `getBoundingClientRect()` y `W / rect.width`.
- Exporta el componente con tipo `ComponentType<GameCanvasProps>`.

## Registro (`components/games/registry.ts`)

```ts
import type { ComponentType } from "react";
import { AsteroidsCanvas } from "@/components/games/asteroids-canvas";
import type { GameCanvasProps } from "@/lib/games/types";

// id del juego en la tabla `games` -> canvas real. Sin entrada = simulación.
export const GAME_CANVASES: Record<string, ComponentType<GameCanvasProps>> = {
  asteroids: AsteroidsCanvas,
};
```

Cada juego nuevo agrega una línea. `GamePlayer` es un client component, así que el import directo funciona; usa `next/dynamic` solo si un juego es pesado (comprueba la API en la doc de Next 16 antes).

## Bootstrap (solo la primera vez)

Estado actual: `GamePlayer` tiene `ASTEROIDS_ID`, `isAsteroids`, `AsteroidsSnapshot` y la rama `AsteroidsCanvas` escritos a mano. Migrar a:

1. Crear `lib/games/types.ts` con `GameSnapshot` y `GameCanvasProps`.
2. Adaptar `AsteroidsCanvas` para que su `onChange` reciba un `GameSnapshot` (`{ score, lives, level }`), derivándolo del `AsteroidsSnapshot` del motor.
3. Crear `components/games/registry.ts`.
4. En `GamePlayer`:
   - `const Canvas = GAME_CANVASES[gameId]` en lugar de `isAsteroids`.
   - `const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)`.
   - `score = Canvas ? (snapshot?.score ?? 0) : simScore`.
   - HUD: "Vidas" y "Nivel" solo si el juego los reporta (para la simulación, mantener el comportamiento actual de 3 vidas y nivel derivado del puntaje); renderizar `snapshot.stats` como `hud-stat` extra.
   - El `useEffect` de simulación se salta si hay `Canvas`; `restart()` sigue incrementando `runId` y limpiando `snapshot`.
5. Verificar: `/juego/asteroids/jugar` se comporta exactamente igual que antes; `npm run lint` y `npm run build` limpios.

## Escalado

`.game-canvas` en `app/globals.css` escala el canvas dentro de `.crt-screen` (4:3). Para otras proporciones (p. ej. Tetris 300×600) revisa ese CSS y cambia solo lo necesario sin romper Asteroids; documenta el ajuste en la spec.
