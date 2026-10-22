// Catálogo de efectos de sonido de Viuda. TypeScript puro; los archivos viven en
// public/sounds/viuda/ (origen y licencia en LICENSE.md).

export type SfxId =
  | "flip" // carta alta inicial (sorteo)
  | "deal" // reparto de la ronda
  | "swap1" // CAMBIAR 1
  | "swap5" // CAMBIAR 5
  | "pass" // PASO
  | "call" // LLAMO
  | "roundLose" // fin de ronda: pierdo la vida
  | "roundWin" // fin de ronda: la pierde otro
  | "sort"; // soltar una carta en otra posición de mi mano

export const SFX_FILES: Record<SfxId, string> = {
  flip: "/sounds/viuda/flip.ogg",
  deal: "/sounds/viuda/deal.ogg",
  swap1: "/sounds/viuda/swap1.ogg",
  swap5: "/sounds/viuda/swap5.ogg",
  pass: "/sounds/viuda/pass.ogg",
  call: "/sounds/viuda/call.ogg",
  roundLose: "/sounds/viuda/round-lose.ogg",
  roundWin: "/sounds/viuda/round-win.ogg",
  sort: "/sounds/viuda/sort.ogg",
};

// Ganancia fija común a todos los sonidos.
export const SFX_GAIN = 0.6;
