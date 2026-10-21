import {
  HAND_NAMES,
  HAND_SIZE,
  LIVES,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "./constants";
import type { OnlineAction } from "./online/protocol";
import type { Card } from "./types";
import {
  compareDrawCards,
  compareHands,
  createDeck,
  evaluateHand,
  shuffle,
} from "./utils";

// Núcleo de reglas de Viuda: TypeScript puro, sin window/document, sin CPU ni dibujo.
// Cada función devuelve un estado nuevo y no modifica el que recibe.

export type Phase = "draw" | "turn" | "showdown" | "final";

export interface RulesSeat {
  id: string;
  lives: number;
  alive: boolean;
  hand: Card[];
  drawCard: Card | null; // carta del sorteo inicial
  caption: string; // última acción o, en el duelo, el nombre de la mano
  loser: boolean;
}

export interface RulesState {
  seats: RulesSeat[]; // en orden de turno (sentido horario)
  widow: Card[];
  widowOpen: boolean;
  phase: Phase;
  round: number;
  starter: number; // quien empezó la ronda
  current: number; // asiento con el turno
  nextStarter: number; // quien empieza la ronda siguiente (fijado en el duelo)
  lap: number;
  actionsInLap: number;
  caller: number | null;
  finalTurnsLeft: number; // turnos que faltan tras un "llamo" para volver a quien llamó
  eliminations: string[][]; // ids por orden de eliminación; los del mismo duelo van juntos
  endWhenEliminated: string | null; // la partida termina si este jugador cae (VS CPU)
}

export interface RulesOptions {
  endWhenEliminated?: string;
}

// `error` es null si la operación se aplicó; si no, `state` es el estado sin cambios.
export interface RulesResult {
  state: RulesState;
  error: string | null;
}

type Rng = () => number;

function ok(state: RulesState): RulesResult {
  return { state, error: null };
}

function fail(state: RulesState, error: string): RulesResult {
  return { state, error };
}

function cloneState(state: RulesState): RulesState {
  return {
    ...state,
    seats: state.seats.map((seat) => ({ ...seat, hand: [...seat.hand] })),
    widow: [...state.widow],
    eliminations: state.eliminations.map((group) => [...group]),
  };
}

function aliveSeats(state: RulesState): number[] {
  return state.seats.flatMap((seat, i) => (seat.alive ? [i] : []));
}

// Siguiente asiento vivo en sentido horario.
function nextAlive(state: RulesState, from: number): number {
  const count = state.seats.length;
  for (let step = 1; step <= count; step++) {
    const i = (from + step) % count;
    if (state.seats[i].alive) return i;
  }
  return from;
}

function prevAlive(state: RulesState, from: number): number {
  const count = state.seats.length;
  for (let step = 1; step <= count; step++) {
    const i = (from - step + count) % count;
    if (state.seats[i].alive) return i;
  }
  return from;
}

// El sorteo lo gana la carta más alta entre los vivos.
function pickStarter(state: RulesState): number {
  let best = -1;
  state.seats.forEach((seat, i) => {
    if (!seat.alive || !seat.drawCard) return;
    if (
      best < 0 ||
      compareDrawCards(seat.drawCard, state.seats[best].drawCard as Card) > 0
    )
      best = i;
  });
  return best;
}

function shouldEnd(state: RulesState): boolean {
  if (aliveSeats(state).length <= 1) return true;
  const watched = state.endWhenEliminated;
  return (
    watched !== null && state.seats.some((s) => s.id === watched && !s.alive)
  );
}

// --- Transiciones internas (mutan el borrador) ---

function startRound(draft: RulesState, first: number, rng: Rng): void {
  draft.round++;
  const deck = shuffle(createDeck(), rng);
  let k = 0;
  for (const seat of draft.seats) {
    seat.drawCard = null;
    seat.caption = "";
    seat.loser = false;
    seat.hand = seat.alive ? deck.slice(k, (k += HAND_SIZE)) : [];
  }
  draft.widow = deck.slice(k, k + HAND_SIZE);
  draft.widowOpen = false;
  draft.caller = null;
  draft.finalTurnsLeft = 0;
  draft.lap = 1;
  draft.actionsInLap = 0;
  draft.starter = first;
  draft.current = first;
  draft.phase = "turn";
}

function startShowdown(draft: RulesState): void {
  const alive = aliveSeats(draft);
  const values = new Map(
    alive.map((i) => [i, evaluateHand(draft.seats[i].hand)]),
  );
  let worst = alive[0];
  for (const i of alive) {
    if (compareHands(values.get(i)!, values.get(worst)!) < 0) worst = i;
  }
  const losers = alive.filter(
    (i) => compareHands(values.get(i)!, values.get(worst)!) === 0,
  );
  for (const i of alive) {
    const seat = draft.seats[i];
    seat.caption = HAND_NAMES[values.get(i)!.category];
    seat.loser = losers.includes(i);
    if (seat.loser) seat.lives--;
  }

  // Empieza la siguiente ronda quien perdió vida (el primero en orden desde el actual).
  const count = draft.seats.length;
  let first = draft.starter;
  for (let step = 0; step < count; step++) {
    const i = (draft.starter + step) % count;
    if (losers.includes(i)) {
      first = i;
      break;
    }
  }
  draft.nextStarter = first;
  draft.phase = "showdown";
}

function resolveShowdown(draft: RulesState, rng: Rng): void {
  const fallen = draft.seats.filter((seat) => seat.alive && seat.lives <= 0);
  for (const seat of fallen) seat.alive = false;
  if (fallen.length > 0) draft.eliminations.push(fallen.map((seat) => seat.id));

  if (shouldEnd(draft)) {
    draft.phase = "final";
    return;
  }
  const first = draft.seats[draft.nextStarter].alive
    ? draft.nextStarter
    : nextAlive(draft, draft.nextStarter);
  startRound(draft, first, rng);
}

// La vuelta se completó sin llamadas: la viuda se abre y las vueltas siguen hasta que alguien llame.
function closeLap(draft: RulesState): void {
  draft.lap++;
  draft.actionsInLap = 0;
  draft.widowOpen = true;
  for (const seat of draft.seats) seat.caption = "";
}

function endTurn(draft: RulesState): void {
  if (draft.caller !== null) {
    // Última vuelta tras la llamada: al regresar a quien llamó, se muestran las manos.
    draft.finalTurnsLeft--;
    if (draft.finalTurnsLeft <= 0) {
      startShowdown(draft);
      return;
    }
  } else {
    draft.actionsInLap++;
    if (draft.actionsInLap >= aliveSeats(draft).length) closeLap(draft);
  }
  draft.current = nextAlive(draft, draft.current);
}

// --- API pública ---

export function createGame(
  playerIds: readonly string[],
  rng: Rng,
  options: RulesOptions = {},
): RulesState {
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new RangeError(
      `Viuda admite entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Los ids de jugador deben ser únicos");
  }

  const state: RulesState = {
    seats: playerIds.map((id) => ({
      id,
      lives: LIVES,
      alive: true,
      hand: [],
      drawCard: null,
      caption: "",
      loser: false,
    })),
    widow: [],
    widowOpen: false,
    phase: "draw",
    round: 0,
    starter: 0,
    current: 0,
    nextStarter: 0,
    lap: 1,
    actionsInLap: 0,
    caller: null,
    finalTurnsLeft: 0,
    eliminations: [],
    endWhenEliminated: options.endWhenEliminated ?? null,
  };

  // Sorteo inicial: una carta a cada jugador; la más alta empieza.
  const deck = shuffle(createDeck(), rng);
  state.seats.forEach((seat, i) => {
    seat.drawCard = deck[i];
  });
  state.starter = pickStarter(state);
  state.current = state.starter;
  return state;
}

export function applyAction(
  state: RulesState,
  playerId: string,
  action: OnlineAction,
): RulesResult {
  const index = state.seats.findIndex((seat) => seat.id === playerId);
  if (index < 0) return fail(state, "jugador desconocido");
  if (state.phase !== "turn") return fail(state, "no es momento de jugar");
  if (!state.seats[index].alive) return fail(state, "estás eliminado");
  if (state.current !== index) return fail(state, "no es tu turno");

  if (action.type === "call" && state.caller !== null) {
    return fail(state, "ya hubo una llamada");
  }
  if (action.type === "swap1") {
    if (!state.widowOpen) return fail(state, "la viuda está cerrada");
    const valid = (n: number) => Number.isInteger(n) && n >= 0 && n < HAND_SIZE;
    if (!valid(action.handIndex) || !valid(action.widowIndex)) {
      return fail(state, "carta inválida");
    }
  }

  const draft = cloneState(state);
  const seat = draft.seats[index];
  switch (action.type) {
    case "pass":
      seat.caption = "PASO";
      endTurn(draft);
      break;
    case "call":
      seat.caption = "LLAMO";
      draft.caller = index;
      draft.finalTurnsLeft = aliveSeats(draft).length - 1;
      draft.current = nextAlive(draft, index);
      break;
    case "swap5":
      [seat.hand, draft.widow] = [draft.widow, seat.hand];
      draft.widowOpen = true;
      seat.caption = "CAMBIÓ 5";
      endTurn(draft);
      break;
    case "swap1":
      [seat.hand[action.handIndex], draft.widow[action.widowIndex]] = [
        draft.widow[action.widowIndex],
        seat.hand[action.handIndex],
      ];
      seat.caption = "CAMBIÓ 1";
      endTurn(draft);
      break;
  }
  return ok(draft);
}

// Avanza lo que no depende de un jugador: sorteo → primera ronda, duelo → ronda siguiente o final.
export function advance(
  state: RulesState,
  rng: Rng = Math.random,
): RulesResult {
  if (state.phase !== "draw" && state.phase !== "showdown") {
    return fail(state, "no hay nada que avanzar");
  }
  const draft = cloneState(state);
  if (draft.phase === "draw") startRound(draft, draft.starter, rng);
  else resolveShowdown(draft, rng);
  return ok(draft);
}

// Quita al jugador de la partida (desconexión): pierde todas sus vidas y sale de los turnos.
export function eliminate(state: RulesState, playerId: string): RulesResult {
  const index = state.seats.findIndex((seat) => seat.id === playerId);
  if (index < 0) return fail(state, "jugador desconocido");
  if (state.phase === "final") return fail(state, "la partida ya terminó");
  if (!state.seats[index].alive) return fail(state, "ya está eliminado");

  const draft = cloneState(state);

  if (draft.phase === "turn") {
    if (draft.caller !== null) {
      // Si le tocaba jugar en la última vuelta, ya no hará falta su turno.
      let p = draft.current;
      for (let k = 0; k < draft.finalTurnsLeft; k++) {
        if (p === index) {
          draft.finalTurnsLeft--;
          break;
        }
        p = nextAlive(draft, p);
      }
    } else {
      // Si ya había jugado en esta vuelta, deja de contar para cerrarla.
      let p = draft.current;
      for (let k = 0; k < draft.actionsInLap; k++) {
        p = prevAlive(draft, p);
        if (p === index) {
          draft.actionsInLap--;
          break;
        }
      }
    }
  }

  const wasCurrent = draft.current === index;
  const seat = draft.seats[index];
  seat.alive = false;
  seat.lives = 0;
  seat.loser = false;
  draft.eliminations.push([seat.id]);

  if (draft.phase === "showdown") return ok(draft);

  if (shouldEnd(draft)) {
    draft.phase = "final";
    return ok(draft);
  }

  if (draft.phase === "draw") {
    draft.starter = pickStarter(draft);
    draft.current = draft.starter;
  } else {
    if (wasCurrent) draft.current = nextAlive(draft, index);
    if (draft.caller !== null) {
      if (draft.finalTurnsLeft <= 0) startShowdown(draft);
    } else if (draft.actionsInLap >= aliveSeats(draft).length) {
      closeLap(draft);
    }
  }
  return ok(draft);
}

// Clasificación: primero quien sigue vivo, luego los eliminados del más reciente al más
// antiguo. Los eliminados en el mismo duelo van en el mismo grupo (empatan).
export function getRanking(state: RulesState): string[][] {
  const alive = state.seats.filter((seat) => seat.alive).map((seat) => seat.id);
  const eliminated = [...state.eliminations].reverse();
  return alive.length > 0 ? [alive, ...eliminated] : eliminated;
}
