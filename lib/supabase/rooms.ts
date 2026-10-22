import { generateRoomCode } from "@/lib/games/viuda/online/room-code";
import { MAX_PLAYERS } from "@/lib/games/viuda/constants";
import { createClient } from "./client";
import type { Database } from "./database.types";

export type RoomStatus = "waiting" | "playing" | "closed";
export type RoomRow = Omit<
  Database["public"]["Tables"]["rooms"]["Row"],
  "status"
> & { status: RoomStatus };

// Una sala en espera sin latido durante este tiempo deja de listarse (anfitrión caído).
export const ROOM_OPEN_SECONDS = 60;
export const ROOM_LIST_LIMIT = 20;
const CODE_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

// Alias recortado y limitado a 16 caracteres, como exige la tabla.
export function cleanAlias(alias: string): string {
  return alias.trim().slice(0, 16);
}

export async function createRoom(
  hostId: string,
  hostName: string,
): Promise<RoomRow> {
  const supabase = createClient();
  const name = cleanAlias(hostName);
  if (!name) throw new Error("El alias es obligatorio");

  // La clave primaria es el código: si choca con otra sala, se reintenta con otro.
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code: generateRoomCode(), host_id: hostId, host_name: name })
      .select()
      .single();
    if (!error) return data as RoomRow;
    if (error.code !== UNIQUE_VIOLATION) {
      throw new Error(`No se pudo crear la sala: ${error.message}`);
    }
  }
  throw new Error("No se pudo generar un código de sala libre");
}

// Devuelve la sala sea cual sea su estado; quien llama decide si se puede entrar.
export async function findRoom(code: string): Promise<RoomRow | null> {
  const { data, error } = await createClient()
    .from("rooms")
    .select()
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`No se pudo buscar la sala: ${error.message}`);
  return data as RoomRow | null;
}

// Salas en espera con latido reciente, las más nuevas primero.
export async function listOpenRooms(): Promise<RoomRow[]> {
  const since = new Date(Date.now() - ROOM_OPEN_SECONDS * 1000).toISOString();
  const { data, error } = await createClient()
    .from("rooms")
    .select()
    .eq("status", "waiting")
    .gt("updated_at", since)
    .order("created_at", { ascending: false })
    .limit(ROOM_LIST_LIMIT);
  if (error)
    throw new Error(`No se pudieron listar las salas: ${error.message}`);
  return data as RoomRow[];
}

// Latido del anfitrión: refresca `updated_at` y, si cambió, `player_count`.
export async function heartbeat(
  code: string,
  playerCount?: number,
): Promise<void> {
  const patch: Database["public"]["Tables"]["rooms"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (playerCount !== undefined) {
    patch.player_count = Math.min(Math.max(playerCount, 1), MAX_PLAYERS);
  }
  const { error } = await createClient()
    .from("rooms")
    .update(patch)
    .eq("code", code);
  if (error) throw new Error(`No se pudo actualizar la sala: ${error.message}`);
}

export async function setStatus(
  code: string,
  status: RoomStatus,
): Promise<void> {
  const { error } = await createClient()
    .from("rooms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("code", code);
  if (error) throw new Error(`No se pudo cambiar la sala: ${error.message}`);
}

// Relevo del anfitrión: la sala pasa a manos de otro jugador y conserva su estado.
export async function claimRoom(
  code: string,
  hostId: string,
  hostName: string,
  status: Exclude<RoomStatus, "closed">,
): Promise<void> {
  const { error } = await createClient()
    .from("rooms")
    .update({
      host_id: hostId,
      host_name: cleanAlias(hostName) || "JUGADOR",
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("code", code);
  if (error) throw new Error(`No se pudo traspasar la sala: ${error.message}`);
}

export type JoinBlocker = "closed" | "started" | "full";

// Por qué no se puede entrar a una sala, o null si se puede. Una sala en espera sin
// latido reciente se trata como cerrada: su anfitrión ya no está.
export function joinBlocker(room: RoomRow): JoinBlocker | null {
  if (room.status === "closed") return "closed";
  if (room.status === "playing") return "started";
  const idle = Date.now() - Date.parse(room.updated_at);
  if (idle > ROOM_OPEN_SECONDS * 1000) return "closed";
  if (room.player_count >= MAX_PLAYERS) return "full";
  return null;
}
