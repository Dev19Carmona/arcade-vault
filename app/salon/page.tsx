import type { Metadata } from "next";
import { HallOfFame } from "@/components/hall-of-fame";

export const metadata: Metadata = {
  title: "Salón de la Fama",
};

export default function SalonPage() {
  return <HallOfFame />;
}
