import {
  BUTTON_Y,
  CARD_GAP,
  CARD_H,
  CARD_W,
  HAND_SIZE,
  COLOR_BLACK_SUIT,
  COLOR_CYAN,
  COLOR_DIM,
  COLOR_GREEN,
  COLOR_INK,
  COLOR_MAGENTA,
  COLOR_YELLOW,
  FONT,
  HAND_Y,
  W,
  WIDOW_CARD_H,
  WIDOW_Y,
} from "../constants";
import {
  buttonRowRects,
  drawButton,
  drawCardBack,
  drawCardPosed,
  drawCardRow,
  drawLives,
  drawTable,
  drawText,
  pointInRect,
  type CardStyle,
} from "../entities";
import {
  drawBadges,
  drawEffects,
  drawFlights,
  drawLastLap,
  drawLastLapBorder,
  drawTurnPulse,
} from "../fx/draw";
import { visualIndices, type HandDrag, type HandOrder } from "../hand-order";
import type { Card, Rect } from "../types";
import { cardLabel, compareDrawCards } from "../utils";
import {
  badgeAnchor,
  onlineSeatCardRects,
  ownCardRects,
  rivalPanel,
  seatPanel,
  widowCardRects,
} from "./geometry";
import type { PrivateHand, PublicSeat, PublicTable } from "./protocol";
import type { TableFx } from "./table-fx";

// La geometría vive en geometry.ts; se reexporta porque el componente la importa de aquí.
export { ownCardRects, widowCardRects };

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
  notice: "running" | "reconnecting" | null; // aviso de mi conexión
  hostAwayLeft: number | null; // segundos hasta el relevo si el anfitrión no responde
  fx: TableFx; // animaciones en curso
  locked: boolean; // hay animación en curso o pendiente: mi turno y CONTINUAR esperan
  order: HandOrder; // orden visual de mi mano (solo local)
  drag: HandDrag; // arrastre de cartas en curso, si lo hay
}

export type OnlineButtonId =
  | "swap5"
  | "swap1"
  | "pass"
  | "call"
  | "continue"
  | "pause"
  | "resume"
  | "eliminate"
  | "rematch"
  | "leave";

export interface OnlineButton {
  id: OnlineButtonId;
  target?: string; // a quién se aplica (ELIMINAR)
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
const PAUSE_RECT: Rect = { x: 8, y: 4, w: 92, h: 22 };

// --- Consultas sobre la mesa ---

function seatOf(table: PublicTable, id: string | null): PublicSeat | undefined {
  return id === null ? undefined : table.seats.find((s) => s.playerId === id);
}

function nameOf(table: PublicTable, id: string | null): string {
  return seatOf(table, id)?.name ?? "?";
}

// `locked` (si se conoce) cuenta: durante una animación aún no se puede jugar.
export function isMyTurn(
  view: Pick<OnlineView, "table" | "playerId"> & { locked?: boolean },
): boolean {
  return (
    view.table.phase === "turn" &&
    !view.locked &&
    !view.table.paused &&
    view.table.turnPlayerId === view.playerId &&
    seatOf(view.table, view.playerId)?.connected !== false
  );
}

// Panel de un rival en la mesa, visto desde `playerId`.
function seatRect(
  table: PublicTable,
  playerId: string,
  id: string,
): Rect | null {
  const count = table.seats.length;
  const localIndex = table.seats.findIndex((s) => s.playerId === playerId);
  const index = table.seats.findIndex((s) => s.playerId === id);
  if (localIndex < 0 || index < 0 || index === localIndex) return null;
  return rivalPanel(count, localIndex, index);
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
  if (table.paused) return "Partida en pausa.";
  if (me && !me.connected) {
    return "Estás desconectado. La partida sigue en curso; espera a que el anfitrión la pause.";
  }
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
    !view.locked &&
    !table.paused &&
    (table.phase === "draw" || table.phase === "showdown")
  ) {
    main.push({
      id: "continue",
      label: "CONTINUAR",
      color: COLOR_YELLOW,
      disabled: false,
    });
  }

  if (view.isHost && table.phase === "final") {
    main.push({
      id: "rematch",
      label: "REVANCHA",
      color: COLOR_YELLOW,
      disabled: false,
    });
  }

  const rects = buttonRowRects(main.length, BUTTON_Y);
  const extra: OnlineButton[] = [];

