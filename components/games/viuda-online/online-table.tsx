"use client";

import { useEffect, useRef, useState } from "react";
import { H, HAND_SIZE, MAX_DT, W } from "@/lib/games/viuda/constants";
import { pointInRect } from "@/lib/games/viuda/entities";
import {
  createHandDrag,
  moveCard,
  visualIndices,
  visualToRules,
} from "@/lib/games/viuda/hand-order";
import type {
  OnlineAction,
  PrivateHand,
  PublicTable,
} from "@/lib/games/viuda/online/protocol";
import { createTableFx } from "@/lib/games/viuda/online/table-fx";
import {
  drawOnlineTable,
  isMyTurn,
  onlineButtons,
  ownCardRects,
  statusLine,
  widowCardRects,
  type OnlineButtonId,
  type OnlineView,
} from "@/lib/games/viuda/online/table-view";

// Atajos de SPEC 07: P paso, L llamo, C cambiar 5, X cambiar 1, 1–5 carta propia,
// Q W E R T carta de la viuda, Espacio/Enter continuar.
const OWN_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
const WIDOW_KEYS = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT"];
const CONTINUE_KEYS = ["Space", "Enter", "NumpadEnter"];
const GAME_KEYS = new Set([
  "KeyP",
  "KeyL",
  "KeyC",
  "KeyX",
  ...OWN_KEYS,
  ...WIDOW_KEYS,
  ...CONTINUE_KEYS,
]);

function isTextTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

interface Props {
  table: PublicTable;
  hand: PrivateHand | null;
  playerId: string;
  isHost: boolean;
  notice: "running" | "reconnecting" | null;
  hostAwayUntil: number | null;
  onAction: (action: OnlineAction) => void;
  onContinue: () => void;
  onPause: () => void;
  onResume: () => void;
  onEliminate: (playerId: string) => void;
  onRematch: () => void;
  onLeave: () => void;
}

