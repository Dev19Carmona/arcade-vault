import {
  BUTTON_GAP,
  BUTTON_H,
  BUTTON_W,
  COLOR_BLACK_SUIT,
  COLOR_CARD,
  COLOR_CYAN,
  COLOR_DIM,
  COLOR_FELT,
  COLOR_FELT_DARK,
  COLOR_INK,
  COLOR_MAGENTA,
  COLOR_RED_SUIT,
  COLOR_YELLOW,
  FONT,
  H,
  LIVES,
  RANK_LABELS,
  SUIT_SYMBOLS,
  W,
} from "./constants";
import type { Card, Rect } from "./types";

export interface CardStyle {
  selected?: boolean; // levantada y con borde
  highlight?: string; // color del borde (p. ej. la mano ganadora)
  dim?: boolean; // atenuada
}

export interface SeatView {
  name: string;
  lives: number;
  cardCount: number;
  hand?: Card[]; // si viene, se muestra boca arriba (duelo)
  active: boolean; // le toca jugar
  eliminated: boolean;
  loser?: boolean; // pierde vida en el duelo
  caption?: string; // última jugada o resultado del duelo
}

export interface ButtonStyle {
  hover?: boolean;
  disabled?: boolean;
  color?: string;
}

export function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Rectángulos de una fila de `count` cartas centrada en `centerX`; sirve para dibujar y para el clic.
export function cardRowRects(
  count: number,
  centerX: number,
  y: number,
  w: number,
  h: number,
  gap: number,
): Rect[] {
  const total = count * w + (count - 1) * gap;
  const startX = centerX - total / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (w + gap),
    y,
    w,
    h,
  }));
}

// Fila de botones centrada en horizontal.
export function buttonRowRects(count: number, y: number): Rect[] {
  return cardRowRects(count, W / 2, y, BUTTON_W, BUTTON_H, BUTTON_GAP);
}

export function drawTable(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, COLOR_FELT);
  g.addColorStop(1, COLOR_FELT_DARK);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W * 0.42, H * 0.36, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