  // Controles del anfitrión: pausa con la partida en marcha y ELIMINAR a los desconectados.
  const inProgress =
    table.phase === "draw" ||
    table.phase === "turn" ||
    table.phase === "showdown";
  if (view.isHost && inProgress) {
    extra.push({
      id: table.paused ? "resume" : "pause",
      label: table.paused ? "REANUDAR" : "PAUSAR",
      color: table.paused ? COLOR_GREEN : COLOR_YELLOW,
      disabled: false,
      rect: PAUSE_RECT,
    });
  }
  if (view.isHost && inProgress) {
    for (const seat of table.seats) {
      if (seat.connected || !seat.alive) continue;
      const r = seatRect(table, view.playerId, seat.playerId);
      if (!r) continue;
      extra.push({
        id: "eliminate",
        target: seat.playerId,
        label: "ELIMINAR",
        color: COLOR_MAGENTA,
        disabled: false,
        rect: { x: r.x + r.w / 2 - 38, y: r.y + 44, w: 76, h: 20 },
      });
    }
  }

  return [
    ...main.map((b, i) => ({ ...b, rect: rects[i] })),
    ...extra,
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
  state: {
    active: boolean;
    loser: boolean;
    showCards: boolean;
    showFaces: boolean; // las manos abiertas se ven de cara (en el duelo, tras la animación)
    showResult: boolean; // jugada o mano del duelo (en el duelo, tras el volteo)
    lives: number; // vidas que se dibujan: la que se pierde en el duelo sigue hasta que se rompe
    hiddenSlots: ReadonlySet<number>; // cartas en vuelo: no se dibujan quietas
  },
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
  drawLives(ctx, state.lives, cx, r.y + 30, 13);

  const faceUp = seat.hand !== null && state.showFaces;
  const count = faceUp
    ? seat.hand!.length
    : state.showCards
      ? seat.handCount
      : 0;
  if (count > 0) {
    const rects = onlineSeatCardRects(r, count, faceUp);
    const styles = rects.map((_, i) => ({
      hidden: state.hiddenSlots.has(i),
    }));
    if (faceUp) drawCardRow(ctx, seat.hand!, rects, styles);
    else
      rects.forEach((rect, i) => {
        if (!styles[i].hidden) drawCardBack(ctx, rect);
      });
  }

  const caption = !seat.alive
    ? "ELIMINADO"
    : !seat.connected
      ? "DESCONECTADO"
      : state.showResult
        ? (seat.lastAction ?? "")
        : "";
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

// Atenúa la mesa y pone un mensaje en el centro.
function drawVeil(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  color: string,
) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, W, 600);
  ctx.restore();
  drawBannerBox(
    ctx,
    lines.filter((line, i) => i < 2 || line !== ""),
    color,
  );
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

  return null;
}

function drawButtons(ctx: CanvasRenderingContext2D, view: OnlineView) {
  for (const b of onlineButtons(view)) {
    const hover = pointInRect(view.pointer.x, view.pointer.y, b.rect);
    if (
      b.id === "leave" ||
      b.id === "pause" ||
      b.id === "resume" ||
      b.id === "eliminate"
    ) {
      drawSmallButton(ctx, b, hover);
    } else {
      drawButton(ctx, b.rect, b.label, {
        color: b.color,
        disabled: b.disabled,
        hover,
      });
    }
  }
}

// Clasificación con posiciones de competición: los empatados comparten número y el
// siguiente se salta (1º, 2º, 2º, 4º).
export function standings(
  table: PublicTable,
): { position: number; seat: PublicSeat }[] {
  const groups = table.rankingGroups ?? (table.ranking ?? []).map((id) => [id]);
  const rows: { position: number; seat: PublicSeat }[] = [];
  let position = 1;
  for (const group of groups) {
    for (const id of group) {
      const seat = seatOf(table, id);
      if (seat) rows.push({ position, seat });
    }
    position += group.length;
  }
  return rows;
}

const ROW_H = 26;

