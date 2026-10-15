import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

// Solo para client components. En código de servidor usar `./server`.
export function createClient() {
  // Las variables NEXT_PUBLIC_* se inyectan en el bundle solo si se acceden
  // con el nombre literal, por eso no se leen desde un helper dinámico.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local y completa los valores.",
    );
  }

  return createBrowserClient<Database>(url, key);
}
