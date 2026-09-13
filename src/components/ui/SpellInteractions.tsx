"use client";
import { useEffect } from "react";

/** Pointer-only 3D card response, with no pointer capture or React frame updates. */
export function SpellInteractions({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    let card: HTMLElement | null = null,
      frame = 0,
      x = 0,
      y = 0;
    const reset = () => {
      if (card) {
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
        card.removeAttribute("data-spell-hover");
      }
      card = null;
    };
    const move = (e: PointerEvent) => {
      const target =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>(
              ".w-guild-banner,.w-post-featured,.w-podium-hero,.w-shared-quest,.w-character-sheet",
            )
          : null;
      if (target !== card) {
        reset();
        card = target;
      }
      if (!card) return;
      x = e.clientX;
      y = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!card) return;
        const r = card.getBoundingClientRect();
        const dx = (x - r.x) / r.width - 0.5,
          dy = (y - r.y) / r.height - 0.5;
        card.style.setProperty("--tilt-x", `${-dy * 5}deg`);
        card.style.setProperty("--tilt-y", `${dx * 6}deg`);
        card.style.setProperty("--spell-x", `${x - r.x}px`);
        card.style.setProperty("--spell-y", `${y - r.y}px`);
        card.dataset.spellHover = "true";
      });
    };
    const leave = () => reset();
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      cancelAnimationFrame(frame);
      reset();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, [enabled]);
  return null;
}
