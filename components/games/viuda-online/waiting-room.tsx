"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/games/viuda/constants";
import type { PublicTable } from "@/lib/games/viuda/online/protocol";

const COPIED_MS = 1500;

export function WaitingRoom({
  code,
  table,
  playerId,
  isHost,
  starting,
  onStart,
  onLeave,
}: {
  code: string;
  table: PublicTable;
  playerId: string;
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return; // Sin permiso de portapapeles el código sigue visible para dictarlo.
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  const count = table.seats.length;
  const canStart =
    isHost && count >= MIN_PLAYERS && count <= MAX_PLAYERS && !starting;

  return (
    <div className="vd-screen">
      <div className="vd-lobby">
        <header className="vd-head">
          <h2 className="vd-title neon-cyan">SALA DE ESPERA</h2>
          <button type="button" className="btn ghost" onClick={onLeave}>
            SALIR
          </button>
        </header>

        <div className="vd-cols">
          <section className="vd-panel" aria-label="Código de la sala">
            <div className="vd-field">
              <span className="vd-label">Código de la sala</span>
              <div
                className="vd-tiles"
                role="img"
                aria-label={`Código ${code.split("").join(" ")}`}
              >
                {code.split("").map((char, i) => (
                  <span key={i} className="vd-tile" aria-hidden="true">
                    {char}
                  </span>
                ))}
              </div>
              <p className="vd-hint">
                Compártelo: quien lo escriba en «Unirse» entra a esta mesa.
              </p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => void copyCode()}
            >
              {copied ? "COPIADO" : "COPIAR CÓDIGO"}
            </button>
            <p className="vd-hint" role="status">
              {copied ? "Código copiado al portapapeles." : ""}
            </p>

            {isHost ? (
              <>
                <button
                  type="button"
                  className="btn lg magenta"
                  onClick={onStart}
                  disabled={!canStart}
                  aria-describedby="vd-start-hint"
                >
                  {starting ? "INICIANDO…" : "INICIAR"}
                </button>
                <p id="vd-start-hint" className="vd-hint">
                  {count < MIN_PLAYERS
                    ? `Faltan jugadores: se necesitan al menos ${MIN_PLAYERS}.`
                    : "Cuando empiece la partida nadie más podrá entrar. Mantén esta pestaña abierta: si te desconectas, la sala se cierra."}
                </p>
              </>
            ) : (
              <p className="vd-hint" role="status">
                Esperando a que el anfitrión inicie la partida.
              </p>
            )}
          </section>

          <section className="vd-panel" aria-label="Jugadores">
            <div className="vd-panel-head">
              <h3>
                Jugadores {count} de {MAX_PLAYERS}
              </h3>
            </div>
            <ol className="vd-slots">
              {Array.from({ length: MAX_PLAYERS }, (_, i) => {
                const seat = table.seats[i];
                if (!seat) {
                  return (
                    <li key={i} className="vd-slot empty">
                      <span className="n">{i + 1}</span>
                      <span className="who">Libre</span>
                    </li>
                  );
                }
                return (
                  <li key={seat.playerId} className="vd-slot">
                    <span className="n">{i + 1}</span>
                    <span className="who">{seat.name}</span>
                    {seat.playerId === table.hostId && (
                      <span className="tag">anfitrión</span>
                    )}
                    {seat.playerId === playerId && (
                      <span className="tag me">tú</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="vd-hint">
              El orden de la lista es el orden de turno.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
