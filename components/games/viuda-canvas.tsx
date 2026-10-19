"use client";

import { useEffect, useRef } from "react";
import { H, W } from "@/lib/games/viuda/constants";
import { createViudaEngine } from "@/lib/games/viuda/engine";
import type { ViudaEngine } from "@/lib/games/viuda/types";
import type { GameCanvasProps } from "@/lib/games/types";

const GAME_KEYS = new Set([
  "KeyP",
  "KeyL",
  "KeyC",
  "KeyX",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "Space",
  "Enter",
  "NumpadEnter",
]);

function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function ViudaCanvas({
  paused,
  runId,
  onChange,
  onGameOver,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ViudaEngine | null>(null);
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

  // Motor, teclado, ratón y bucle: se crean al montar y se limpian por completo al desmontar.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const engine = createViudaEngine({
      onChange: ({ score, lives, round, rivals }) =>
        onChangeRef.current({
          score,
          lives,
          stats: [
            { label: "RONDA", value: String(Math.max(round, 1)) },
            { label: "RIVALES", value: String(rivals) },
          ],
        }),
      onGameOver: (finalScore) => onGameOverRef.current(finalScore),
    });
    engineRef.current = engine;

    // Pantalla -> coordenadas lógicas del canvas, que se escala por CSS.
    const toLogical = (e: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      engine.setPointer(
        ((e.clientX - rect.left) * W) / rect.width,
        ((e.clientY - rect.top) * H) / rect.height,
      );
    };
    const onPointerMove = (e: PointerEvent) => toLogical(e);
    const onPointerLeave = () => engine.setPointer(-1, -1);
    const onClick = (e: MouseEvent) => {
      if (pausedRef.current) return;
      toLogical(e);
      engine.click();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!GAME_KEYS.has(e.code) || isTextTarget(e.target)) return;
      if (pausedRef.current) return;
      e.preventDefault();
      if (e.repeat) return;
      engine.press(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Evita que Espacio/Enter activen un botón con foco al soltarlos.
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

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);
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
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
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
      aria-label="Viuda"
    />
  );
}
