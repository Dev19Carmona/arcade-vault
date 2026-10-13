import Link from "next/link";
import { RECENT_SCORES, TOP_PLAYERS } from "@/lib/home";
import { ROUTES } from "@/lib/routes";

const TOP_CLASS = ["top1", "top2", "top3"];

export function Activity() {
  return (
    <section className="home-section reveal">
      <div className="section-head">
        <div className="kicker pixel neon-yellow">{"// 03"}</div>
        <h2 className="section-title">ACTIVIDAD EN VIVO</h2>
        <div className="section-rule"></div>
      </div>
      <div className="activity-grid">
        <div className="activity-card">
          <div className="ac-head">
            <div className="ac-title pixel">▸ ÚLTIMAS PUNTUACIONES</div>
          </div>
          <div className="ticker">
            {RECENT_SCORES.map((r, i) => (
              <div key={r.player} className="tick-row" style={{ animationDelay: i * 60 + "ms" }}>
                <span className={"tk-p neon-" + r.color}>{r.player}</span>
                <span className="tk-mid">▸ {r.game}</span>
                <span className="tk-s">+{r.score.toLocaleString("es-ES")}</span>
                <span className="tk-t">{r.ago}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="activity-card">
          <div className="ac-head">
            <div className="ac-title pixel neon-magenta">▸ TOP JUGADORES · HOY</div>
            <Link href={ROUTES.hall} className="lb-link">
              VER SALÓN →
            </Link>
          </div>
          <div className="top-list">
            {TOP_PLAYERS.map((r, i) => (
              <div key={r.player} className={"top-row" + (TOP_CLASS[i] ? " " + TOP_CLASS[i] : "")}>
                <span className="tp-rk">#{String(r.rank).padStart(2, "0")}</span>
                <span className="tp-bar">
                  <span className="tp-fill" style={{ width: 100 - i * 16 + "%" }}></span>
                </span>
                <span className="tp-p">{r.player}</span>
                <span className="tp-s">{r.score.toLocaleString("es-ES")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
