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
  LAYOUT_MODE,
  LIVES,
  RANK_LABELS,
  SUIT_SYMBOLS,
  W,
} from "./constants";
import type { Pose } from "./fx/timeline";
import type { Card, Rect } from "./types";

export interface CardStyle {
  selected?: boolean; // levantada y con borde
  highlight?: string; // color del borde (p. ej. la mano ganadora)
  dim?: boolean; // atenuada
  hidden?: boolean; // no se dibuja: su carta está en vuelo
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
  hiddenSlots?: ReadonlySet<number>; // cartas que no se dibujan quietas: están en vuelo
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

// Botones centrados: en una fila, o de dos en dos (la última fila centrada) en el lienzo vertical.
export function buttonRowRects(count: number, y: number): Rect[] {
  if (LAYOUT_MODE === "landscape") {
    return cardRowRects(count, W / 2, y, BUTTON_W, BUTTON_H, BUTTON_GAP);
  }
  const rows = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / 2);
    const inRow = row === rows - 1 ? count - row * 2 : 2;
    const total = inRow * BUTTON_W + (inRow - 1) * BUTTON_GAP;
    return {
      x: (W - total) / 2 + (i - row * 2) * (BUTTON_W + BUTTON_GAP),
      y: y + row * (BUTTON_H + BUTTON_GAP),
      w: BUTTON_W,
      h: BUTTON_H,
    };
  });
}

// Tapete: fieltro con un óvalo de mesa y su borde acolchado. Sin tramas de líneas, para que
// las cartas se lean limpias.
export function drawTable(ctx: CanvasRenderingContext2D): void {
  const cx = W / 2;
  const cy = H * 0.47;
  const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.75);
  g.addColorStop(0, COLOR_FELT);
  g.addColorStop(1, COLOR_FELT_DARK);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.47, H * 0.42, 0, 0, Math.PI * 2);
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

// Cuánto sube una carta seleccionada: proporcional a su alto, para que se note igual en todos los tamaños.
export function liftOf(r: Rect): number {
  return r.h * 0.12;
}

