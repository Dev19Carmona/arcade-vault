import { redirect } from "next/navigation";

// Temporal (SPEC 02, paso 1): la Biblioteca vive en /games.
// El paso 10 reemplaza este redirect por el homepage.
export default function Home() {
  redirect("/games");
}
