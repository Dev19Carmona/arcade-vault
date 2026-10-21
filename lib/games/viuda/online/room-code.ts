import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../constants";

// Código de sala legible: sin I, O, 0 ni 1 para que no se confundan al dictarlo.
export function generateRoomCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code +=
      ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

// Lo que el usuario teclea: se ignoran espacios y mayúsculas/minúsculas.
export function normalizeRoomCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function isValidRoomCode(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH &&
    [...code].every((char) => ROOM_CODE_ALPHABET.includes(char))
  );
}
