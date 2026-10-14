// Hook PostToolUse (Write|Edit|MultiEdit): formatea con Prettier y corrige con ESLint.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const IGNORED_DIRS = [
  "node_modules",
  ".next",
  "out",
  "build",
  "references",
  "demos",
  ".git",
];
const LINTABLE = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path;
if (!filePath) process.exit(0);

const projectDir = path.resolve(
  process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(),
);
const target = path.resolve(filePath);
const rel = path.relative(projectDir, target);

// Solo archivos dentro del proyecto y fuera de carpetas ignoradas.
if (rel.startsWith("..") || path.isAbsolute(rel)) process.exit(0);
if (rel.split(path.sep).some((part) => IGNORED_DIRS.includes(part)))
  process.exit(0);
if (!existsSync(target)) process.exit(0);

// Se ejecutan los binarios JS con el propio node: sin shell, funciona igual en Windows.
const run = (script, args) =>
  spawnSync(
    process.execPath,
    [path.join(projectDir, "node_modules", script), ...args],
    {
      cwd: projectDir,
      encoding: "utf8",
    },
  );

// 1) Prettier (tipos no soportados se ignoran).
run("prettier/bin/prettier.cjs", ["--write", "--ignore-unknown", target]);

// 2) ESLint --fix para código JS/TS; errores restantes se devuelven a Claude.
if (LINTABLE.has(path.extname(target).toLowerCase())) {
  const res = run("eslint/bin/eslint.js", ["--fix", target]);
  if (res.status !== 0) {
    process.stderr.write(
      `ESLint encontró errores en ${rel}:\n${res.stdout}${res.stderr}`,
    );
    process.exit(2);
  }
}

process.exit(0);