// Pantalla final: ganador y clasificación sobre el tapete.
function drawFinalScreen(ctx: CanvasRenderingContext2D, view: OnlineView) {
  const { table, playerId } = view;
  const rows = standings(table);
  const winners = rows.filter((r) => r.position === 1);
  const iWon = winners.some((r) => r.seat.playerId === playerId);

  drawText(ctx, "FIN DE LA PARTIDA", W / 2, 52, {
    size: 24,
    bold: true,
    color: iWon ? COLOR_GREEN : COLOR_YELLOW,
  });
  const headline =
    winners.length === 0
      ? "Sin ganador"
      : winners.length > 1
        ? "Empate en el primer puesto"
        : iWon
          ? "¡Has ganado la Viuda!"
          : `Gana ${winners[0].seat.name}`;
  drawText(ctx, fitText(ctx, headline, W - 80, 16), W / 2, 84, {
    size: 16,
    color: COLOR_INK,
  });

  // Lista de posiciones.
  const box: Rect = { x: 220, y: 112, w: 360, h: 20 + rows.length * ROW_H };
  panel(ctx, box, "rgba(0,0,0,0.4)", "rgba(255,255,255,0.18)", 1);
  rows.forEach(({ position, seat }, i) => {
    const y = box.y + 10 + i * ROW_H + ROW_H / 2;
    const mine = seat.playerId === playerId;
    if (position === 1) {
      panel(
        ctx,
        { x: box.x + 6, y: y - ROW_H / 2 + 1, w: box.w - 12, h: ROW_H - 2 },
        "rgba(245,255,0,0.08)",
        COLOR_YELLOW,
        1,
      );
    }
    drawText(ctx, `${position}º`, box.x + 22, y, {
      size: 14,
      bold: true,
      align: "left",
      color: position === 1 ? COLOR_YELLOW : COLOR_DIM,
    });
    drawText(ctx, fitText(ctx, seat.name, 210, 14, mine), box.x + 64, y, {
      size: 14,
      bold: mine,
      align: "left",
      color: mine ? COLOR_CYAN : COLOR_INK,
    });
    if (mine) {
      drawText(ctx, "TÚ", box.x + box.w - 20, y, {
        size: 11,
        bold: true,
        align: "right",
        color: COLOR_CYAN,
      });
    }
  });
  drawText(
    ctx,
    "Orden de eliminación: quienes cayeron en el mismo duelo empatan.",
    W / 2,
    box.y + box.h + 22,
    { size: 11, color: COLOR_DIM },
  );
  drawText(
    ctx,
    view.isHost
      ? "REVANCHA vuelve a la sala de espera con los jugadores presentes."
      : "Esperando a que el anfitrión proponga la revancha.",
    W / 2,
    BUTTON_Y - 24,
    { size: 13, color: COLOR_CYAN },
  );
}