// Mesa en línea: canvas 800×600 escalado por CSS. El estado llega de fuera (mesa
// pública y mano privada); aquí solo se dibuja y se traducen clics y teclas a acciones.
export function OnlineTable(props: Props) {
  const { table, playerId } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  const sel = useRef<{ own: number | null; widow: number | null }>({
    own: null,
    widow: null,
  });
  const pointer = useRef({ x: -1, y: -1 });
  // Animaciones de la mesa: cada cliente anima por su cuenta los eventos que llegan.
  const [fx] = useState(createTableFx);
  // Arrastre de las cartas de mi mano: solo reordena mi vista, no es una acción de juego.
  const [drag] = useState(() => createHandDrag(HAND_SIZE));
  const lastHandSeq = useRef(-1);
  // Cuenta atrás local: el anfitrión envía los segundos solo al cambiar la mesa.
  const deadline = useRef<number | null>(null);
  const lastSeq = useRef(-1);
  // Vidas antes del duelo, para saber quién pierde una.
  const livesBeforeDuel = useRef(new Map<string, number>());
  const losers = useRef<ReadonlySet<string>>(new Set());

  // Las refs siempre apuntan a lo último sin recrear el bucle.
  useEffect(() => {
    live.current = props;
    fx.ingest(table, props.hand, playerId, performance.now());
    // Si mi mano cambia (reparto o cambio de cartas), un arrastre en curso ya no vale.
    if ((props.hand?.seq ?? -1) !== lastHandSeq.current) {
      lastHandSeq.current = props.hand?.seq ?? -1;
      drag.cancel();
    }
    if (table.phase === "draw" || table.phase === "turn") {
      livesBeforeDuel.current = new Map(
        table.seats.map((s) => [s.playerId, s.lives]),
      );
    }
    losers.current =
      table.phase === "showdown"
        ? new Set(
            table.seats
              .filter(
                (s) =>
                  s.lives <
                  (livesBeforeDuel.current.get(s.playerId) ?? s.lives),
              )
              .map((s) => s.playerId),
          )
        : new Set();
    if (table.seq !== lastSeq.current) {
      lastSeq.current = table.seq;
      // En pausa la cuenta atrás queda congelada en lo que envía el anfitrión.
      deadline.current =
        table.autoAdvanceIn === null || table.paused
          ? null
          : performance.now() + table.autoAdvanceIn * 1000;
    }
    // La selección solo tiene sentido en mi turno y con la viuda abierta.
    if (!isMyTurn({ table, playerId }) || !table.widowOpen) {
      sel.current = { own: null, widow: null };
    }
  });

  // Dibujo, ratón y teclado: se crean al montar y se limpian por completo al desmontar.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const currentView = (): OnlineView => {
      const p = live.current;
      const left =
        deadline.current === null
          ? p.table.paused
            ? p.table.autoAdvanceIn
            : null
          : Math.max(
              0,
              Math.ceil((deadline.current - performance.now()) / 1000),
            );
      return {
        table: p.table,
        hand: p.hand,
        playerId: p.playerId,
        isHost: p.isHost,
        losers: losers.current,
        selOwn: sel.current.own,
        selWidow: sel.current.widow,
        pointer: pointer.current,
        secondsLeft: left,
        notice: p.notice,
        hostAwayLeft:
          p.hostAwayUntil === null
            ? null
            : Math.max(0, Math.ceil((p.hostAwayUntil - Date.now()) / 1000)),
        fx,
        locked: fx.isLocked(),
        order: fx.order(),
        drag,
      };
    };

    const activate = (id: OnlineButtonId, target?: string) => {
      const p = live.current;
      const view = currentView();
      const mine = isMyTurn(view);
      const clear = () => (sel.current = { own: null, widow: null });
      if (id === "leave") p.onLeave();
      else if (id === "continue") p.onContinue();
      else if (id === "pause") p.onPause();
      else if (id === "resume") p.onResume();
      else if (id === "rematch") p.onRematch();
      else if (id === "eliminate") {
        if (target) p.onEliminate(target);
      } else if (!mine) return;
      else if (id === "pass") p.onAction({ type: "pass" });
      else if (id === "call") {
        if (p.table.callerId === null) p.onAction({ type: "call" });
      } else if (id === "swap5") p.onAction({ type: "swap5" });
      else if (id === "swap1") {
        const { own, widow } = sel.current;
        if (p.table.widowOpen && own !== null && widow !== null) {
          p.onAction({ type: "swap1", handIndex: own, widowIndex: widow });
        }
      }
      clear();
    };

    // Pantalla -> coordenadas lógicas del canvas, que se escala por CSS.
    const toLogical = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.current = {
        x: ((e.clientX - rect.left) * W) / rect.width,
        y: ((e.clientY - rect.top) * H) / rect.height,
      };
      return pointer.current;
    };

    // Se puede reordenar la mano siempre que haya cartas, también fuera de turno.
    const canDrag = (view: OnlineView) => {
      const me = view.table.seats.find((s) => s.playerId === view.playerId);
      return (
        !!me?.alive &&
        me.connected &&
        !view.table.paused &&
        (view.table.phase === "turn" || view.table.phase === "showdown") &&
        view.hand?.hand.length === HAND_SIZE
      );
    };

    const handleClick = () => {
      const { x, y } = pointer.current;
      const view = currentView();
      const button = onlineButtons(view).find((b) => pointInRect(x, y, b.rect));
      if (button) {
        if (!button.disabled) activate(button.id, button.target);
        return;
      }
      // Un clic durante una animación la termina en vez de actuar.
      if (fx.isLocked()) {
        fx.skip();
        return;
      }
      // Con la viuda abierta se eligen una carta propia y una de la viuda.
      if (isMyTurn(view) && view.table.widowOpen) {
        // La selección guarda el índice de las reglas: acompaña a la carta aunque se mueva.
        const cards = view.hand?.hand ?? [];
        const indices = visualIndices(view.order, cards);
        ownCardRects(cards.length).forEach((r, v) => {
          if (pointInRect(x, y, r)) {
            const k = indices[v];
            sel.current.own = sel.current.own === k ? null : k;
          }
        });
        widowCardRects().forEach((r, i) => {
          if (pointInRect(x, y, r)) {
            sel.current.widow = sel.current.widow === i ? null : i;
          }
        });
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const { x, y } = toLogical(e);
      drag.move(x, y);
    };
    // Al salir del canvas el arrastre, si lo hay, conserva su última posición.
    const onPointerLeave = () => (pointer.current = { x: -1, y: -1 });
    // Pulsar y soltar sustituyen al clic: así un arrastre de carta no cuenta como clic.
    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      const { x, y } = toLogical(e);
      canvas.setPointerCapture(e.pointerId);
      if (canDrag(currentView())) {
        // Una carta que está en vuelo no se puede coger hasta que llegue.
        drag.down(
          x,
          y,
          ownCardRects(HAND_SIZE),
          (slot) => !fx.tl.hidden.has(`own:${slot}`) && !fx.waiting(),
        );
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      const { x, y } = toLogical(e);
      drag.move(x, y);
      const release = drag.up();
      if (release?.kind === "drop") {
        if (release.from !== release.to) {
          fx.setOrder(moveCard(fx.order(), release.from, release.to));
        }
        return;
      }
      handleClick();
    };
    const onPointerCancel = () => drag.cancel();

    const onKeyDown = (e: KeyboardEvent) => {
      if (!GAME_KEYS.has(e.code) || isTextTarget(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      // Una tecla durante una animación la termina en vez de actuar.
      if (fx.isLocked()) {
        fx.skip();
        return;
      }
      const view = currentView();
      const { table: t, isHost } = view;
      if (CONTINUE_KEYS.includes(e.code)) {
        if (
          isHost &&
          !t.paused &&
          (t.phase === "draw" || t.phase === "showdown")
        ) {
          activate("continue");
        }
        return;
      }
      if (!isMyTurn(view)) return;
      if (e.code === "KeyP") activate("pass");
      else if (e.code === "KeyL") activate("call");
      else if (e.code === "KeyC") activate("swap5");
      else if (e.code === "KeyX") activate("swap1");
      else if (t.widowOpen) {
        const own = OWN_KEYS.indexOf(e.code);
        const widow = WIDOW_KEYS.indexOf(e.code);
        if (own >= 0) {
          // Las teclas 1–5 son posiciones visuales, de izquierda a derecha.
          const k = visualToRules(fx.order(), view.hand?.hand ?? [], own);
          sel.current.own = sel.current.own === k ? null : k;
        }
        if (widow >= 0) {
          sel.current.widow = sel.current.widow === widow ? null : widow;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Evita que Espacio/Enter activen un botón con foco al soltarlos.
      if (GAME_KEYS.has(e.code) && !isTextTarget(e.target)) e.preventDefault();
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    let lastTime = performance.now();
    const loop = () => {
      // El tiempo de las animaciones avanza con dt (acotado), como en VS CPU.
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, MAX_DT);
      fx.update(dt, now);
      drag.update(dt);
      lastTime = now;
      drawOnlineTable(ctx, currentView());
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
    };
  }, [fx, drag]);

  return (
    <div className="vd-screen">
      <canvas
        ref={canvasRef}
        className="game-canvas game-canvas--drag"
        width={W}
        height={H}
        aria-label="Mesa de Viuda en línea"
      />
      <p className="sr-only" role="status" aria-live="polite">
        {statusLine(table, playerId)}
      </p>
    </div>
  );
}
