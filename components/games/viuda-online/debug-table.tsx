"use client";

import { useState } from "react";
import type {
  OnlineAction,
  PrivateHand,
  PublicTable,
} from "@/lib/games/viuda/online/protocol";
import type { Card } from "@/lib/games/viuda/types";
import { cardLabel } from "@/lib/games/viuda/utils";

// PROVISIONAL (Paso 7): vista de texto para jugar y comprobar el protocolo con dos
// pestañas. El Paso 8 la sustituye por la mesa en canvas.
export function DebugTable({
  table,
  hand,
  playerId,
  isHost,
  onAction,
  onContinue,
  onLeave,
}: {
  table: PublicTable;
  hand: PrivateHand | null;
  playerId: string;
  isHost: boolean;
  onAction: (action: OnlineAction) => void;
  onContinue: () => void;
  onLeave: () => void;
}) {
  const [selOwn, setSelOwn] = useState<number | null>(null);
  const [selWidow, setSelWidow] = useState<number | null>(null);
  const myTurn = table.phase === "turn" && table.turnPlayerId === playerId;
  const labelOf = (c: Card | null) => (c ? cardLabel(c) : "??");

  function act(action: OnlineAction) {
    onAction(action);
    setSelOwn(null);
    setSelWidow(null);
  }

  return (
    <div className="vd-screen">
      <div className="vd-lobby" data-testid="debug-table">
        <p className="vd-hint" data-testid="phase">
          Ronda {table.round} · fase {table.phase} · turno{" "}
          {table.seats.find((s) => s.playerId === table.turnPlayerId)?.name ??
            "-"}
          {table.autoAdvanceIn !== null &&
            ` · avanza en ${table.autoAdvanceIn}s`}
        </p>
        <ul className="vd-hint">
          {table.seats.map((s) => (
            <li key={s.playerId} data-seat={s.name}>
              {s.name}
              {s.playerId === playerId && " (tú)"} · vidas {s.lives}
              {!s.alive && " · eliminado"} · cartas {s.handCount}
              {s.lastAction && ` · ${s.lastAction}`}
              {s.hand && ` · mano visible: ${s.hand.map(labelOf).join(" ")}`}
            </li>
          ))}
        </ul>
        <p className="vd-hint" data-testid="widow">
          Viuda ({table.widowOpen ? "abierta" : "cerrada"}):{" "}
          {table.widow.length === 0
            ? "—"
            : table.widow.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn ghost"
                  disabled={!myTurn || !table.widowOpen}
                  onClick={() => setSelWidow(selWidow === i ? null : i)}
                >
                  {selWidow === i ? `[${labelOf(c)}]` : labelOf(c)}
                </button>
              ))}
        </p>
        <p className="vd-hint" data-testid="hand">
          Tu mano:{" "}
          {hand === null || hand.hand.length === 0
            ? "—"
            : hand.hand.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn ghost"
                  disabled={!myTurn || !table.widowOpen}
                  onClick={() => setSelOwn(selOwn === i ? null : i)}
                >
                  {selOwn === i ? `[${labelOf(c)}]` : labelOf(c)}
                </button>
              ))}
          {hand?.taken && ` · tomaste: ${hand.taken.map(labelOf).join(" ")}`}
        </p>
        <div className="vd-join">
          {myTurn && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => act({ type: "pass" })}
              >
                PASO
              </button>
              {table.callerId === null && (
                <button
                  type="button"
                  className="btn magenta"
                  onClick={() => act({ type: "call" })}
                >
                  LLAMO
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => act({ type: "swap5" })}
              >
                CAMBIAR 5
              </button>
              <button
                type="button"
                className="btn"
                disabled={selOwn === null || selWidow === null}
                onClick={() =>
                  selOwn !== null &&
                  selWidow !== null &&
                  act({
                    type: "swap1",
                    handIndex: selOwn,
                    widowIndex: selWidow,
                  })
                }
              >
                CAMBIAR 1
              </button>
            </>
          )}
          {isHost && (table.phase === "draw" || table.phase === "showdown") && (
            <button type="button" className="btn yellow" onClick={onContinue}>
              CONTINUAR
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onLeave}>
            SALIR
          </button>
        </div>
        {table.phase === "final" && (
          <p className="vd-hint" data-testid="ranking">
            Fin. Clasificación:{" "}
            {table.ranking
              ?.map((id) => table.seats.find((s) => s.playerId === id)?.name)
              .join(" > ")}
          </p>
        )}
      </div>
    </div>
  );
}
