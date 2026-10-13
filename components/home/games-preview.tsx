import Link from "next/link";
import { GAMES } from "@/lib/games";
import { ROUTES } from "@/lib/routes";

export function GamesPreview() {
  return (
    <section className="home-section reveal">
      <div className="section-head">
        <div className="kicker pixel neon-cyan">{"// 02"}</div>
        <h2 className="section-title">JUEGOS DISPONIBLES AHORA</h2>
        <div className="section-rule"></div>
      </div>
      <div className="mini-rail">
        {GAMES.slice(0, 6).map((g) => (
          <Link key={g.id} href={`/juego/${g.id}`} className="mini-card">
            <div className="mini-cover">
              <div className={"cover-bg " + g.cover}></div>
            </div>
            <div className="mini-meta">
              <div className="mini-title">{g.title}</div>
              <div className="mini-cat">{g.cat}</div>
            </div>
          </Link>
        ))}
      </div>
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <Link href={ROUTES.library} className="btn lg">
          VER TODOS LOS JUEGOS →
        </Link>
      </div>
    </section>
  );
}
