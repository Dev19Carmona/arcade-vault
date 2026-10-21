"use client";

import { useState } from "react";
import { ViudaCanvas } from "@/components/games/viuda-canvas";
import { OnlineRoom } from "@/components/games/viuda-online/online-room";
import { Lobby, type EnteredRoom } from "@/components/games/viuda-online/lobby";
import type { GameCanvasProps } from "@/lib/games/types";

type View =
  | { name: "select" }
  | { name: "cpu" }
  | { name: "lobby" }
  | { name: "room"; room: EnteredRoom };

// Entrada de Viuda en el registro: elige entre VS CPU (el canvas de siempre) y el modo en línea.
export function ViudaGame(props: GameCanvasProps) {
  const [view, setView] = useState<View>({ name: "select" });

  if (view.name === "cpu") return <ViudaCanvas {...props} />;

  if (view.name === "lobby") {
    return (
      <Lobby
        onBack={() => setView({ name: "select" })}
        onEnter={(room) => setView({ name: "room", room })}
      />
    );
  }

  if (view.name === "room") {
    return (
      <OnlineRoom
        room={view.room}
        onLeave={() => setView({ name: "lobby" })}
      />
    );
  }

  return (
    <div className="vd-screen">
      <div className="vd-pick">
        <p className="vd-prompt">Elige cómo quieres jugar</p>
        <div className="vd-deal">
          <button
            type="button"
            className="vd-card cpu"
            onClick={() => setView({ name: "cpu" })}
          >
            <span className="vd-corner">
              <b>4</b>
              <b>♠</b>
            </span>
            <span className="vd-face">
              <span className="vd-name">VS CPU</span>
              <span className="vd-desc">
                Tú contra 3 CPU. Cada uno juega con 3 vidas.
              </span>
            </span>
            <span className="vd-corner bottom">
              <b>4</b>
              <b>♠</b>
            </span>
          </button>
          <button
            type="button"
            className="vd-card online"
            onClick={() => setView({ name: "lobby" })}
          >
            <span className="vd-corner">
              <b>9</b>
              <b>♥</b>
            </span>
            <span className="vd-face">
              <span className="vd-name">JUGAR EN LÍNEA</span>
              <span className="vd-desc">
                De 2 a 9 jugadores. Crea una sala o entra con un código.
              </span>
            </span>
            <span className="vd-corner bottom">
              <b>9</b>
              <b>♥</b>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
