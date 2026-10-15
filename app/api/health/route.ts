import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    // Valida las variables de entorno y deja la ruta como dinámica (cookies).
    await createClient();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Supabase respondió ${res.status}` },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Error desconocido",
      },
      { status: 503 },
    );
  }
}
