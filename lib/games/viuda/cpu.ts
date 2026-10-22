import { HAND_SIZE } from "./constants";
import type { OnlineAction } from "./online/protocol";
import type { RulesState } from "./rules";
import type { Card } from "./types";
import { evaluateHand } from "./utils";

// IA de las CPU: TypeScript puro, sin window/document ni reloj. Decide la acción del
// asiento al que le toca; quien la llama la aplica y gestiona el tiempo de pensar.

// Valor continuo de una mano para decidir de las CPU: categoría + carta principal.
export function handScore(cards: readonly Card[]): number {
  const { category, tiebreak } = evaluateHand(cards);
  return category + tiebreak[0] / 20;
}

// Mejor cambio de una carta con la viuda abierta: devuelve la mejora de valor.
function bestSingleSwap(hand: readonly Card[], widow: readonly Card[]) {
  const base = handScore(hand);
  let best = { gain: 0, own: 0, wid: 0 };
  for (let i = 0; i < HAND_SIZE; i++) {
    for (let j = 0; j < HAND_SIZE; j++) {
      const trial = hand.map((c, k) => (k === i ? widow[j] : c));
      const gain = handScore(trial) - base;
      if (gain > best.gain) best = { gain, own: i, wid: j };
    }
  }
  return best;
}

// Acción de la CPU a la que le toca (`state.current`).
export function chooseCpuAction(
  state: RulesState,
  random: () => number,
): OnlineAction {
  const seatCount = state.seats.length;
  const hand = state.seats[state.current].hand;
  const value = handScore(hand);
  const others = state.seats.filter((s) => s.alive).length;
  // Con menos rivales vivos se llama con menos; un poco de ruido para no ser predecible.
  // Cada vuelta sin llamadas baja el umbral, así que tarde o temprano alguien llama.
  const threshold =
    2.1 -
    (seatCount - others) * 0.25 -
    (state.lap - 1) * 0.2 +
    (random() - 0.5) * 0.4;

  if (state.caller === null && value >= threshold) return { type: "call" };
  if (!state.widowOpen) {
    // Viuda boca abajo: no se conoce; con mano débil se arriesga a tomarla entera.
    if (value < 1.1 && random() < 0.75) return { type: "swap5" };
    return { type: "pass" };
  }
  // Viuda abierta: se pueden cambiar las 5 o una carta, solo si mejora la mano.
  const swap = bestSingleSwap(hand, state.widow);
  const gainAll = handScore(state.widow) - value;
  if (gainAll > 0.3 && gainAll > swap.gain) return { type: "swap5" };
  if (swap.gain > 0.15) {
    return { type: "swap1", handIndex: swap.own, widowIndex: swap.wid };
  }
  return { type: "pass" };
}
