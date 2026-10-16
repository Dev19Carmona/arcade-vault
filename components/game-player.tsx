"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AsteroidsCanvas } from "@/components/games/asteroids-canvas";
import { useSession } from "@/components/session-provider";
import type { AsteroidsSnapshot } from "@/lib/games/asteroids/types";
import { ROUTES } from "@/lib/routes";

const LIVES = 3;
const POINTS_PER_LEVEL = 2500;

// Juegos con motor real; el resto sigue con la simulación.
const ASTEROIDS_ID = "rocas";

export function GamePlayer({ gameId, gameTitle }: { gameId: string; gameTitle: string }) {
  const { user, saveScore } = useSession();
  const isAsteroids = gameId === ASTEROIDS_ID;
  const [simScore, setSimScore] = useState(0);
  const [snapshot, setSnapshot] = useState<AsteroidsSnapshot | null>(null);
  const [runId, setRunId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // El nombre sale de la sesión salvo que el jugador lo edite en el modal.
  const name = typedName ?? user?.name ?? "INVITADO";
  const score = isAsteroids ? (snapshot?.score ?? 0) : simScore;
  const lives = isAsteroids ? (snapshot?.lives ?? LIVES) : LIVES;
  const level = isAsteroids ? (snapshot?.level ?? 1) : 1 + Math.floor(score / POINTS_PER_LEVEL);

  // Simulación: no hay juego real, el puntaje sube solo mientras no haya pausa ni fin.
  useEffect(() => {
    if (isAsteroids || over || paused) return;
    const t = setInterval(() => setSimScore((s) => s + Math.floor(10 + Math.random() * 90)), 220);
    return () => clearInterval(t);
  }, [isAsteroids, over, paused]);

  const restart = () => {
    setSimScore(0);
    setRunId((id) => id + 1);
    setPaused(false);
    setOver(false);
    setSaved(false);
  };

  const save = () => {
    saveScore({ game: gameId, score, name });
    setSaved(true);
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v" style={{ color: "var(--ink)" }}>
              {name}
            </div>
          </div>
          <div className="hud-stat">
            <div className="l">Puntuación</div>
            <div className="v">{score.toLocaleString("es-ES")}</div>
          </div>
          <div className="hud-stat lives">
            <div className="l">Vidas</div>
            <div className="v">{"♥ ".repeat(lives).trim()}</div>
          </div>
          <div className="hud-stat level">
            <div className="l">Nivel</div>
            <div className="v">{String(level).padStart(2, "0")}</div>
          </div>
        </div>
        <div className="hud-actions">
          <button type="button" className="btn yellow" onClick={() => setPaused((p) => !p)}>
            {paused ? "REANUDAR" : "PAUSA"}
          </button>
          <button type="button" className="btn magenta" onClick={() => setOver(true)}>
            FIN
          </button>
          <Link href={`/juego/${gameId}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="crt">
        <div className="crt-screen">
          {isAsteroids ? (
            <AsteroidsCanvas
              paused={paused || over}
              runId={runId}
              onChange={setSnapshot}
              onGameOver={() => setOver(true)}
            />
          ) : (
            <div className="game-arena">
              <div className="grid-floor"></div>
              <div className="enemy e1"></div>
              <div className="enemy e2"></div>
              <div className="enemy e3"></div>
              <div className="player-ship"></div>
            </div>
          )}
          {paused && (
            <div className="crt-content" style={{ background: "rgba(0,0,0,0.6)", zIndex: 5 }}>
              <div>
                <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                  EN PAUSA
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 10, letterSpacing: "0.16em" }}
                >
                  PULSA REANUDAR PARA CONTINUAR
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="crt-bottom">
          <span className="led">SEÑAL OK</span>
          <span>{gameTitle} · CRT-83 · 60 HZ</span>
          <span>CARGA · 1MB</span>
        </div>
      </div>

      {over && (
        <div className="modal-bd">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Fin del juego">
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{score.toLocaleString("es-ES")}</div>
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) => setTypedName(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="TUS INICIALES"
                  aria-label="Tus iniciales"
                />
                <button type="button" className="btn yellow" onClick={save}>
                  GUARDAR PUNTUACIÓN
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={restart}>
                JUGAR DE NUEVO
              </button>
              <Link href={ROUTES.library} className="btn magenta">
                VOLVER AL VAULT
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
