"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import {
  ATTRIBUTE_META,
  CLASSES,
  CLASS_KEYS,
  type ClassKey,
} from "@/lib/game";
import type { Profile } from "@/lib/types";
import { profilePatchSchema } from "@/lib/validation";

export function HeroSettings({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (patch: { displayName: string; classKey: ClassKey }) => Promise<boolean>;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [classKey, setClassKey] = useState<ClassKey>(profile.classKey);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the existing local editor/tutorial when its external open signal changes.
    setDisplayName(profile.displayName);
    setClassKey(profile.classKey);
    setError(null);
    setSaving(false);
  }, [open, profile.displayName, profile.classKey]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = profilePatchSchema.safeParse({ displayName, classKey });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    const ok = await onSave({ displayName, classKey });
    setSaving(false);
    if (ok) onClose();
    else setError("The ledger didn't take the change. Try again.");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Hero ledger"
      description="Rename yourself or change class. Class affinity only affects future quests."
      initialFocusRef={nameRef}
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <div>
          <label htmlFor="hero-name" className="mb-1.5 block text-sm font-bold">
            Hero name
          </label>
          <input
            ref={nameRef}
            id="hero-name"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            required
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Class</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CLASS_KEYS.map((key) => {
              const c = CLASSES[key];
              return (
                <div key={key}>
                  <input
                    type="radio"
                    id={`set-class-${key}`}
                    name="settingsClass"
                    className="peer sr-only"
                    checked={classKey === key}
                    onChange={() => setClassKey(key)}
                  />
                  <label
                    htmlFor={`set-class-${key}`}
                    className="flex h-full cursor-pointer flex-col items-center gap-1 rounded-xl border border-line bg-panel-2 px-2 py-3 text-center transition-all hover:border-line-strong peer-checked:border-gold peer-checked:bg-gold/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-2"
                  >
                    <span aria-hidden="true" className="text-2xl">
                      {c.icon}
                    </span>
                    <span className="font-display text-sm font-bold">{c.label}</span>
                    <span className="text-[11px] text-muted">
                      +{ATTRIBUTE_META[c.affinity].label}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
        <p className="text-xs text-muted">Signed in as {profile.email}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
            Save the ledger
          </button>
        </div>
      </form>
    </Dialog>
  );
}
