import {
  BUTTON_Y,
  CARD_GAP,
  CARD_H,
  CARD_W,
  COLOR_BLACK_SUIT,
  COLOR_CYAN,
  COLOR_DIM,
  COLOR_GREEN,
  COLOR_INK,
  COLOR_MAGENTA,
  COLOR_YELLOW,
  FONT,
  HAND_SIZE,
  HAND_Y,
  W,
  WIDOW_CARD_H,
  WIDOW_CARD_W,
  WIDOW_GAP,
  WIDOW_Y,
} from "../constants";
import {
  buttonRowRects,
  cardRowRects,
  drawButton,
  drawCardBack,
  drawCardRow,
  drawLives,
  drawTable,
  drawText,
  pointInRect,
  type CardStyle,
} from "../entities";
import type { Card, Rect } from "../types";
import { cardLabel, compareDrawCards } from "../utils";
import { opponentRects, relativeSeat } from "./layout";
import type { PrivateHand, PublicSeat, PublicTable } from "./protocol";

// Dibujo y botones de la mesa en línea. TypeScript puro: recibe el contexto 2D por
// parámetro y no toca window ni document, igual que el motor de VS CPU.

export interface OnlineView {
  table: PublicTable;
  hand: PrivateHand | null; // mi mano privada
  playerId: string; // yo
  isHost: boolean;
  losers: ReadonlySet<string>; // quién pierde vida en el duelo
  selOwn: number | null;
  selWidow: number | null;
  pointer: { x: number; y: number }; // coordenadas lógicas
  secondsLeft: number | null; // cuenta atrás hasta que avanza solo el sorteo o el duelo
}

export type OnlineButtonId =
  "swap5" | "swap1" | "pass" | "call" | "continue" | "leave";

export interface OnlineButton {
  id: OnlineButtonId;
  label: string;
  color: string;
  disabled: boolean;
  rect: Rect;
}

// El banner ocupa el hueco entre los paneles laterales para no taparlos.
const BANNER_X = 184;
const BANNER_W = W - 2 * BANNER_X;
const BANNER_Y = 360;
const LEAVE_RECT: Rect = { x: W - 100, y: 4, w: 92, h: 22 };

// --- Geometría compartida con el clic ---

export function ownCardRects(count = HAND_SIZE): Rect[] {
  return cardRowRects(count, W / 2, HAND_Y, CARD_W, CARD_H, CARD_GAP);
}

export function widowCardRects(): Rect[] {
  return cardRowRects(
    HAND_SIZE,
    W / 2,
    WIDOW_Y,
    WIDOW_CARD_W,
    WIDOW_CARD_H,
    WIDOW_GAP,
  );
}

// --- Consultas sobre la mesa ---

function seatOf(table: PublicTable, id: string | null): PublicSeat | undefined {
  return id === null ? undefined : table.seats.find((s) => s.playerId === id);
}

function nameOf(table: PublicTable, id: string | null): string {
  return seatOf(table, id)?.name ?? "?";
}

export function isMyTurn(
  view: Pick<OnlineView, "table" | "playerId">,
): boolean {
  return (
    view.table.phase === "turn" && view.table.turnPlayerId === view.playerId
  );
}

// Gana el sorteo la carta más alta entre los jugadores vivos.
function drawStarter(table: PublicTable): PublicSeat | undefined {
  let best: PublicSeat | undefined;
  for (const seat of table.seats) {
    const card = seat.hand?.[0];
    const bestCard = best?.hand?.[0];
    if (!seat.alive || !card) continue;
    if (!bestCard || compareDrawCards(card, bestCard) > 0) best = seat;
  }
  return best;
}

