"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Profile } from "@/lib/types";

export function BossBattle({
  profile,
  claiming,
  onClaim,
}: {
  profile: Profile;
  claiming: boolean;
  onClaim: () => void;
}) {
  const { boss } = profile;
  const remaining = Math.max(0, boss.hp - boss.damage);
  const pct = Math.round((boss.damage / boss.hp) * 100);

  return (
    <section className="panel panel-gilded relative overflow-hidden p-4 sm:p-5" aria-labelledby="boss-title">
      <div
        className="pointer-events-none absolute -right-6 -top-6 text-[7rem] opacity-[0.07]"
        aria-hidden="true"
      >
        {boss.icon}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`grid h-14 w-14 flex-none place-items-center rounded-2xl border border-line-strong bg-panel-2 text-3xl ${
              boss.defeated ? "grayscale" : "boss-idle"
            }`}
            aria-hidden="true"
          >
            {boss.icon}
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Weekly boss · {boss.weekKey}</p>
            <h3 id="boss-title" className="mt-0.5 truncate font-display text-lg font-bold">
              {boss.name}
            </h3>
            <p className="text-xs italic text-muted">&ldquo;{boss.taunt}&rdquo;</p>
          </div>
        </div>
        {boss.claimed ? (
          <span className="chip border-gold text-gold-2">Slain ✓</span>
        ) : boss.defeated ? (
          <button type="button" className="btn btn-primary" onClick={onClaim} disabled={claiming} aria-busy={claiming}>
            Claim the bounty
          </button>
        ) : (
          <span className="chip">{remaining} HP left</span>
        )}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-muted">
          <span>Every XP you earn this week is damage</span>
          <span className="tabular-nums">
            {boss.damage} / {boss.hp} · {pct}%
          </span>
        </div>
        <ProgressBar
          value={boss.damage}
          max={boss.hp}
          label={`Boss damage ${boss.damage} of ${boss.hp}`}
          color="linear-gradient(90deg, var(--danger), var(--ember))"
        />
        <p className="mt-1.5 text-[11px] text-muted">
          Reward: <strong className="text-gold-2">+{boss.gold} gold</strong> ·{" "}
          <strong className="text-xp-2">+{boss.xp} XP</strong>. A new boss rises every Monday.
        </p>
      </div>
    </section>
  );
}
