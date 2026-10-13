"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import { GAMES, seededScores } from "@/lib/games";
import type { ScoreRow } from "@/lib/games";
import { ROUTES } from "@/lib/routes";

const fmt = (n: number) => n.toLocaleString("es-ES");

function Podium({ rows }: { rows: ScoreRow[] }) {
  const [first, second, third] = rows;
  return (
    <div className="podium">
      <div className="podium-slot silver">
        <div className="rank-num">02</div>
        <div className="name">{second.name}</div>
        <div className="score">{fmt(second.score)}</div>
        <div className="date">{second.date}</div>
      </div>
      <div className="podium-slot gold">
        <div className="pixel" style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "0.18em" }}>
          CAMPEÓN
        </div>
        <div className="rank-num" style={{ fontSize: 36, marginTop: 4 }}>
          01
        </div>
        <div className="name">{first.name}</div>
        <div className="score" style={{ fontSize: 20 }}>
          {fmt(first.score)}
        </div>
        <div className="date">{first.date}</div>
      </div>
      <div className="podium-slot bronze">
        <div className="rank-num">03</div>
        <div className="name">{third.name}</div>
        <div className="score">{fmt(third.score)}</div>
        <div className="date">{third.date}</div>
      </div>
    </div>
  );
}

export function HallOfFame() {
  const { user } = useSession();
  const [tab, setTab] = useState(GAMES[0].id);

  const rows = useMemo(() => seededScores(tab.length * 23 + 7, 12), [tab]);
  const game = GAMES.find((g) => g.id === tab) ?? GAMES[0];
  const youRank = 8 + (tab.length % 4);
  const youScore = rows[5].score - 2400;

  return (
    <div className="av-hall fade-in">
      <div className="hall-head">
        <h1>SALÓN DE LA FAMA</h1>
        <p className="pixel" style={{ fontSize: 10 }}>
          LOS NOMBRES QUE NUNCA SE BORRAN DE LA PANTALLA
        </p>
      </div>

      <div className="hall-tabs">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={"chip" + (tab === g.id ? " active" : "")}
            aria-pressed={tab === g.id}
            onClick={() => setTab(g.id)}
          >
            {g.title}
          </button>
        ))}
      </div>

      <Podium rows={rows} />

      <div className="hall-table">
        <div className="th">
          <div>RANGO</div>
          <div>JUGADOR</div>
          <div>PUNTUACIÓN</div>
          <div>FECHA</div>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.name + i}
            className={"tr" + (i === 0 ? " top1" : i === 1 ? " top2" : i === 2 ? " top3" : "")}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="rk">#{String(r.rank).padStart(2, "0")}</div>
            <div className="pl">{r.name}</div>
            <div className="sc">{fmt(r.score)}</div>
            <div className="dt">{r.date}</div>
          </div>
        ))}
        {user && (
          <>
            <div className="tr you-label">▸ TU MEJOR MARCA EN {game.title}</div>
            <div className="tr you" style={{ animationDelay: `${rows.length * 50 + 50}ms` }}>
              <div className="rk" style={{ color: "var(--yellow)" }}>
                #{String(youRank).padStart(2, "0")}
              </div>
              <div className="pl" style={{ color: "var(--yellow)" }}>
                {user.name}
              </div>
              <div className="sc" style={{ color: "var(--yellow)", textShadow: "0 0 6px rgba(245,255,0,0.5)" }}>
                {fmt(youScore)}
              </div>
              <div className="dt">11/05/2026</div>
            </div>
          </>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link href={ROUTES.library} className="btn lg">
          VOLVER A LA BIBLIOTECA
        </Link>
      </div>
    </div>
  );
}
