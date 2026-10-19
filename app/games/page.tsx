import type { Metadata } from "next";
import { LibraryView } from "@/components/library-view";
import { getBestScores, getGames } from "@/lib/supabase/queries";

export const metadata: Metadata = {
  title: "Biblioteca",
};

export default async function GamesPage() {
  const games = await getGames();
  const bests = await getBestScores(games.map((g) => g.id));

  return (
    <div className="fade-in">
      <section className="av-hero">
        <h1 className="flicker">ARCADE VAULT</h1>
        <div className="sub">
          INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
        </div>
      </section>
      <LibraryView games={games} bests={bests} />
    </div>
  );
}
