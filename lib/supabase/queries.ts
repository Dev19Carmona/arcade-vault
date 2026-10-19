import { cache } from "react";
import { createClient } from "./server";
import type { GameRow, ScoreRow } from "./types";

// Solo juegos presentes en Supabase; el orden es estable por fecha de alta.
export async function getGames(): Promise<GameRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .order("created_at", { ascending: true });
  if (error)
    throw new Error(`No se pudieron cargar los juegos: ${error.message}`);
  return data as GameRow[];
}

// `best` no se almacena: es el MAX(score) de cada juego (0 si no hay scores).
export async function getBestScores(
  gameIds: string[],
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const entries = await Promise.all(
    gameIds.map(async (id) => {
      const { data, error } = await supabase
        .from("scores")
        .select("score")
        .eq("game_id", id)
        .order("score", { ascending: false })
        .limit(1);
      if (error)
        throw new Error(`No se pudo calcular el mejor score: ${error.message}`);
      return [id, data[0]?.score ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

// Deduplicado por request: lo usan generateMetadata y la página a la vez.
export const getGame = cache(async (id: string): Promise<GameRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar el juego: ${error.message}`);
  return data as GameRow | null;
});

export async function getTopScores(
  gameId: string,
  limit: number,
): Promise<ScoreRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scores")
    .select("*")
    .eq("game_id", gameId)
    .order("score", { ascending: false })
    .limit(limit);
  if (error)
    throw new Error(`No se pudo cargar el leaderboard: ${error.message}`);
  return data;
}

export async function getScoreCount(gameId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("scores")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (error)
    throw new Error(`No se pudo contar las partidas: ${error.message}`);
  return count ?? 0;
}