// Texto de estado: se dibuja bajo la viuda y se lee en voz alta como región viva.
export function statusLine(table: PublicTable, playerId: string): string {
  const me = seatOf(table, playerId);
  if (table.phase === "final") return "Fin de la partida.";
  if (table.phase === "draw") return "Sorteo inicial.";
  if (table.phase === "showdown") return "Duelo: se enseñan las manos.";
  if (me && !me.alive) {
    return `Estás eliminado · mirando la partida · turno de ${nameOf(table, table.turnPlayerId)}`;
  }
  const lastLap = table.callerId !== null;
  if (table.turnPlayerId === playerId) {
    if (lastLap) {
      return `${nameOf(table, table.callerId)} llamó · última vuelta`;
    }
    return table.widowOpen
      ? "TU TURNO · cambia 5, o 1 tuya por 1 de la viuda"
      : "TU TURNO · viuda cerrada: cambia 5, pasa o llama";
  }
  return `Turno de ${nameOf(table, table.turnPlayerId)}${lastLap ? " (última vuelta)" : ""}`;
}

// --- Botones ---

export function onlineButtons(view: OnlineView): OnlineButton[] {
  const { table } = view;
  const main: Omit<OnlineButton, "rect">[] = [];

  if (isMyTurn(view)) {
    main.push({
      id: "swap5",
      label: "CAMBIAR 5 [C]",
      color: COLOR_CYAN,
      disabled: false,
    });
    if (table.widowOpen) {
      main.push({
        id: "swap1",
        label: "CAMBIAR 1 [X]",
        color: COLOR_CYAN,
        disabled: view.selOwn === null || view.selWidow === null,
      });
    }
    main.push({
      id: "pass",
      label: "PASO [P]",
      color: COLOR_YELLOW,
      disabled: false,
    });
    // Tras un "llamo" la última vuelta es solo para cambiar o pasar.
    if (table.callerId === null) {
      main.push({
        id: "call",
        label: "LLAMO [L]",
        color: COLOR_MAGENTA,
        disabled: false,
      });
    }
  } else if (
    view.isHost &&
    (table.phase === "draw" || table.phase === "showdown")
  ) {
    main.push({
      id: "continue",
      label: "CONTINUAR",
      color: COLOR_YELLOW,
      disabled: false,
    });
  }

  const rects = buttonRowRects(main.length, BUTTON_Y);
  return [
    ...main.map((b, i) => ({ ...b, rect: rects[i] })),
    {
      id: "leave",
      label: "SALIR",
      color: COLOR_DIM,
      disabled: false,
      rect: LEAVE_RECT,
    },
  ];
}

// --- Dibujo ---

// Recorta con «…» para que el texto quepa en `maxWidth`.
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  bold = false,
): string {
  ctx.save();
  ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
  let out = text;
  if (ctx.measureText(out).width > maxWidth) {
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    out = `${out}…`;
  }
  ctx.restore();
  return out;
}

function panel(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill: string,
  stroke: string,
  lineWidth: number,
) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

// Panel de un rival. Las medidas salen del alto del panel, que es menor con 7 u 8 rivales.
function drawOnlineSeat(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  seat: PublicSeat,
  state: { active: boolean; loser: boolean; showCards: boolean },
) {
  const cx = r.x + r.w / 2;
  ctx.save();
  if (!seat.alive) ctx.globalAlpha = 0.4;
  panel(
    ctx,
    r,
    "rgba(0,0,0,0.35)",
    state.loser
      ? COLOR_MAGENTA
      : state.active
        ? COLOR_YELLOW
        : "rgba(255,255,255,0.18)",
    state.active || state.loser ? 3 : 1,
  );

  drawText(ctx, fitText(ctx, seat.name, r.w - 16, 13, true), cx, r.y + 13, {
    size: 13,
    bold: true,
    color: state.active ? COLOR_YELLOW : COLOR_INK,
  });
  drawLives(ctx, seat.lives, cx, r.y + 30, 13);

  const faceUp = seat.hand !== null;
  const count = faceUp
    ? seat.hand!.length
    : state.showCards
      ? seat.handCount
      : 0;
  if (count > 0) {
    const w = faceUp ? 26 : 22;
    const h = faceUp ? 38 : 32;
    const rects = cardRowRects(count, cx, r.y + 44, w, h, faceUp ? 3 : -8);
    if (faceUp) drawCardRow(ctx, seat.hand!, rects);
    else rects.forEach((rect) => drawCardBack(ctx, rect));
  }

  const caption = !seat.alive
    ? "ELIMINADO"
    : !seat.connected
      ? "DESCONECTADO"
      : (seat.lastAction ?? "");
  if (caption) {
    drawText(ctx, fitText(ctx, caption, r.w - 12, 11), cx, r.y + r.h - 11, {
      size: 11,
      color: !seat.alive
        ? COLOR_DIM
        : !seat.connected
          ? COLOR_MAGENTA
          : COLOR_CYAN,
    });
  }
  ctx.restore();
}

