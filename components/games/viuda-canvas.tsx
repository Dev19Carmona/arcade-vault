"use client";

import { useEffect, useRef } from "react";
import { H, W } from "@/lib/games/viuda/constants";
import { createViudaEngine } from "@/lib/games/viuda/engine";
import type { ViudaEngine } from "@/lib/games/viuda/types";
import type { GameCanvasProps } from "@/lib/games/types";
import { useViudaLayout } from "./use-viuda-layout";

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
  const size = useViudaLayout();
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
    const toLogical = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) * W) / rect.width,
        y: ((e.clientY - rect.top) * H) / rect.height,
      };
    };
    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = toLogical(e);
      engine.setPointer(x, y);
    };
    const onPointerLeave = () => engine.setPointer(-1, -1);
    // Pulsar y soltar sustituyen al clic: así un arrastre de carta no cuenta como clic.
    const onPointerDown = (e: PointerEvent) => {
      if (pausedRef.current || !e.isPrimary || e.button !== 0) return;
      const { x, y } = toLogical(e);
      // Con el puntero capturado el arrastre sigue aunque salga del canvas.
      canvas.setPointerCapture(e.pointerId);
      engine.pointerDown(x, y);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (pausedRef.current) {
        engine.pointerCancel();
        return;
      }
      const { x, y } = toLogical(e);
      engine.pointerUp(x, y);
    };
    const onPointerCancel = () => engine.pointerCancel();

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
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
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
      className="game-canvas game-canvas--drag"
      width={size.width}
      height={size.height}
      aria-label="Viuda"
    />
  );
}
