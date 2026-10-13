"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/session-provider";

type NavSection = "biblioteca" | "salon" | "acceso";

function sectionFor(pathname: string): NavSection | null {
  if (pathname === "/" || pathname.startsWith("/juego")) return "biblioteca";
  if (pathname.startsWith("/salon")) return "salon";
  if (pathname.startsWith("/acceso")) return "acceso";
  return null;
}

export function Nav() {
  const pathname = usePathname();
  const { user, ready, signOut } = useSession();
  const [open, setOpen] = useState(false);

  const section = sectionFor(pathname);
  const cls = (name: NavSection) => (section === name ? "active" : undefined);
  const close = () => setOpen(false);

  return (
    <>
      <nav className="av-nav">
        <Link href="/" className="logo" onClick={close}>
          <div className="logo-mark"></div>
          <div className="logo-text neon-cyan">
            ARCADE <span className="neon-magenta">VAULT</span>
          </div>
        </Link>
        <div className="links">
          <Link href="/" className={cls("biblioteca")}>
            Biblioteca
          </Link>
          <Link href="/salon" className={cls("salon")}>
            Salón de la Fama
          </Link>
        </div>
        <div className="spacer"></div>
        <div className="coin-counter">
          <span className="coin"></span>
          <span>CRÉDITOS · 03</span>
        </div>
        {!ready ? (
          <button type="button" className="btn ghost auth-btn" style={{ visibility: "hidden" }} aria-hidden="true" tabIndex={-1}>
            Iniciar Sesión
          </button>
        ) : user ? (
          <button type="button" className="btn ghost auth-btn" onClick={signOut} title="Cerrar sesión">
            {user.name} ▾
          </button>
        ) : (
          <Link href="/acceso" className="btn auth-btn">
            Iniciar Sesión
          </Link>
        )}
        <button
          type="button"
          className="btn ghost hamburger"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          ≡
        </button>
      </nav>

      <div className={"av-mobile-backdrop" + (open ? " open" : "")} onClick={close}></div>
      <aside className={"av-mobile-panel" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="pixel neon-cyan" style={{ fontSize: 11, marginBottom: 16 }}>
          MENÚ
        </div>
        <Link href="/" className={cls("biblioteca")} onClick={close} tabIndex={open ? 0 : -1}>
          Biblioteca
        </Link>
        <Link href="/salon" className={cls("salon")} onClick={close} tabIndex={open ? 0 : -1}>
          Salón de la Fama
        </Link>
        <Link href="/acceso" className={cls("acceso")} onClick={close} tabIndex={open ? 0 : -1}>
          {ready && user ? "Cuenta" : "Iniciar Sesión"}
        </Link>
        <div style={{ flex: 1 }}></div>
        <div className="pixel" style={{ fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.16em" }}>
          CRÉDITOS · 03
        </div>
      </aside>
    </>
  );
}
