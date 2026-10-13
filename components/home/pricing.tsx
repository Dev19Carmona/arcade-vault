import Link from "next/link";
import { FAQ, PRICING_PERKS } from "@/lib/home";
import { ROUTES } from "@/lib/routes";

export function Pricing() {
  return (
    <section className="home-section reveal">
      <div className="section-head">
        <div className="kicker pixel neon-green">{"// 04"}</div>
        <h2 className="section-title">PRECIOS</h2>
        <div className="section-rule"></div>
      </div>
      <div className="pricing-grid">
        <div className="price-card">
          <div className="pc-label pixel">PLAN ÚNICO</div>
          <div className="pc-name pixel">JUGADOR VAULT</div>
          <div className="pc-amount">
            <span className="pc-amount-n">$0</span>
            <span className="pc-amount-u">/ SIEMPRE</span>
          </div>
          <div className="pc-tag">SIN TRUCOS · SIN LETRA PEQUEÑA</div>
          <ul className="pc-list">
            {PRICING_PERKS.map((perk) => (
              <li key={perk}>✔ {perk}</li>
            ))}
          </ul>
          <Link href={ROUTES.auth} className="btn xl pulse" style={{ width: "100%" }}>
            EMPEZAR GRATIS →
          </Link>
          <div className="pc-foot">No pedimos tarjeta. Nunca lo haremos.</div>
          <div className="pc-stamp pixel">
            FREE
            <br />
            PLAY
          </div>
        </div>

        <div className="pricing-faq">
          {FAQ.map((item) => (
            <div key={item.q} className="faq-item">
              <div className="faq-q pixel">{item.q}</div>
              <div className="faq-a">{item.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
