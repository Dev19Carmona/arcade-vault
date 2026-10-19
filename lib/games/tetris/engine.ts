import {
  BLOCK,
  BOARD_X,
  BOARD_Y,
  COLS,
  GRID_LINE,
  H,
  HARD_DROP_POINTS,
  LINES_PER_LEVEL,
  LINE_SCORES,
  MAX_DT,
  NEXT_SIZE,
  NEXT_X,
  NEXT_Y,
  PIECES,
  PIECE_TYPES,
  ROWS,
  SOFT_DROP_POINTS,
  W,
  WALL_KICKS,
} from "./constants";
import { drawBlock, drawShape } from "./entities";
import type {
  Piece,
  Shape,
  TetrisEngine,
  TetrisEngineOptions,
  TetrisSnapshot,
} from "./types";
import { createBoard, dropIntervalFor, rotateCW } from "./utils";

function randomPiece(): Piece {
  const type = Math.floor(Math.random() * PIECE_TYPES) + 1;
  const shape = (PIECES[type] as Shape).map((row) => [...row]);
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
  };
}

export function createTetrisEngine({
  onChange,
  onGameOver,
}: TetrisEngineOptions): TetrisEngine {
  let board = createBoard();
  let current: Piece = randomPiece();
  let next: Piece = randomPiece();
  let score = 0;
  let lines = 0;
  let level = 1;
  let gameOver = false;
  let gameOverEmitted = false;
  let dropAccum = 0;
  let dropInterval = dropIntervalFor(1);
  let last: TetrisSnapshot | null = null;

  function getSnapshot(): TetrisSnapshot {
    return { score, lines, level };
  }

  function emit(force = false) {
    const snap = getSnapshot();
    if (
      !force &&
      last &&
      last.score === snap.score &&
      last.lines === snap.lines &&
      last.level === snap.level
    )
      return;
    last = snap;
    onChange(snap);
  }

  function collide(shape: Shape, ox: number, oy: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = ox + c;
        const ny = oy + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function tryRotate() {
    const rotated = rotateCW(current.shape);
    for (const kick of WALL_KICKS) {
      if (!collide(rotated, current.x + kick, current.y)) {
        current.shape = rotated;
        current.x += kick;
        return;
      }
    }
  }

  function merge() {
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          board[current.y + r][current.x + c] = current.shape[r][c];
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((v) => v !== 0)) {
        board.splice(r, 1);
        board.unshift(new Array<number>(COLS).fill(0));
        cleared++;
        r++;
      }
    }
    if (cleared) {
      lines += cleared;
      score += (LINE_SCORES[cleared] || 0) * level;
      level = Math.floor(lines / LINES_PER_LEVEL) + 1;
      dropInterval = dropIntervalFor(level);
    }
  }

  function ghostY(): number {
    let gy = current.y;
    while (!collide(current.shape, current.x, gy + 1)) gy++;
    return gy;
  }

  function endGame() {
    gameOver = true;
    if (gameOverEmitted) return;
    gameOverEmitted = true;
    emit();
    onGameOver(score);
  }

  function spawn() {
    current = next;
    next = randomPiece();
    if (collide(current.shape, current.x, current.y)) endGame();
  }

  function lockPiece() {
    merge();
    clearLines();
    spawn();
  }

  function hardDrop() {
    const gy = ghostY();
    score += (gy - current.y) * HARD_DROP_POINTS;
    current.y = gy;
    lockPiece();
  }

  function softDrop() {
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      score += SOFT_DROP_POINTS;
    } else {
      lockPiece();
    }
  }

  function press(code: string) {
    if (gameOver) return;
    switch (code) {
      case "ArrowLeft":
        if (!collide(current.shape, current.x - 1, current.y)) current.x--;
        break;
      case "ArrowRight":
        if (!collide(current.shape, current.x + 1, current.y)) current.x++;
        break;
      case "ArrowDown":
        softDrop();
        break;
      case "ArrowUp":
      case "KeyX":
        tryRotate();
        break;
      case "Space":
        hardDrop();
        break;
      default:
        return;
    }
    emit();
  }

  function update(dt: number) {
    if (gameOver) return;
    dropAccum += Math.min(dt, MAX_DT);
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) current.y++;
      else lockPiece();
    }
    emit();
  }

  function draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Rejilla del tablero.
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 0.5;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(BOARD_X + c * BLOCK, BOARD_Y);
      ctx.lineTo(BOARD_X + c * BLOCK, BOARD_Y + ROWS * BLOCK);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(BOARD_X, BOARD_Y + r * BLOCK);
      ctx.lineTo(BOARD_X + COLS * BLOCK, BOARD_Y + r * BLOCK);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(BOARD_X - 0.5, BOARD_Y, COLS * BLOCK + 1, ROWS * BLOCK);

    // Tablero fijo.
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        drawBlock(
          ctx,
          BOARD_X + c * BLOCK,
          BOARD_Y + r * BLOCK,
          board[r][c],
          BLOCK,
        );

    // Pieza fantasma y pieza actual.
    drawShape(
      ctx,
      current.shape,
      BOARD_X + current.x * BLOCK,
      BOARD_Y + ghostY() * BLOCK,
      BLOCK,
      0.2,
    );
    drawShape(
      ctx,
      current.shape,
      BOARD_X + current.x * BLOCK,
      BOARD_Y + current.y * BLOCK,
      BLOCK,
    );

    // Vista previa de la siguiente pieza.
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SIGUIENTE", NEXT_X, NEXT_Y - 12);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.strokeRect(NEXT_X - 0.5, NEXT_Y - 0.5, NEXT_SIZE + 1, NEXT_SIZE + 1);
    const offX = Math.floor((4 - next.shape[0].length) / 2);
    const offY = Math.floor((4 - next.shape.length) / 2);
    drawShape(
      ctx,
      next.shape,
      NEXT_X + offX * BLOCK,
      NEXT_Y + offY * BLOCK,
      BLOCK,
    );
  }

  function reset() {
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    gameOver = false;
    gameOverEmitted = false;
    dropAccum = 0;
    dropInterval = dropIntervalFor(1);
    next = randomPiece();
    spawn();
    emit(true);
  }

  reset();

  return { update, draw, press, reset, getSnapshot };
}
