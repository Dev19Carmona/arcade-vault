import { COLOR_CYAN, COLOR_MAGENTA, COLOR_YELLOW } from "./constants";
import { drawText } from "./entities";
import { tableLabels, widowCardRects } from "./online/geometry";
import type { DragTarget } from "./hand-order";
import type { Card, Rect } from "./types";
import { cardLabel } from "./utils";

// Qué haría soltar ahora lo que se arrastra y cómo se enseña. TypeScript puro y
// compartido por VS CPU y la mesa en línea; no ejecuta nada, solo describe y dibuja.

export type DragIntent =
  | {
      kind: "swap1";
      widowIndex: number;
      handVisual: number; // posición visual de la carta propia que se cambia
      label: string;
      targets: Rect[]; // lo que se resalta
    }
  | { kind: "swap5"; label: string; targets: Rect[] }
  | { kind: "blocked"; label: string };

export interface DragIntentInput {
  target: DragTarget | null;
  card: Card; // la carta propia que se arrastra
  handVisual: number; // su posición visual
  widow: readonly (Card | null)[]; // la viuda (null = boca abajo, no se puede nombrar)
  blocked: string | null; // motivo por el que no se puede actuar ahora, si lo hay
  widowOpen: boolean;
}

// Una carta propia arrastrada: solo hay intención cuando está sobre la viuda; en la mano
// se reordena y no se avisa. Cambiar las 5 no se hace con una carta suelta.
export function resolveDragIntent(input: DragIntentInput): DragIntent | null {
  const { target, card, handVisual, widow, blocked, widowOpen } = input;
  if (!target) return null;
  if (target.kind !== "widow-card" && target.kind !== "widow-zone") return null;
  if (blocked) return { kind: "blocked", label: blocked };
  if (target.kind === "widow-card") {
    const other = widow[target.widowIndex];
    return {
      kind: "swap1",
      widowIndex: target.widowIndex,
      handVisual,
      label: `CAMBIAR ${cardLabel(card)} POR ${other ? cardLabel(other) : "?"}`,
      targets: [widowCardRects()[target.widowIndex]],
    };
  }
  return {
    kind: "blocked",
    label: widowOpen ? "SUELTA SOBRE UNA CARTA" : "VIUDA CERRADA",
  };
}

// Resalte del destino y rótulo sobre la viuda.
export function drawDragIntent(
  ctx: CanvasRenderingContext2D,
  intent: DragIntent,
): void {
  const color =
    intent.kind === "swap1"
      ? COLOR_CYAN
      : intent.kind === "swap5"
        ? COLOR_YELLOW
        : COLOR_MAGENTA;

  if (intent.kind !== "blocked") {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    for (const r of intent.targets) {
      ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
    ctx.restore();
  }

  const rects = widowCardRects();
  const first = rects[0];
  const last = rects[rects.length - 1];
  const cx = (first.x + last.x + last.w) / 2;
  const y = tableLabels().widowLabelY;
  const w = intent.label.length * 8.4 + 28;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, y - 12, w, 24, 12);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  drawText(ctx, intent.label, cx, y, { size: 13, bold: true, color });
}