export function drawOnlineTable(
  ctx: CanvasRenderingContext2D,
  view: OnlineView,
): void {
  const { table, hand, playerId, fx } = view;
  const tl = fx.tl;
  const count = table.seats.length;
  const localIndex = Math.max(
    0,
    table.seats.findIndex((s) => s.playerId === playerId),
  );
  const me = table.seats[localIndex];
  // Le toca a mi jugador según la mesa, aunque aún se esté animando la jugada anterior.
  const myTurn = isMyTurn({ table, playerId });
  const phase = table.phase;
  // Se espera a mi mano nueva para animar: mientras, no se enseña la mesa ya cambiada.
  const waiting = fx.waiting();
  // En el duelo, las manos se voltean con la animación y el resultado llega después.
  const dueling = phase === "showdown" && view.locked;
  const heartStarted = (i: number) =>
    tl.effects.some((e) => e.seat === i && tl.now >= e.start);
  const revealed = !dueling || tl.effects.some((e) => tl.now >= e.start);
  // La vida que se pierde en el duelo sigue entera hasta que se rompe el corazón.
  const livesShown = (i: number) => {
    const seat = table.seats[i];
    const pending =
      dueling && view.losers.has(seat.playerId) && !heartStarted(i);
    return seat.lives + (pending ? 1 : 0);
  };

  drawTable(ctx);

  if (phase === "final") {
    drawFinalScreen(ctx, view);
    drawButtons(ctx, view);
    return;
  }

  // Rivales, en orden de turno a partir de mí.
  table.seats.forEach((seat, i) => {
    if (i === localIndex) return;
    drawOnlineSeat(ctx, rivalPanel(count, localIndex, i), seat, {
      active: phase === "turn" && table.turnPlayerId === seat.playerId,
      loser: phase === "showdown" && revealed && view.losers.has(seat.playerId),
      showCards: phase !== "draw",
      showFaces: !dueling,
      showResult: revealed,
      lives: livesShown(i),
      hiddenSlots: new Set(
        Array.from({ length: HAND_SIZE }, (_, k) => k).filter((k) =>
          tl.hidden.has(`seat:${i}:${k}`),
        ),
      ),
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
        hidden: tl.hidden.has(`widow:${i}`) || waiting,
      })),
    );
  }

  // Mi mano.
  const taken = hand?.taken?.map((c) => `${c.rank}:${c.suit}`) ?? [];
  if (phase === "draw") {
    const card = me?.hand?.[0];
    if (card) {
      drawCardRow(ctx, [card], ownCardRects(1), [
        { hidden: tl.hidden.has("own:0") },
      ]);
    }
  } else if (me?.alive) {
    // La mano se dibuja en el orden visual (el que eligió el jugador); la selección guarda
    // el índice de las reglas, así que acompaña a la carta aunque se mueva.
    const indices = hand ? visualIndices(view.order, hand.hand) : null;
    const cards: (Card | null)[] =
      hand && indices
        ? indices.map((k) => hand.hand[k])
        : Array.from({ length: me?.handCount ?? 0 }, () => null);
    // La carta arrastrada flota sobre la fila y las vecinas se apartan para dejarle hueco.
    const floating = view.drag.floating();
    const offsets = view.drag.offsets();
    const slotStep = CARD_W + CARD_GAP;
    const rects = ownCardRects(cards.length).map((r, v) => ({
      ...r,
      x: r.x + (offsets[v] ?? 0) * slotStep,
    }));
    const styles: CardStyle[] = cards.map((card, v) => ({
      selected: view.selOwn !== null && indices?.[v] === view.selOwn,
      hidden: tl.hidden.has(`own:${v}`) || waiting || floating?.slot === v,
      highlight:
        phase === "showdown" && revealed && view.losers.has(playerId)
          ? COLOR_MAGENTA
          : card &&
              phase === "turn" &&
              taken.includes(`${card.rank}:${card.suit}`)
            ? COLOR_CYAN
            : undefined,
    }));
    drawCardRow(ctx, cards, rects, styles);
    const lifted = floating ? cards[floating.slot] : null;
    if (floating && lifted) {
      drawCardPosed(
        ctx,
        lifted,
        { w: CARD_W, h: CARD_H },
        {
          x: floating.x,
          y: floating.y,
          rot: 0,
          scale: floating.scale,
          flip: 1,
        },
        { highlight: floating.dragging ? COLOR_CYAN : undefined },
      );
    }
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
  drawLives(ctx, me ? livesShown(localIndex) : 0, 70, HAND_Y + 54);
  drawText(ctx, `RONDA ${Math.max(table.round, 1)}`, W - 70, HAND_Y + 30, {
    size: 12,
    color: COLOR_DIM,
  });

  // Animaciones: cartas en vuelo, corazón roto, aro del turno, última vuelta y carteles.
  const veiled =
    view.hostAwayLeft !== null || table.paused || (me && !me.connected);
  drawFlights(ctx, tl);
  drawEffects(ctx, tl);
  if (phase === "turn" && !veiled) {
    const turn = table.seats.findIndex(
      (s) => s.playerId === table.turnPlayerId,
    );
    if (turn >= 0)
      drawTurnPulse(ctx, seatPanel(count, localIndex, turn), tl.now);
    if (table.callerId !== null) {
      drawLastLapBorder(ctx, tl.now);
      drawLastLap(ctx, W / 2, 176, tl.now);
    }
  }
  drawBadges(ctx, tl, (i) => badgeAnchor(count, localIndex, i));

  // Estado y mensajes.
  if (phase === "turn" && !veiled) {
    drawText(
      ctx,
      fitText(ctx, statusLine(table, playerId), BANNER_W, 13),
      W / 2,
      WIDOW_Y + WIDOW_CARD_H + 28,
      { size: 13, color: myTurn ? COLOR_YELLOW : COLOR_CYAN },
    );
  }
  const banner = dueling ? null : bannerFor(view);
  if (banner) drawBannerBox(ctx, banner.lines, banner.color);

  // Pausa o desconexión: velo sobre la mesa; los botones se dibujan encima.
  if (view.hostAwayLeft !== null) {
    const m = Math.floor(view.hostAwayLeft / 60);
    const sec = String(view.hostAwayLeft % 60).padStart(2, "0");
    drawVeil(
      ctx,
      [
        "ANFITRIÓN SIN CONEXIÓN",
        `Esperando a que vuelva · ${m}:${sec}`,
        "Si no vuelve, otro jugador será el anfitrión.",
      ],
      COLOR_MAGENTA,
    );
  } else if (table.paused) {
    drawVeil(
      ctx,
      [
        "PARTIDA EN PAUSA",
        view.isHost
          ? "Los desconectados pueden volver a su asiento."
          : "El anfitrión ha pausado la partida.",
        view.isHost ? "Al reanudar, quien siga fuera queda eliminado." : "",
      ],
      COLOR_YELLOW,
    );
  } else if (me && !me.connected) {
    drawVeil(
      ctx,
      [
        "ESTÁS DESCONECTADO",
        view.notice === "reconnecting"
          ? "Reconectando con la sala…"
          : "La partida sigue en curso;",
        view.notice === "reconnecting"
          ? ""
          : "espera a que el anfitrión la pause.",
      ],
      COLOR_MAGENTA,
    );
  }

  drawButtons(ctx, view);
}