function drawSmallButton(
  ctx: CanvasRenderingContext2D,
  b: OnlineButton,
  hover: boolean,
) {
  ctx.save();
  panel(ctx, b.rect, hover ? b.color : "rgba(0,0,0,0.5)", b.color, 1.5);
  drawText(ctx, b.label, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 1, {
    size: 11,
    bold: true,
    color: hover ? COLOR_BLACK_SUIT : b.color,
  });
  ctx.restore();
}

function drawBannerBox(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  color: string,
) {
  const h = 18 + lines.length * 22;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(BANNER_X, BANNER_Y - h / 2, BANNER_W, h);
  lines.forEach((line, i) => {
    const size = i === 0 ? 18 : 13;
    drawText(
      ctx,
      fitText(ctx, line, BANNER_W - 20, size, i === 0),
      W / 2,
      BANNER_Y - h / 2 + 19 + i * 22,
      { size, bold: i === 0, color: i === 0 ? color : COLOR_INK },
    );
  });
  ctx.restore();
}

// Mensaje central de la fase, derivado de la mesa pública.
function bannerFor(
  view: OnlineView,
): { lines: string[]; color: string } | null {
  const { table, playerId, secondsLeft } = view;
  const me = seatOf(table, playerId);
  const countdown = secondsLeft === null ? "" : `continúa en ${secondsLeft} s`;

  if (table.phase === "draw") {
    const starter = drawStarter(table);
    if (!starter) return null;
    const card = starter.hand?.[0];
    return {
      lines: [
        `SORTEO: EMPIEZA ${starter.playerId === playerId ? "TÚ" : starter.name}`,
        "La carta más alta empieza",
        [`${starter.name} sacó ${card ? cardLabel(card) : "?"}`, countdown]
          .filter(Boolean)
          .join(" · "),
      ],
      color: COLOR_YELLOW,
    };
  }

  if (table.phase === "showdown") {
    const names = table.seats
      .filter((s) => view.losers.has(s.playerId))
      .map((s) => (s.playerId === playerId ? "TÚ" : s.name));
    const calledBy =
      table.callerId === null
        ? "Duelo"
        : table.callerId === playerId
          ? "Tú llamaste"
          : `${nameOf(table, table.callerId)} llamó`;
    const mine = me?.alive ? `Tu mano: ${me.lastAction ?? ""}` : "";
    return {
      lines: [
        names.length > 0
          ? `DUELO · PIERDE UNA VIDA: ${names.join(", ")}`
          : "DUELO",
        calledBy,
        [mine, countdown].filter(Boolean).join(" · "),
      ],
      color: view.losers.has(playerId) ? COLOR_MAGENTA : COLOR_GREEN,
    };
  }

  if (table.phase === "final") {
    const winnerId = table.ranking?.[0] ?? null;
    const won = winnerId === playerId;
    return {
      lines: [
        "FIN DE LA PARTIDA",
        winnerId
          ? `Gana ${won ? "TÚ" : nameOf(table, winnerId)}`
          : "Sin ganador",
      ],
      color: won ? COLOR_GREEN : COLOR_YELLOW,
    };
  }

  return null;
}

