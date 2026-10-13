import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Acceso",
};

export default function AccesoPage() {
  return <AuthForm />;
}
