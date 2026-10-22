import type { ComponentType } from "react";
import { AsteroidsCanvas } from "@/components/games/asteroids-canvas";
import { TetrisCanvas } from "@/components/games/tetris-canvas";
import { ViudaGame } from "@/components/games/viuda-game";
import type { GameCanvasProps } from "@/lib/games/types";

// id del juego en la tabla `games` -> canvas real. Sin entrada = simulación.
export const GAME_CANVASES: Record<string, ComponentType<GameCanvasProps>> = {
  asteroids: AsteroidsCanvas,
  tetris: TetrisCanvas,
  viuda: ViudaGame,
};

// Juegos con efectos de sonido: la plataforma les muestra el botón de silenciar.
export const SOUND_GAMES: ReadonlySet<string> = new Set(["viuda"]);