export function drawCard(
  ctx: CanvasRenderingContext2D,
  card: Card,
  r: Rect,
  style: CardStyle = {},
): void {
  const y = style.selected ? r.y - liftOf(r) : r.y;
  const box = { ...r, y };
  const red = card.suit === 1 || card.suit === 2;
  const ink = red ? COLOR_RED_SUIT : COLOR_BLACK_SUIT;
  // Las cartas grandes llevan la esquina opuesta; las pequeñas (abanicos de rivales) solo una.
  const big = r.w >= 56;
  const pad = Math.max(3, r.w * 0.09);
  const rankPx = Math.max(10, Math.round(r.w * (big ? 0.3 : 0.38)));
  const suitPx = Math.max(9, Math.round(r.w * (big ? 0.24 : 0.3)));

  ctx.save();
  if (style.dim) ctx.globalAlpha = 0.55;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = Math.max(6, r.w * 0.12);
  ctx.shadowOffsetY = Math.max(2, r.w * 0.04);
  roundRect(ctx, box, Math.max(5, r.w * 0.09));
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
  const drawCorner = () => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = pad + rankPx * (card.rank === 10 ? 0.55 : 0.32);
    ctx.font = `bold ${rankPx}px ${FONT}`;
    ctx.fillText(RANK_LABELS[card.rank], cx, pad + rankPx * 0.5);
    ctx.font = `${suitPx}px ${FONT}`;
    ctx.fillText(SUIT_SYMBOLS[card.suit], cx, pad + rankPx + suitPx * 0.45);
  };
  ctx.save();
  ctx.translate(box.x, box.y);
  drawCorner();
  if (big) {
    ctx.translate(box.w, box.h);
    ctx.rotate(Math.PI);
    drawCorner();
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(r.w * (big ? 0.5 : 0.52))}px ${FONT}`;
  ctx.fillText(
    SUIT_SYMBOLS[card.suit],
    box.x + r.w / 2 + (big ? 0 : r.w * 0.06),
    box.y + r.h * (big ? 0.52 : 0.64),
  );
  ctx.restore();
}

export function drawCardBack(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  style: CardStyle = {},
): void {
  const box = { ...r, y: style.selected ? r.y - liftOf(r) : r.y };
  ctx.save();
  if (style.dim) ctx.globalAlpha = 0.55;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = Math.max(5, r.w * 0.1);
  ctx.shadowOffsetY = 2;
  roundRect(ctx, box, Math.max(5, r.w * 0.09));
  ctx.fillStyle = "#1a1a3a";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = style.highlight ?? COLOR_MAGENTA;
  ctx.stroke();

  // Trama interior en rombos.
  const inset = Math.max(3, r.w * 0.07);
  const inner = {
    x: box.x + inset,
    y: box.y + inset,
    w: box.w - 2 * inset,
    h: box.h - 2 * inset,
  };
  roundRect(ctx, inner, 3);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,245,255,0.35)";
  ctx.lineWidth = 1;
  const step = Math.max(7, r.w * 0.12);
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
    if (styles[i]?.hidden) return;
    if (card) drawCard(ctx, card, rects[i], styles[i]);
    else drawCardBack(ctx, rects[i], styles[i]);
  });
}

// Pose de una carta quieta en `r`: centrada en el rectángulo, sin giro y a escala 1.
export function poseOf(r: Rect, flip = 1): Pose {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, rot: 0, scale: 1, flip };
}

// Dibuja una carta con pose (posición del centro, giro, escala y volteo) para las
// animaciones. `size` es el tamaño sin escalar; `card` null se queda siempre de dorso.
export function drawCardPosed(
  ctx: CanvasRenderingContext2D,
  card: Card | null,
  size: { w: number; h: number },
  pose: Pose,
  style: CardStyle = {},
): void {
  // El volteo estrecha la carta hasta una línea a mitad de giro y la abre por el otro lado.
  const squeeze = card === null ? 1 : Math.abs(pose.flip * 2 - 1);
  const rect = { x: -size.w / 2, y: -size.h / 2, w: size.w, h: size.h };

  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  ctx.scale(pose.scale * Math.max(squeeze, 0.02), pose.scale);
  if (card && pose.flip >= 0.5) drawCard(ctx, card, rect, style);
  else drawCardBack(ctx, rect, style);
  ctx.restore();
}

// Centro del corazón `index` de una fila de vidas centrada en `cx`.
export function lifeHeartPos(
  index: number,
  cx: number,
  y: number,
  size = 14,
): { x: number; y: number } {
  const gap = size + 4;
  return { x: cx - ((LIVES - 1) * gap) / 2 + index * gap, y };
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
  for (let i = 0; i < LIVES; i++) {
    ctx.fillStyle = i < lives ? COLOR_MAGENTA : "rgba(255,255,255,0.18)";
    const p = lifeHeartPos(i, cx, y, size);
    ctx.fillText("♥", p.x, p.y);
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
    maxWidth?: number; // si no cabe, el texto se comprime en vez de salirse
  } = {},
): void {
  ctx.save();
  ctx.font = `${opts.bold ? "bold " : ""}${opts.size ?? 14}px ${FONT}`;
  ctx.fillStyle = opts.color ?? COLOR_INK;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "middle";
  if (opts.maxWidth) ctx.fillText(text, x, y, opts.maxWidth);
  else ctx.fillText(text, x, y);
  ctx.restore();
}

// Tamaño de las cartas de un panel de rival: lo que quepa en su alto y en su ancho,
// con las cartas abiertas solapadas en abanico.
export function seatCardSize(panel: Rect): { w: number; h: number } {
  const hCap = Math.min(Math.max(panel.h - 62, 32), 60);
  const w = Math.min((panel.w - 8) / 3.2, hCap * 0.7);
  return { w, h: w / 0.7 };
}

// Cartas de un panel de rival: dorsos solapados, o abiertas (más separadas) en el duelo y el sorteo.
export function seatCardRects(r: Rect, count: number, faceUp: boolean): Rect[] {
  const { w, h } = seatCardSize(r);
  const step = w * (faceUp ? 0.55 : 0.4);
  const free = r.h - 62 - h;
  return cardRowRects(
    count,
    r.x + r.w / 2,
    r.y + 44 + Math.max(0, free / 2),
    w,
    h,
    step - w,
  );
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
  roundRect(ctx, r, 10);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
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
  drawLives(ctx, seat.lives, cx, r.y + SEAT_LIVES_Y, 14);

  const count = seat.hand ? seat.hand.length : seat.cardCount;
  if (count > 0) {
    const rects = seatCardRects(r, count, !!seat.hand);
    const styles = rects.map((_, i) => ({
      hidden: seat.hiddenSlots?.has(i),
    }));
    if (seat.hand) drawCardRow(ctx, seat.hand, rects, styles);
    else
      rects.forEach((rect, i) => {
        if (!styles[i].hidden) drawCardBack(ctx, rect);
      });
  }

  const caption = seat.eliminated ? "ELIMINADO" : (seat.caption ?? "");
  if (caption) {
    drawText(ctx, caption, cx, r.y + r.h - 12, {
      size: 11,
      color: seat.eliminated ? COLOR_DIM : COLOR_CYAN,
    });
  }
  ctx.restore();
}

// Altura de la fila de vidas dentro del panel de un rival (el nombre va en y + 14).
export const SEAT_LIVES_Y = 32;

export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  style: ButtonStyle = {},
): void {
  const color = style.color ?? COLOR_YELLOW;
  ctx.save();
  if (style.disabled) ctx.globalAlpha = 0.35;
  roundRect(ctx, r, 8);
  ctx.fillStyle = style.hover && !style.disabled ? color : "rgba(0,0,0,0.55)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  drawText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, {
    size: LAYOUT_MODE === "portrait" ? 15 : 14,
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
  x = 0, // margen lateral: en apaisado deja libres los paneles de los lados
): void {
  const h = 18 + lines.length * 22;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(x, y - h / 2, W - 2 * x, h);
  lines.forEach((line, i) => {
    drawText(ctx, line, W / 2, y - h / 2 + 19 + i * 22, {
      size: i === 0 ? (LAYOUT_MODE === "portrait" ? 15 : 18) : 13,
      bold: i === 0,
      color: i === 0 ? color : COLOR_INK,
    });
  });
  ctx.restore();
}
