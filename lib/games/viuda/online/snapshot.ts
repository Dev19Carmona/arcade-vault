import type { GameSnapshot } from "../../types";
import type { PublicTable } from "./protocol";

// Lo que el HUD de la plataforma muestra en el modo en línea: RONDA, JUGADORES y mis vidas.
// Sin puntuación: las partidas en línea no puntúan. `online` le dice a la plataforma que
// oculte PAUSA y FIN y no guarde nada en `scores`.
export function onlineSnapshot(
  table: PublicTable | null,
  playerId: string,
): GameSnapshot {
  const base: GameSnapshot = { score: 0, online: true };
  if (!table) return base;

  const total = table.seats.length;
  if (table.phase === "waiting") {
    return { ...base, stats: [{ label: "JUGADORES", value: String(total) }] };
  }

  const alive = table.seats.filter((seat) => seat.alive).length;
  const me = table.seats.find((seat) => seat.playerId === playerId);
  return {
    ...base,
    lives: me?.lives,
    stats: [
      { label: "RONDA", value: String(Math.max(table.round, 1)) },
      { label: "JUGADORES", value: `${alive}/${total}` },
    ],
  };
}
