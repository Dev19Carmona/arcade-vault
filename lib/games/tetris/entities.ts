import { COLORS } from "./constants";
import type { Shape } from "./types";

// (px, py) es la esquina superior izquierda de la celda, en píxeles lógicos.
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  colorIndex: number,
  size: number,
  alpha = 1,
): void {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  if (!color) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(px + 1, py + 1, size - 2, 4);
  ctx.globalAlpha = 1;
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  originX: number,
  originY: number,
  size: number,
  alpha = 1,
): void {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(
        ctx,
        originX + c * size,
        originY + r * size,
        shape[r][c],
        size,
        alpha,
      );
}
