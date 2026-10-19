"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import type { GameRow, ScoreRow } from "@/lib/supabase/types";

const TOP = 12;

const fmt = (n: number) => n.toLocaleString("es-ES");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function Podium({ rows }: { rows: ScoreRow[] }) {
  const [first, second, third] = rows;
  return (
    <div className="podium">
      <div className="podium-slot silver">
        <div className="rank-num">02</div>
        <div className="name">{second?.player_name ?? "—"}</div>
        <div className="score">{second ? fmt(second.score) : "—"}</div>
        <div className="date">{second ? fmtDate(second.created_at) : ""}</div>
      </div>
      <div className="podium-slot gold">
        <div
          className="pixel"
          style={{ fontSize: 9, color: "var(--gold)", letterSpacing: "0.18em" }}
        >
          CAMPEÓN
        </div>
        <div className="rank-num" style={{ fontSize: 36, marginTop: 4 }}>
          01
        </div>
        <div className="name">{first.player_name}</div>
        <div className="score" style={{ fontSize: 20 }}>
          {fmt(first.score)}
        </div>
        <div className="date">{fmtDate(first.created_at)}</div>
      </div>
      <div className="podium-slot bronze">
        <div className="rank-num">03</div>
        <div className="name">{third?.player_name ?? "—"}</div>
        <div className="score">{third ? fmt(third.score) : "—"}</div>
        <div className="date">{third ? fmtDate(third.created_at) : ""}</div>
      </div>
    </div>
  );
}

export function HallOfFame({ games }: { games: GameRow[] }) {
  const [tab, setTab] = useState(games[0]?.id ?? "");
  const [loaded, setLoaded] = useState<{
    tab: string;
    rows: ScoreRow[];
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tab) return;
    let cancelled = false;
    createClient()
      .from("scores")
      .select("*")
      .eq("game_id", tab)
      .order("score", { ascending: false })
      .limit(TOP)
      .then(({ data, error }) => {
        if (cancelled) return;
        setFailed(!!error);
        setLoaded({ tab, rows: error ? [] : data });
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const loading = !!tab && loaded?.tab !== tab;
  const rows = loaded?.tab === tab ? loaded.rows : [];

  return (
    <div className="av-hall fade-in">
      <div className="hall-head">
        <h1>SALÓN DE LA FAMA</h1>
        <p className="pixel" style={{ fontSize: 10 }}>
          LOS NOMBRES QUE NUNCA SE BORRAN DE LA PANTALLA
        </p>
      </div>

      <div className="hall-tabs">
        {games.map((g) => (
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

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--ink-faint)",
          }}
        >
          CARGANDO…
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "var(--ink-faint)",
          }}
        >
          {failed
            ? "No se pudo cargar el ranking. Intenta de nuevo."
            : "Sé el primero en entrar al salón de la fama"}
        </div>
      ) : (
        <>
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
                key={r.id}
                className={
                  "tr" +
                  (i === 0
                    ? " top1"
                    : i === 1
                      ? " top2"
                      : i === 2
                        ? " top3"
                        : "")
                }
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="rk">#{String(i + 1).padStart(2, "0")}</div>
                <div className="pl">{r.player_name}</div>
                <div className="sc">{fmt(r.score)}</div>
                <div className="dt">{fmtDate(r.created_at)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link href={ROUTES.library} className="btn lg">
          VOLVER A LA BIBLIOTECA
        </Link>
      </div>
    </div>
  );
}
