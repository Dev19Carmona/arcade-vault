"use client";

import { useEffect, useRef } from "react";

// Revela los descendientes `.reveal` del elemento al que se asigne el ref,
// añadiéndoles `.in` cuando entran en pantalla.
//
// El contenido solo se oculta (clase `reveal-armed` en la raíz) después de que
// este efecto corre, de modo que sin JS o si el hook falla todo queda visible.
// Con `prefers-reduced-motion: reduce` no se oculta nada: todo queda en `.in`.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    const showAll = () => items.forEach((el) => el.classList.add("in"));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      showAll();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    root.classList.add("reveal-armed");
    items.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      root.classList.remove("reveal-armed");
    };
  }, []);

  return ref;
}
