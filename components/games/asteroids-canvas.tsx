"use client";

import { useEffect, useRef } from "react";
import { H, W } from "@/lib/games/asteroids/constants";
import { createAsteroidsEngine } from "@/lib/games/asteroids/engine";
import type {
  AsteroidsEngine,
  AsteroidsSnapshot,
} from "@/lib/games/asteroids/types";

interface AsteroidsCanvasProps {
  paused: boolean;
  runId: number;
  onChange: (snapshot: AsteroidsSnapshot) => void;
  onGameOver: (finalScore: number) => void;
}

const GAME_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function AsteroidsCanvas({
  paused,
  runId,
  onChange,
  onGameOver,
}: AsteroidsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AsteroidsEngine | null>(null);
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

    const engine = createAsteroidsEngine({
      onChange: (snapshot) => onChangeRef.current(snapshot),
      onGameOver: (finalScore) => onGameOverRef.current(finalScore),
    });
    engineRef.current = engine;

    const held = new Set<string>();
    engine.setKeys(held);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!GAME_KEYS.has(e.code) || isTextTarget(e.target)) return;
      if (pausedRef.current) return;
      e.preventDefault();
      if (e.code === "Space" && !e.repeat && !held.has("Space"))
        engine.pressShoot();
      held.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.code);
      // Evita que Espacio active un botón con foco al soltarlo.
      if (
        GAME_KEYS.has(e.code) &&
        !pausedRef.current &&
        !isTextTarget(e.target)
      )
        e.preventDefault();
    };
    const onBlur = () => held.clear();

    let raf = 0;
    let lastTime: number | null = null;

    // Al volver de otra pestaña el primer frame arranca con dt = 0 y sin teclas fantasma.
    const onVisibility = () => {
      lastTime = null;
      held.clear();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);

    const loop = (ts: number) => {
      if (pausedRef.current) {
        // Al reanudar el primer frame arranca con dt = 0, sin saltos.
        lastTime = null;
        held.clear();
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
      window.removeEventListener("blur", onBlur);
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
      aria-label="Asteroids"
    />
  );
}
