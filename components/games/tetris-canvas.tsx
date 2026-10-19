"use client";

import { useEffect, useRef } from "react";
import { H, W } from "@/lib/games/tetris/constants";
import { createTetrisEngine } from "@/lib/games/tetris/engine";
import type { TetrisEngine } from "@/lib/games/tetris/types";
import type { GameCanvasProps } from "@/lib/games/types";

const GAME_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyX",
  "Space",
]);

// Mover y bajar admiten la repetición del teclado; rotar y hard drop, no.
const REPEATABLE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowDown"]);

function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function TetrisCanvas({
  paused,
  runId,
  onChange,
  onGameOver,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TetrisEngine | null>(null);
  const pausedRef = useRef(paused);
  const onChangeRef = useRef(onChange);
  const onGameOverRef = useRef(onGameOver);
  const lastRunId = useRef(runId);

  // Las refs siempre apuntan a los últimos valores sin recrear el motor.
  useEffect(() => {
    pausedRef.current = paused;
    onChangeRef.current = onChange;
    onGameOverRef.current = onGameOver;
  });

  // Motor, teclado y bucle: se crean al montar y se limpian por completo al desmontar.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const engine = createTetrisEngine({
      onChange: ({ score, lines, level }) =>
        onChangeRef.current({
          score,
          level,
          stats: [{ label: "LÍNEAS", value: String(lines) }],
        }),
      onGameOver: (finalScore) => onGameOverRef.current(finalScore),
    });
    engineRef.current = engine;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!GAME_KEYS.has(e.code) || isTextTarget(e.target)) return;
      if (pausedRef.current) return;
      e.preventDefault();
      if (e.repeat && !REPEATABLE_KEYS.has(e.code)) return;
      engine.press(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Evita que Espacio active un botón con foco al soltarlo.
      if (
        GAME_KEYS.has(e.code) &&
        !pausedRef.current &&
        !isTextTarget(e.target)
      )
        e.preventDefault();
    };

    let raf = 0;
    let lastTime: number | null = null;

    // Al volver de otra pestaña el primer frame arranca con dt = 0.
    const onVisibility = () => {
      lastTime = null;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);

    const loop = (ts: number) => {
      if (pausedRef.current) {
        // Al reanudar el primer frame arranca con dt = 0, sin saltos.
        lastTime = null;
      } else {
        const dt = lastTime === null ? 0 : (ts - lastTime) / 1000;
        lastTime = ts;
        engine.update(dt);
      }
      engine.draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
      engineRef.current = null;
    };
  }, []);

  // Una nueva partida llega como un `runId` distinto.
  useEffect(() => {
    if (lastRunId.current === runId) return;
    lastRunId.current = runId;
    engineRef.current?.reset();
  }, [runId]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      width={W}
      height={H}
      aria-label="Tetris"
    />
  );
}
