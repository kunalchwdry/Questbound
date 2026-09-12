"use client";

import { CLASSES } from "@/lib/game";
import type { Profile } from "@/lib/types";
import { AiSettings } from "./AiSettings";

type Toast = (t: {
  title: string;
  body?: string;
  variant?: "default" | "success" | "danger" | "gold" | "info";
}) => void;

export function SettingsHall({
  profile,
  onEditHero,
  onLogout,
  toast,
}: {
  profile: Profile;
  onEditHero: () => void;
  onLogout: () => void;
  toast: Toast;
}) {
  const cls = CLASSES[profile.classKey];
  return (
    <div className="space-y-4">
      <AiSettings toast={toast} />

      <section className="panel p-5 sm:p-6" aria-labelledby="account-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel-2 text-xl">
              {cls?.icon ?? "🛡️"}
            </span>
            <div>
              <p className="eyebrow">Account · Hero ledger</p>
              <h2 id="account-title" className="mt-0.5 font-display text-lg font-bold text-gold-2">
                {profile.displayName}
              </h2>
              <p className="text-xs text-muted">
                {cls?.label ?? profile.classKey} · Level {profile.level} {profile.rank}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost" onClick={onEditHero}>
              Edit hero details
            </button>
            <button type="button" className="btn btn-danger" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
