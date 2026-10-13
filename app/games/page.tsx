import type { Metadata } from "next";
import { LibraryView } from "@/components/library-view";

export const metadata: Metadata = {
  title: "Biblioteca",
};

export default function GamesPage() {
  return (
    <div className="fade-in">
      <section className="av-hero">
        <h1 className="flicker">ARCADE VAULT</h1>
        <div className="sub">
          INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
        </div>
      </section>
      <LibraryView />
    </div>
  );
}
