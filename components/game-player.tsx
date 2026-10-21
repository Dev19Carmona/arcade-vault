"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { GAME_CANVASES } from "@/components/games/registry";
import { useSession } from "@/components/session-provider";
import type { GameSnapshot } from "@/lib/games/types";
import { ROUTES } from "@/lib/routes";
import {
  getPlayerNameSnapshot,
  subscribePlayerName,
  writePlayerName,
} from "@/lib/session";
import { createClient } from "@/lib/supabase/client";

const LIVES = 3;
const POINTS_PER_LEVEL = 2500;

export function GamePlayer({
  gameId,
  gameTitle,
}: {
  gameId: string;
  gameTitle: string;
}) {
  const { user } = useSession();
  // Juegos con motor real en el registro; el resto sigue con la simulación.
  const Canvas = GAME_CANVASES[gameId];
  const [simScore, setSimScore] = useState(0);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [runId, setRunId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState(false);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // El servidor no tiene localStorage: el snapshot de servidor es null para no desajustar la hidratación.
  const storedName = useSyncExternalStore(
    subscribePlayerName,
    getPlayerNameSnapshot,
    () => null,
  );

  // Prioridad: lo que el jugador edite en el modal, luego el último nombre guardado, luego la sesión.
  const name = typedName ?? storedName ?? user?.name ?? "INVITADO";
  const score = Canvas ? (snapshot?.score ?? 0) : simScore;
  // En juegos reales el HUD solo muestra lo que el juego reporta.
  const lives = Canvas ? snapshot?.lives : LIVES;
  const level = Canvas
    ? snapshot?.level
    : 1 + Math.floor(score / POINTS_PER_LEVEL);
  const stats = Canvas ? (snapshot?.stats ?? []) : [];
  // En línea no hay puntuación ni pausa: la partida es de varios jugadores y no se detiene.
  const online = Canvas ? (snapshot?.online ?? false) : false;

  // Simulación: no hay juego real, el puntaje sube solo mientras no haya pausa ni fin.
  useEffect(() => {
    if (Canvas || over || paused) return;
    const t = setInterval(
      () => setSimScore((s) => s + Math.floor(10 + Math.random() * 90)),
      220,
    );
    return () => clearInterval(t);
  }, [Canvas, over, paused]);

  const restart = () => {
    setSimScore(0);
    setSnapshot(null);
    setRunId((id) => id + 1);
    setPaused(false);
    setOver(false);
    setSaved(false);
    setSaveError(false);
  };

  const save = async () => {
    const playerName = name.trim();
    if (online || saving || saved || !playerName) return;
    setSaving(true);
    setSaveError(false);

    const { error } = await createClient().from("scores").insert({
      game_id: gameId,
      player_name: playerName,
      score,
      user_id: null,
    });

    setSaving(false);
    if (error) {
      setSaveError(true);
      return;
    }
    writePlayerName(playerName);
    setTypedName(null);
    setSaved(true);
  };

  return (
    <div className="av-player fade-in">
      <div className="player-hud">
        <div className="hud-stats">
          <div className="hud-stat">
            <div className="l">Jugador</div>
            <div className="v name" style={{ color: "var(--ink)" }}>
              {name}
            </div>
          </div>
          {!online && (
            <div className="hud-stat">
              <div className="l">Puntuación</div>
              <div className="v">{score.toLocaleString("es-ES")}</div>
            </div>
          )}
          {lives !== undefined && (
            <div className="hud-stat lives">
              <div className="l">Vidas</div>
              <div className="v">
                {lives > 0 ? "♥ ".repeat(lives).trim() : "—"}
              </div>
            </div>
          )}
          {level !== undefined && (
            <div className="hud-stat level">
              <div className="l">Nivel</div>
              <div className="v">{String(level).padStart(2, "0")}</div>
            </div>
          )}
          {stats.map((s) => (
            <div className="hud-stat" key={s.label}>
              <div className="l">{s.label}</div>
              <div className="v">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="hud-actions">
          {!online && (
            <>
              <button
                type="button"
                className="btn yellow"
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? "REANUDAR" : "PAUSA"}
              </button>
              <button
                type="button"
                className="btn magenta"
                onClick={() => setOver(true)}
              >
                FIN
              </button>
            </>
          )}
          <Link href={`/juego/${gameId}`} className="btn ghost">
            SALIR
          </Link>
        </div>
      </div>

      <div className="player-stage">
        <div className="crt">
          <div className="crt-screen">
            {Canvas ? (
              <Canvas
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
              <div
                className="crt-content"
                style={{ background: "rgba(0,0,0,0.6)", zIndex: 5 }}
              >
                <div>
                  <div className="pixel neon-yellow" style={{ fontSize: 22 }}>
                    EN PAUSA
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: "var(--ink-dim)",
                      marginTop: 10,
                      letterSpacing: "0.16em",
                    }}
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
      </div>

      {over && !online && (
        <div className="modal-bd">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Fin del juego"
          >
            <h2>FIN DEL JUEGO</h2>
            <div className="final-label">PUNTUACIÓN FINAL</div>
            <div className="final">{score.toLocaleString("es-ES")}</div>
            {!saved ? (
              <div className="input-row">
                <input
                  value={name}
                  onChange={(e) =>
                    setTypedName(e.target.value.toUpperCase().slice(0, 10))
                  }
                  placeholder="TUS INICIALES"
                  aria-label="Tus iniciales"
                />
                <button
                  type="button"
                  className="btn yellow"
                  onClick={save}
                  disabled={saving || !name.trim()}
                >
                  {saving ? "GUARDANDO…" : "GUARDAR PUNTUACIÓN"}
                </button>
              </div>
            ) : (
              <div className="toast-saved">▸ PUNTUACIÓN GUARDADA_</div>
            )}
            {saveError && !saved && (
              <div
                role="alert"
                style={{ color: "var(--magenta)", fontSize: 12, marginTop: 8 }}
              >
                No se pudo guardar la puntuación. Intenta de nuevo.
              </div>
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
