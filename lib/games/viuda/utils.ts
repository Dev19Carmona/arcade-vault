import {
  HAND_SIZE,
  RANK_LABELS,
  RANKS,
  SUIT_POWER,
  SUIT_SYMBOLS,
  SUITS,
  WIN_POINTS_PER_LIFE,
  WIN_POINTS_PER_RIVAL,
} from "./constants";
import type { Card, HandCategory, HandValue } from "./types";

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

// Fisher-Yates sobre una copia. El azar lo inyecta el motor.
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

// Sorteo inicial: gana el rango más alto; en empate, la pinta (♦ > ♥ > ♠ > ♣).
// Positivo si `a` supera a `b`.
export function compareDrawCards(a: Card, b: Card): number {
  return a.rank - b.rank || SUIT_POWER[a.suit] - SUIT_POWER[b.suit];
}

// Mano de póker de 5 cartas. El as vale alto, o bajo en A-2-3-4-5.
export function evaluateHand(cards: readonly Card[]): HandValue {
  if (cards.length !== HAND_SIZE) {
    throw new Error(`Una mano necesita ${HAND_SIZE} cartas`);
  }

  const counts = new Map<number, number>();
  for (const { rank } of cards) counts.set(rank, (counts.get(rank) ?? 0) + 1);

  // Grupos por repeticiones y luego por rango, ambos de mayor a menor.
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const tiebreak = groups.map(([rank]) => rank);
  const shape = groups.map(([, count]) => count).join("");

  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const sorted = [...counts.keys()].sort((a, b) => b - a);
  const isWheel = sorted.join() === "14,5,4,3,2";
  const isStraight =
    sorted.length === HAND_SIZE && (sorted[0] - sorted[4] === 4 || isWheel);
  // En la rueda el as cuenta como 1: la carta más alta es el 5.
  const straightTiebreak = isWheel ? [5, 4, 3, 2, 1] : sorted;

  let category: HandCategory;
  let ranks = tiebreak;
  if (isStraight && isFlush) {
    category = 8;
    ranks = straightTiebreak;
  } else if (shape === "41") category = 7;
  else if (shape === "32") category = 6;
  else if (isFlush) category = 5;
  else if (isStraight) {
    category = 4;
    ranks = straightTiebreak;
  } else if (shape === "311") category = 3;
  else if (shape === "221") category = 2;
  else if (shape === "2111") category = 1;
  else category = 0;

  // Terna, full house y póker se deciden por rango (no hay dos iguales con 52 cartas).
  // En el resto desempata la pinta de la carta determinante: la mayor del rango que
  // encabeza el desempate (la carta alta, el par, el par superior o la que corona la escalera).
  const decidedByRank = category === 3 || category === 6 || category === 7;
  const suitBreak = decidedByRank
    ? 0
    : Math.max(
        ...cards
          .filter((c) => c.rank === ranks[0])
          .map((c) => SUIT_POWER[c.suit]),
      );

  return { category, tiebreak: ranks, suitBreak };
}

// Positivo si `a` supera a `b`. Solo devuelve 0 para la misma mano: la pinta es el último desempate.
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < a.tiebreak.length; i++) {
    const diff = a.tiebreak[i] - b.tiebreak[i];
    if (diff !== 0) return diff;
  }
  return a.suitBreak - b.suitBreak;
}

// Puntos de la partida: solo cuenta ganar; perder vale 0.
export function finalScore(
  won: boolean,
  rivals: number,
  livesLeft: number,
): number {
  return won
    ? WIN_POINTS_PER_RIVAL * rivals + WIN_POINTS_PER_LIFE * livesLeft
    : 0;
}
