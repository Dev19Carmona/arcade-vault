"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/components/use-reveal";

// Única isla cliente del homepage: activa el revelado al hacer scroll y deja
// que las secciones (hijos) sigan siendo componentes de servidor.
export function RevealRoot({ children }: { children: ReactNode }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="home fade-in">
      {children}
    </div>
  );
}
