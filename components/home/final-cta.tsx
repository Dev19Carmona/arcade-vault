import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export function FinalCta() {
  return (
    <section className="home-final reveal">
      <h2 className="final-title pixel">¿LISTO PARA JUGAR?</h2>
      <Link href={ROUTES.library} className="btn xl pulse final-cta">
        INSERTAR MONEDA →
      </Link>
      <div className="final-tag">Gratis. Sin registro obligatorio. Empieza en segundos.</div>
    </section>
  );
}