export function drawOnlineTable(
  ctx: CanvasRenderingContext2D,
  view: OnlineView,
): void {
  const { table, hand, playerId } = view;
  const count = table.seats.length;
  const localIndex = Math.max(
    0,
    table.seats.findIndex((s) => s.playerId === playerId),
  );
  const me = table.seats[localIndex];
  const myTurn = isMyTurn(view);
  const phase = table.phase;
  const rects = opponentRects(count);

  drawTable(ctx);

  // Rivales, en orden de turno a partir de mí.
  table.seats.forEach((seat, i) => {
    if (i === localIndex) return;
    drawOnlineSeat(ctx, rects[relativeSeat(i, localIndex, count) - 1], seat, {
      active: phase === "turn" && table.turnPlayerId === seat.playerId,
      loser: phase === "showdown" && view.losers.has(seat.playerId),
      showCards: phase !== "draw",
    });
  });

  // La viuda.
  drawText(ctx, "LA VIUDA", W / 2, WIDOW_Y - 30, {
    size: 13,
    bold: true,
    color: COLOR_DIM,
  });
  if (phase !== "draw" && table.widow.length > 0) {
    drawCardRow(
      ctx,
      table.widow,
      widowCardRects(),
      table.widow.map((_, i) => ({
        selected: table.widowOpen && view.selWidow === i,
      })),
    );
  }

  // Mi mano.
  const taken = hand?.taken?.map((c) => `${c.rank}:${c.suit}`) ?? [];
  if (phase === "draw") {
    const card = me?.hand?.[0];
    if (card) drawCardRow(ctx, [card], ownCardRects(1));
  } else if (me?.alive || phase === "final") {
    const cards: (Card | null)[] = hand
      ? hand.hand
      : Array.from({ length: me?.handCount ?? 0 }, () => null);
    const styles: CardStyle[] = cards.map((card, i) => ({
      selected: view.selOwn === i,
      highlight:
        phase === "showdown" && view.losers.has(playerId)
          ? COLOR_MAGENTA
          : card &&
              phase === "turn" &&
              taken.includes(`${card.rank}:${card.suit}`)
            ? COLOR_CYAN
            : undefined,
    }));
    drawCardRow(ctx, cards, ownCardRects(cards.length), styles);
  }
  if (phase === "turn" || phase === "showdown") {
    const label = !me?.alive
      ? "ESPECTADOR"
      : me.lastAction && phase === "turn"
        ? `TÚ · ${me.lastAction}`
        : "TUS CARTAS";
    drawText(ctx, label, W / 2, HAND_Y - 26, { size: 12, color: COLOR_DIM });
  }
  drawText(
    ctx,
    fitText(ctx, me?.name ?? "TÚ", 108, 14, true),
    70,
    HAND_Y + 30,
    { size: 14, bold: true, color: myTurn ? COLOR_YELLOW : undefined },
  );
  drawLives(ctx, me?.lives ?? 0, 70, HAND_Y + 54);
  drawText(ctx, `RONDA ${Math.max(table.round, 1)}`, W - 70, HAND_Y + 30, {
    size: 12,
    color: COLOR_DIM,
  });

  // Estado y mensajes.
  if (phase === "turn") {
    drawText(
      ctx,
      fitText(ctx, statusLine(table, playerId), BANNER_W, 13),
      W / 2,
      WIDOW_Y + WIDOW_CARD_H + 28,
      { size: 13, color: myTurn ? COLOR_YELLOW : COLOR_CYAN },
    );
  }
  const banner = bannerFor(view);
  if (banner) drawBannerBox(ctx, banner.lines, banner.color);

  // Botones.
  for (const b of onlineButtons(view)) {
    const hover = pointInRect(view.pointer.x, view.pointer.y, b.rect);
    if (b.id === "leave") drawSmallButton(ctx, b, hover);
    else {
      drawButton(ctx, b.rect, b.label, {
        color: b.color,
        disabled: b.disabled,
        hover,
      });
    }
  }
}
