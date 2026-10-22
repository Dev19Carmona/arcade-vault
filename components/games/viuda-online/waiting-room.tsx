"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_PLAYERS,
  MIN_HUMANS,
  MIN_PLAYERS,
} from "@/lib/games/viuda/constants";
import type { PublicTable } from "@/lib/games/viuda/online/protocol";
import { HostAwayNotice } from "./host-away-notice";

const COPIED_MS = 1500;

export function WaitingRoom({
  code,
  table,
  playerId,
  isHost,
  hostAwayUntil,
  starting,
  onStart,
  onAddCpu,
  onFillCpus,
  onRemoveCpu,
  onLeave,
}: {
  code: string;
  table: PublicTable;
  playerId: string;
  isHost: boolean;
  hostAwayUntil: number | null; // el anfitrión no responde: hora (ms) del relevo
  starting: boolean;
  onStart: () => void;
  onAddCpu: () => void; // solo el anfitrión
  onFillCpus: () => void;
  onRemoveCpu: (playerId: string) => void;
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
  const humans = table.seats.filter((seat) => !seat.cpu).length;
  const canStart =
    isHost &&
    humans >= MIN_HUMANS &&
    count >= MIN_PLAYERS &&
    count <= MAX_PLAYERS &&
    !starting;

  return (
    <div className="vd-screen">
      <div className="vd-lobby">
        <header className="vd-head">
          <h2 className="vd-title neon-cyan">SALA DE ESPERA</h2>
          <button type="button" className="btn ghost" onClick={onLeave}>
            SALIR
          </button>
        </header>

        {hostAwayUntil !== null && <HostAwayNotice until={hostAwayUntil} />}

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
                  {humans < MIN_HUMANS
                    ? `Faltan jugadores: se necesitan al menos ${MIN_HUMANS} personas. Las CPU solo rellenan puestos.`
                    : "Cuando empiece la partida nadie más podrá entrar. Si pierdes la conexión, la sala te espera 2 minutos antes de pasar a otro anfitrión."}
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
              {isHost && (
                <button
                  type="button"
                  className="btn vd-fill"
                  onClick={onFillCpus}
                  disabled={count >= MAX_PLAYERS}
                >
                  RELLENAR PUESTOS
                </button>
              )}
            </div>
            <ol className="vd-slots">
              {Array.from({ length: MAX_PLAYERS }, (_, i) => {
                const seat = table.seats[i];
                if (!seat) {
                  if (isHost) {
                    return (
                      <li key={i} className="vd-slot empty open">
                        <button
                          type="button"
                          className="vd-add"
                          onClick={onAddCpu}
                          aria-label={`Añadir una CPU en el puesto ${i + 1}`}
                        >
                          <span className="n">{i + 1}</span>
                          <span className="who">+ CPU</span>
                        </button>
                      </li>
                    );
                  }
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
                    {seat.cpu && <span className="tag cpu">CPU</span>}
                    {seat.playerId === table.hostId && (
                      <span className="tag">anfitrión</span>
                    )}
                    {seat.playerId === playerId && (
                      <span className="tag me">tú</span>
                    )}
                    {seat.cpu && isHost && (
                      <button
                        type="button"
                        className="vd-slot-x"
                        onClick={() => onRemoveCpu(seat.playerId)}
                        aria-label={`Quitar a ${seat.name}`}
                      >
                        ✕
                      </button>
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