export function drawCard(
  ctx: CanvasRenderingContext2D,
  card: Card,
  r: Rect,
  style: CardStyle = {},
): void {
  const y = style.selected ? r.y - 14 : r.y;
  const box = { ...r, y };
  const red = card.suit === 1 || card.suit === 2;
  const ink = red ? COLOR_RED_SUIT : COLOR_BLACK_SUIT;

  ctx.save();
  if (style.dim) ctx.globalAlpha = 0.55;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  roundRect(ctx, box, 6);
  ctx.fillStyle = COLOR_CARD;
  ctx.fill();
  ctx.shadowColor = "transparent";

  const border = style.highlight ?? (style.selected ? COLOR_YELLOW : null);
  if (border) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = border;
    ctx.stroke();
  }

  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `bold ${Math.round(r.w * 0.3)}px ${FONT}`;
  ctx.fillText(RANK_LABELS[card.rank], box.x + 6, box.y + 5);
  ctx.font = `${Math.round(r.w * 0.28)}px ${FONT}`;
  ctx.fillText(SUIT_SYMBOLS[card.suit], box.x + 6, box.y + 5 + r.w * 0.32);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(r.w * 0.62)}px ${FONT}`;
  ctx.fillText(SUIT_SYMBOLS[card.suit], box.x + r.w / 2, box.y + r.h * 0.62);
  ctx.restore();
}

export function drawCardBack(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  style: CardStyle = {},
): void {
  const box = { ...r, y: style.selected ? r.y - 14 : r.y };
  ctx.save();
  if (style.dim) ctx.globalAlpha = 0.55;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, box, 6);
  ctx.fillStyle = "#1a1a3a";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = style.highlight ?? COLOR_MAGENTA;
  ctx.stroke();

  // Trama interior en rombos.
  const inner = { x: box.x + 5, y: box.y + 5, w: box.w - 10, h: box.h - 10 };
  roundRect(ctx, inner, 3);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,245,255,0.35)";
  ctx.lineWidth = 1;
  const step = 10;
  for (let d = -inner.h; d < inner.w + inner.h; d += step) {
    ctx.beginPath();
    ctx.moveTo(inner.x + d, inner.y);
    ctx.lineTo(inner.x + d + inner.h, inner.y + inner.h);
    ctx.moveTo(inner.x + d + inner.h, inner.y);
    ctx.lineTo(inner.x + d, inner.y + inner.h);
    ctx.stroke();
  }
  ctx.restore();
}

// Fila de cartas: `null` se dibuja boca abajo.
export function drawCardRow(
  ctx: CanvasRenderingContext2D,
  cards: readonly (Card | null)[],
  rects: readonly Rect[],
  styles: readonly CardStyle[] = [],
): void {
  cards.forEach((card, i) => {
    if (card) drawCard(ctx, card, rects[i], styles[i]);
    else drawCardBack(ctx, rects[i], styles[i]);
  });
}

export function drawLives(
  ctx: CanvasRenderingContext2D,
  lives: number,
  cx: number,
  y: number,
  size = 14,
): void {
  ctx.save();
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const gap = size + 4;
  const startX = cx - ((LIVES - 1) * gap) / 2;
  for (let i = 0; i < LIVES; i++) {
    ctx.fillStyle = i < lives ? COLOR_MAGENTA : "rgba(255,255,255,0.18)";
    ctx.fillText("♥", startX + i * gap, y);
  }
  ctx.restore();
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    color?: string;
    align?: CanvasTextAlign;
    bold?: boolean;
  } = {},
): void {
  ctx.save();
  ctx.font = `${opts.bold ? "bold " : ""}${opts.size ?? 14}px ${FONT}`;
  ctx.fillStyle = opts.color ?? COLOR_INK;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Panel de una CPU: nombre, vidas, cartas ocultas (o abiertas en el duelo) y última jugada.
export function drawSeat(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  seat: SeatView,
): void {
  const cx = r.x + r.w / 2;
  ctx.save();
  if (seat.eliminated) ctx.globalAlpha = 0.4;
  roundRect(ctx, r, 8);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.lineWidth = seat.active || seat.loser ? 3 : 1;
  ctx.strokeStyle = seat.loser
    ? COLOR_MAGENTA
    : seat.active
      ? COLOR_YELLOW
      : "rgba(255,255,255,0.18)";
  ctx.stroke();

  drawText(ctx, seat.name, cx, r.y + 14, {
    size: 13,
    bold: true,
    color: seat.active ? COLOR_YELLOW : COLOR_INK,
  });
  drawLives(ctx, seat.lives, cx, r.y + 34, 14);

  const w = seat.hand ? 26 : 22;
  const h = seat.hand ? 38 : 32;
  const count = seat.hand ? seat.hand.length : seat.cardCount;
  if (count > 0) {
    const rects = cardRowRects(count, cx, r.y + 50, w, h, seat.hand ? 3 : -8);
    if (seat.hand) drawCardRow(ctx, seat.hand, rects);
    else rects.forEach((rect) => drawCardBack(ctx, rect));
  }

  const caption = seat.eliminated ? "ELIMINADO" : (seat.caption ?? "");
  if (caption) {
    drawText(ctx, caption, cx, r.y + r.h - 14, {
      size: 11,
      color: seat.eliminated ? COLOR_DIM : COLOR_CYAN,
    });
  }
  ctx.restore();
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  style: ButtonStyle = {},
): void {
  const color = style.color ?? COLOR_YELLOW;
  ctx.save();
  if (style.disabled) ctx.globalAlpha = 0.35;
  roundRect(ctx, r, 6);
  ctx.fillStyle = style.hover && !style.disabled ? color : "rgba(0,0,0,0.5)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, {
    size: 14,
    bold: true,
    color: style.hover && !style.disabled ? COLOR_BLACK_SUIT : color,
  });
  ctx.restore();
}

// Franja de mensaje sobre la mesa (sorteo, resultado del duelo, final).
export function drawBanner(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  y: number,
  color: string = COLOR_YELLOW,
): void {
  const h = 18 + lines.length * 22;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, y - h / 2, W, h);
  lines.forEach((line, i) => {
    drawText(ctx, line, W / 2, y - h / 2 + 19 + i * 22, {
      size: i === 0 ? 18 : 13,
      bold: i === 0,
      color: i === 0 ? color : COLOR_INK,
    });
  });
  ctx.restore();
}
