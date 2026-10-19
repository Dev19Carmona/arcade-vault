import type { ComponentType } from "react";
import { AsteroidsCanvas } from "@/components/games/asteroids-canvas";
import { TetrisCanvas } from "@/components/games/tetris-canvas";
import type { GameCanvasProps } from "@/lib/games/types";

// id del juego en la tabla `games` -> canvas real. Sin entrada = simulación.
export const GAME_CANVASES: Record<string, ComponentType<GameCanvasProps>> = {
  asteroids: AsteroidsCanvas,
  tetris: TetrisCanvas,
};
