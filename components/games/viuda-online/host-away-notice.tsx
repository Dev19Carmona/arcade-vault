"use client";

import { useEffect, useState } from "react";

// Aviso de que el anfitrión no responde, con la cuenta atrás hasta que otro jugador tome la sala.
export function HostAwayNotice({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  return (
    <p role="status" className="vd-error">
      El anfitrión perdió la conexión. Se le espera {clock}; si no vuelve, otro
      jugador será el anfitrión.
    </p>
  );
}
