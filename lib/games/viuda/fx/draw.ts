import {
  CARD_H,
  CARD_W,
  COLOR_INK,
  COLOR_MAGENTA,
  COLOR_YELLOW,
  FONT,
} from "../constants";
import { drawCardPosed } from "../entities";
import type { Rect } from "../types";
import {
  easeOutBack,
  easeOutCubic,
  flightPose,
  type Badge,
  type Timeline,
} from "./timeline";

// Cartas en vuelo, encima de las filas quietas. Las filas ocultan sus huecos con
// `timeline.hidden`, así que cada carta se ve una sola vez.
export function drawFlights(
  ctx: CanvasRenderingContext2D,
  timeline: Timeline,
): void {
  for (const flight of timeline.flights) {
    const pose = flightPose(flight, timeline.now);
    if (!pose) continue;
    drawCardPosed(ctx, flight.card, { w: CARD_W, h: CARD_H }, pose, {
      highlight: flight.highlight,
    });
  }
}

// Dónde se dibujan los carteles de un asiento: el cartel de la jugada y la marca persistente.
export interface BadgeAnchor {
  x: number;
  y: number;
  tag: { x: number; y: number };
}

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

function pillPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
}

// Cartel de una jugada: entra, se sostiene y sube desvaneciéndose. El fuerte rebota y lanza un aro.
function drawPill(
  ctx: CanvasRenderingContext2D,
  badge: Badge,
  anchor: BadgeAnchor,
  t: number,
): void {
  const strong = !!badge.strong;
  const enter = clamp01(t / 0.25);
  const leave = clamp01((t - 0.75) / 0.25);
  const scale = strong
    ? 0.4 + 0.6 * easeOutBack(enter)
    : 0.8 + 0.2 * easeOutCubic(enter);
  const alpha = easeOutCubic(enter) * (1 - leave);
  const rise = leave * 10;

  ctx.save();
  ctx.translate(anchor.x, anchor.y - rise);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  ctx.font = `bold ${strong ? 20 : 13}px ${FONT}`;
  const w = ctx.measureText(badge.text).width + (strong ? 36 : 24);
  const h = strong ? 36 : 24;

  if (strong) {
    // Aro que se abre desde el cartel durante la primera mitad.
    const ring = clamp01(t / 0.5);
    ctx.save();
    ctx.globalAlpha = alpha * (1 - ring) * 0.8;
    ctx.strokeStyle = badge.color;
    ctx.lineWidth = 3;
    pillPath(ctx, 0, 0, w + ring * 70, h + ring * 40);
    ctx.stroke();
    ctx.restore();
    ctx.shadowColor = badge.color;
    ctx.shadowBlur = 18;
  }

  pillPath(ctx, 0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.fill();
  ctx.lineWidth = strong ? 3 : 2;
  ctx.strokeStyle = badge.color;
  ctx.stroke();
  ctx.shadowColor = "transparent";

  ctx.fillStyle = strong ? COLOR_INK : badge.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge.text, 0, 1);
  ctx.restore();
}

// Marca persistente (quién llamó): pequeña y siempre visible hasta el duelo.
function drawTag(
  ctx: CanvasRenderingContext2D,
  badge: Badge,
  anchor: BadgeAnchor,
  t: number,
): void {
  const scale = 0.5 + 0.5 * easeOutBack(t);
  ctx.save();
  ctx.translate(anchor.tag.x, anchor.tag.y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = t;
  ctx.font = `bold 10px ${FONT}`;
  const w = ctx.measureText(badge.text).width + 14;
  pillPath(ctx, 0, 0, w, 16);
  ctx.fillStyle = badge.color;
  ctx.fill();
  ctx.fillStyle = "#15151f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge.text, 0, 1);
  ctx.restore();
}

export function drawBadges(
  ctx: CanvasRenderingContext2D,
  timeline: Timeline,
  anchorOf: (seat: number) => BadgeAnchor | null,
): void {
  for (const badge of timeline.badges) {
    const anchor = anchorOf(badge.seat);
    if (!anchor) continue;
    const t = (timeline.now - badge.start) / badge.dur;
    if (t < 0) continue;
    if (badge.sticky) drawTag(ctx, badge, anchor, clamp01(t));
    else if (t < 1) drawPill(ctx, badge, anchor, t);
  }
}

// Corazón que se parte en dos mitades que se separan, giran y caen desvaneciéndose,
// con un destello al romperse. El corazón quieto lo dibuja la fila de vidas.
export function drawEffects(
  ctx: CanvasRenderingContext2D,
  timeline: Timeline,
): void {
  for (const e of timeline.effects) {
    const t = (timeline.now - e.start) / e.dur;
    if (t < 0 || t >= 1) continue;
    const fall = easeOutCubic(t);
    const alpha = 1 - clamp01((t - 0.4) / 0.6);

    ctx.save();
    ctx.font = `${e.size}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Destello inicial.
    const flash = clamp01(t / 0.35);
    ctx.globalAlpha = (1 - flash) * 0.9;
    ctx.strokeStyle = COLOR_MAGENTA;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.size * (0.6 + flash * 1.6), 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = COLOR_MAGENTA;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(e.x + side * fall * 7, e.y + fall * e.size * 1.2);
      ctx.rotate(side * fall * 0.7);
      ctx.beginPath();
      // Cada mitad recorta el corazón por el eje vertical.
      ctx.rect(side < 0 ? -e.size : 0, -e.size, e.size, e.size * 2);
      ctx.clip();
      ctx.fillText("♥", 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}

// Aro con brillo que late alrededor del asiento al que le toca jugar.
export function drawTurnPulse(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  nowMs: number,
): void {
  const p = (Math.sin((nowMs / 1000) * Math.PI * 2 * 1.1) + 1) / 2;
  ctx.save();
  ctx.shadowColor = COLOR_YELLOW;
  ctx.shadowBlur = 6 + 14 * p;
  ctx.strokeStyle = `rgba(245,255,0,${0.35 + 0.5 * p})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.stroke();
  ctx.restore();
}

// Aviso fijo mientras dura la última vuelta tras un «llamo».
export function drawLastLap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  nowMs: number,
): void {
  const p = (Math.sin((nowMs / 1000) * Math.PI * 2 * 0.8) + 1) / 2;
  ctx.save();
  ctx.globalAlpha = 0.65 + 0.35 * p;
  ctx.shadowColor = COLOR_MAGENTA;
  ctx.shadowBlur = 10;
  ctx.fillStyle = COLOR_MAGENTA;
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ÚLTIMA VUELTA", x, y);
  ctx.restore();
}
