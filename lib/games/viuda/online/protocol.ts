// Acciones que un jugador puede pedir en su turno. Las usa el núcleo de reglas
// y, en el modo en línea, viajan del cliente al anfitrión.
export type OnlineAction =
  | { type: "pass" }
  | { type: "call" }
  | { type: "swap5" }
  | { type: "swap1"; handIndex: number; widowIndex: number };
