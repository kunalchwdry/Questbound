"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CLASSES, CLASS_KEYS, ATTRIBUTE_META, type ClassKey } from "@/lib/game";
import { loginSchema, signupSchema } from "@/lib/validation";

type Mode = "login" | "signup";

interface Props {
  mode: Mode;
}

type FieldErrors = Partial<Record<"email" | "password" | "displayName" | "classKey", string>>;

export function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [classKey, setClassKey] = useState<ClassKey>("knight");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignup = mode === "signup";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormInfo(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const payload = isSignup
      ? { email, password, displayName, classKey, timezone }
      : { email, password, timezone };
    const schema = isSignup ? signupSchema : loginSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        confirmRequired?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setFormError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      if (isSignup && data.confirmRequired) {
        setFormInfo(
          data.message ??
            "Account created — check your inbox and confirm your email, then sign in.",
        );
        setLoading(false);
        return;
      }
      router.push("/guild");
      router.refresh();
    } catch {
      setFormError("We couldn't reach the guild. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby={formError ? "form-error" : undefined}>
      {formError && (
        <div
          id="form-error"
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger"
        >
          {formError}
        </div>
      )}
      {formInfo && (
        <div
          role="status"
          className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold-2"
        >
          {formInfo}
        </div>
      )}

      {isSignup && (
        <div>
          <label htmlFor="displayName" className="mb-1.5 block text-sm font-bold">
            Hero name
          </label>
          <input
            id="displayName"
            name="displayName"
            className="input"
            autoComplete="nickname"
            placeholder="e.g. Rowan the Unfinished"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={Boolean(errors.displayName)}
            aria-describedby={errors.displayName ? "displayName-error" : undefined}
            maxLength={40}
            required
          />
          {errors.displayName && (
            <p id="displayName-error" className="mt-1 text-xs font-semibold text-danger">
              {errors.displayName}
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-bold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          className="input"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          required
        />
        {errors.email && (
          <p id="email-error" className="mt-1 text-xs font-semibold text-danger">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-bold">
            Password
          </label>
          <button
            type="button"
            className="text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
            onClick={() => setShowPassword((s) => !s)}
            aria-pressed={showPassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          className="input"
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "At least 8 characters" : "Your password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : isSignup ? "password-hint" : undefined}
          minLength={isSignup ? 8 : 1}
          required
        />
        {errors.password ? (
          <p id="password-error" className="mt-1 text-xs font-semibold text-danger">
            {errors.password}
          </p>
        ) : (
          isSignup && (
            <p id="password-hint" className="mt-1 text-xs text-muted">
              Secured by Supabase Auth — hashed and salted. We never see it.
            </p>
          )
        )}
      </div>

      {isSignup && (
        <fieldset>
          <legend className="mb-2 block text-sm font-bold">Choose your class</legend>
          <p className="mb-3 text-xs text-muted">
            Purely a starting flavour: your class earns +15% XP on its favoured attribute.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CLASS_KEYS.map((key) => {
              const c = CLASSES[key];
              return (
                <div key={key} className="relative">
                  <input
                    type="radio"
                    id={`class-${key}`}
                    name="classKey"
                    value={key}
                    className="peer sr-only"
                    checked={classKey === key}
                    onChange={() => setClassKey(key)}
                  />
                  <label
                    htmlFor={`class-${key}`}
                    className="flex h-full cursor-pointer flex-col items-center gap-1 rounded-xl border border-line bg-panel-2 px-2 py-3 text-center transition-all hover:border-line-strong peer-checked:border-gold peer-checked:bg-gold/10 peer-checked:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold)_25%,transparent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-2"
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
      )}

      <button type="submit" className="btn btn-primary w-full text-base" disabled={loading} aria-busy={loading}>
        {loading ? "Opening the ledger…" : isSignup ? "Create my hero" : "Enter the guild"}
      </button>

      <p className="text-center text-sm text-muted">
        {isSignup ? (
          <>
            Already have a hero?{" "}
            <Link href="/login" className="font-bold text-gold-2 underline-offset-2 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to the guild?{" "}
            <Link href="/signup" className="font-bold text-gold-2 underline-offset-2 hover:underline">
              Create a hero
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
