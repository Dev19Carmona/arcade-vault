import type { Metadata } from "next";
import { HallOfFame } from "@/components/hall-of-fame";
import { getGames } from "@/lib/supabase/queries";

export const metadata: Metadata = {
  title: "Salón de la Fama",
};

export default async function SalonPage() {
  const games = await getGames();
  return <HallOfFame games={games} />;
}
