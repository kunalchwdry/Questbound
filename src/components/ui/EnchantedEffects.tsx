"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { usePathname } from "next/navigation";
import { usePrefersReducedMotion } from "@/lib/hooks";

const STORAGE_KEY = "questbound:magic";
const EVENT = "questbound:magic-preference";
let memoryPreference = true;
let storageAvailable = true;
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function readPreference() {
  if (!storageAvailable) return memoryPreference;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return memoryPreference;
  }
}
export function useMagicPreference() {
  return useSyncExternalStore(subscribe, readPreference, () => true);
}

/** Decorative only: never intercepts input, announces fake rewards or changes game state. */
export function EnchantedEffects() {
  const preference = useMagicPreference();
  const reduced = usePrefersReducedMotion();
  const enabled = preference && !reduced;
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    document.documentElement.dataset.magic = enabled ? "on" : "off";
    return () => {
      delete document.documentElement.dataset.magic;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fine = matchMedia("(pointer: fine)").matches;
    let width = innerWidth,
      height = innerHeight,
      frame = 0,
      last = 0,
      lastTrail = 0;
    type Spark = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      max: number;
      size: number;
    };
    const sparks: Spark[] = [];
    const rings: { x: number; y: number; life: number; power: number }[] = [];
    let castingTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCast = 0;
    const motes = Array.from({ length: fine ? 28 : 14 }, (_, i) => ({
      x: ((i * 137.508) % 100) / 100,
      y: ((i * 73.19) % 100) / 100,
      size: i % 3 === 0 ? 2 : 1,
      phase: i * 1.9,
    }));
    const resize = () => {
      width = innerWidth;
      height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const add = (x: number, y: number, burst: boolean) => {
      const count = burst ? 22 : 2;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        sparks.push({
          x,
          y,
          vx: burst ? Math.cos(angle) * 3.1 : -0.15,
          vy: burst ? Math.sin(angle) * 3.1 : -0.4,
          life: burst ? 34 : 20,
          max: burst ? 34 : 20,
          size: burst ? 2.8 : 1.7,
        });
      }
      if (sparks.length > 120) sparks.splice(0, sparks.length - 120);
    };
    const move = (event: PointerEvent) => {
      if (
        !fine ||
        event.pointerType === "touch" ||
        performance.now() - lastTrail < 45
      )
        return;
      // The wand wakes around interactive surfaces, not while reading or typing.
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("button,a,.w-hall-banner,.magic-portrait")
      )
        return;
      lastTrail = performance.now();
      add(event.clientX, event.clientY, false);
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>(
        "button:not(:disabled),a[href]",
      );
      if (!control || control.closest(".magic-toggle")) return;
      const box = control.getBoundingClientRect();
      add(
        event.detail ? event.clientX : box.x + box.width / 2,
        event.detail ? event.clientY : box.y + box.height / 2,
        true,
      );
    };
    const spell = (event: Event) => {
      if (performance.now() - lastCast < 450) return;
      lastCast = performance.now();
      const detail = (
        event as CustomEvent<{ x?: number; y?: number; power?: number }>
      ).detail;
      const x = Number.isFinite(detail?.x)
        ? Math.max(0, Math.min(width, detail!.x!))
        : width * 0.6;
      const y = Number.isFinite(detail?.y)
        ? Math.max(0, Math.min(height, detail!.y!))
        : height * 0.4;
      const power = detail?.power === 2 ? 2 : 1;
      rings.push({ x, y, life: 42, power });
      if (rings.length > 3) rings.shift();
      add(x, y, true);
      add(x + 16, y - 12, true);
      document.documentElement.dataset.magicCasting = "true";
      if (castingTimer) clearTimeout(castingTimer);
      castingTimer = setTimeout(() => {
        delete document.documentElement.dataset.magicCasting;
      }, 1400);
    };
    const paint = (now: number) => {
      frame = requestAnimationFrame(paint);
      if (now - last < 33) return; // 30fps maximum; no React renders in the animation loop.
      const delta = Math.min(2, (now - (last || now)) / 33);
      last = now;
      ctx.clearRect(0, 0, width, height);
      const t = now / 1000;
      for (const mote of motes) {
        const x = mote.x * width + Math.sin(t * 0.22 + mote.phase) * 22;
        const y =
          (mote.y * height - t * (4 + mote.size) + height * 100) % height;
        ctx.globalAlpha = 0.25 + (Math.sin(t * 0.8 + mote.phase) + 1) * 0.13;
        ctx.fillStyle = "#e7bd69";
        ctx.beginPath();
        ctx.arc(x, y, mote.size, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= delta;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.vy += 0.015 * delta;
        ctx.globalAlpha = (p.life / p.max) * 0.8;
        ctx.strokeStyle = "#e6b85e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - p.size, p.y);
        ctx.lineTo(p.x + p.size, p.y);
        ctx.moveTo(p.x, p.y - p.size);
        ctx.lineTo(p.x, p.y + p.size);
        ctx.stroke();
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.life -= delta;
        if (ring.life <= 0) {
          rings.splice(i, 1);
          continue;
        }
        const progress = 1 - ring.life / 42;
        const radius = (20 + progress * 66) * ring.power;
        ctx.save();
        ctx.translate(ring.x, ring.y);
        ctx.rotate(progress * 0.7);
        ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.8;
        ctx.strokeStyle = "#e4bd70";
        ctx.lineWidth = 1.4;
        for (const multiplier of [1, 0.83]) {
          ctx.beginPath();
          ctx.arc(0, 0, radius * multiplier, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([3, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.94, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let j = 0; j <= 6; j++) {
          const a = (j * Math.PI) / 3 - Math.PI / 2;
          const px = Math.cos(a) * radius * 0.69,
            py = Math.sin(a) * radius * 0.69;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.font = "15px Georgia";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f0cc85";
        for (let j = 0; j < 8; j++) {
          const a = (j * Math.PI) / 4;
          ctx.fillText(
            j % 2 ? "✧" : "✦",
            Math.cos(a) * radius * 1.15,
            Math.sin(a) * radius * 1.15,
          );
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      document.documentElement.dataset.magicPaused = String(document.hidden);
      if (!document.hidden) {
        last = 0;
        frame = requestAnimationFrame(paint);
      }
    };
    visibility();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("click", click);
    window.addEventListener("questbound:spell", spell);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("click", click);
      window.removeEventListener("questbound:spell", spell);
      if (castingTimer) clearTimeout(castingTimer);
      delete document.documentElement.dataset.magicCasting;
      document.removeEventListener("visibilitychange", visibility);
      delete document.documentElement.dataset.magicPaused;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !("IntersectionObserver" in window)) return;
    const seen = new WeakSet<Element>();
    const animated = new Set<Element>();
    let scheduled = 0;
    const selector =
      ".w-post,.w-guild-banner,.w-shared-quest,.w-rank-row,.w-podium-hero,.w-character-sheet,.w-code,.w-page-intro,.w-hall-banner,[data-magic-reveal]";
    const observer = new IntersectionObserver(
      (entries) => {
        let step = 0;
        for (const entry of entries)
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            element.style.setProperty(
              "--magic-delay",
              `${Math.min(step++, 4) * 65}ms`,
            );
            element.classList.add("magic-awaken");
            animated.add(element);
            observer.unobserve(element);
          }
      },
      { threshold: 0.08 },
    );
    const scan = () => {
      document.querySelectorAll(selector).forEach((element) => {
        if (!seen.has(element)) {
          seen.add(element);
          observer.observe(element);
        }
      });
    };
    scan();
    const changes = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        scan();
      });
    });
    changes.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      changes.disconnect();
      cancelAnimationFrame(scheduled);
      animated.forEach((element) => element.classList.remove("magic-awaken"));
    };
  }, [enabled, pathname]);

  return (
    <>
      {enabled && (
        <div className="magic-atmosphere" aria-hidden="true">
          <canvas ref={canvasRef} className="magic-dust" />
        </div>
      )}
      <button
        type="button"
        className="magic-toggle"
        aria-pressed={preference}
        aria-label={
          reduced
            ? "Magical effects disabled by your reduced-motion preference"
            : `Turn ${preference ? "off" : "on"} magical effects`
        }
        title={
          reduced
            ? "Your device requests reduced motion"
            : "Candlelight, drifting embers and enchanted entrances"
        }
        disabled={reduced}
        onClick={() => {
          memoryPreference = !preference;
          try {
            localStorage.setItem(STORAGE_KEY, preference ? "off" : "on");
          } catch {
            storageAvailable = false;
          }
          window.dispatchEvent(new Event(EVENT));
        }}
      >
        <span aria-hidden="true">{enabled ? "✧" : "☾"}</span>
        <span>
          {enabled ? "Magic on" : reduced ? "Calm mode" : "Magic off"}
        </span>
      </button>
    </>
  );
}

/** Light and embers laid over the actual signup artwork; no replacement scenery. */
export function EnchantedCeiling() {
  return (
    <div className="magic-ceiling" aria-hidden="true">
      <div className="candlelit-booklight" />
      <div className="candlelit-windowlight" />
      <div className="candlelit-embers">
        {Array.from({ length: 18 }, (_, i) => (
          <i
            key={i}
            style={
              {
                left: `${45 + ((i * 11.3) % 48)}%`,
                top: `${40 + ((i * 17.9) % 47)}%`,
                "--ember-delay": `${i * -0.65}s`,
                "--ember-duration": `${6 + (i % 5)}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
