"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Profile } from "@/lib/types";

export function GuildContract({
  profile,
  claiming,
  onClaim,
}: {
  profile: Profile;
  claiming: boolean;
  onClaim: () => void;
}) {
  const { bounty } = profile;
  const ready = bounty.progress >= bounty.goal && !bounty.claimed;

  return (
    <section
      className="panel p-4 sm:p-5"
      aria-labelledby="contract-title"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Daily contract</p>
          <h3 id="contract-title" className="mt-1 font-display text-lg font-bold">
            Seal {bounty.goal} quests before dusk
          </h3>
          <p className="mt-1 text-sm text-muted">
            The guild treasurer pays{" "}
            <strong className="text-gold-2">+{bounty.gold} gold</strong> and{" "}
            <strong className="text-xp-2">+{bounty.xp} XP</strong> once a day.
            Resets at dawn in your time zone.
          </p>
        </div>
        {bounty.claimed ? (
          <span className="chip border-gold text-gold-2">Claimed today ✓</span>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || claiming}
            aria-busy={claiming}
            onClick={onClaim}
          >
            {ready ? "Claim bounty" : `${bounty.progress}/${bounty.goal} sealed`}
          </button>
        )}
      </div>
      <div className="mt-3">
        <ProgressBar
          value={bounty.progress}
          max={bounty.goal}
          label={`Guild contract ${bounty.progress} of ${bounty.goal}`}
          color="linear-gradient(90deg, var(--gold-deep), var(--gold-2))"
        />
      </div>
    </section>
  );
}
