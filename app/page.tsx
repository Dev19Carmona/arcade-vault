import type { Metadata } from "next";
import { Activity } from "@/components/home/activity";
import { Features } from "@/components/home/features";
import { FinalCta } from "@/components/home/final-cta";
import { GamesPreview } from "@/components/home/games-preview";
import { Hero } from "@/components/home/hero";
import { Pricing } from "@/components/home/pricing";
import { RevealRoot } from "@/components/home/reveal-root";
import { Stats } from "@/components/home/stats";

export const metadata: Metadata = {
  description:
    "Juega los mejores clásicos arcade en tu navegador, sin descargas y sin costo, y compite por puntos en Arcade Vault.",
};

export default function HomePage() {
  return (
    <RevealRoot>
      <Hero />
      <Features />
      <GamesPreview />
      <Stats />
      <Activity />
      <Pricing />
      <FinalCta />
    </RevealRoot>
  );
}
