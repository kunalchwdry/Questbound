"use client";
import Link from "next/link";
import type { HeroPublic } from "@/lib/community-types";
import {
  ATTRIBUTE_META,
  CLASSES,
  isClassKey,
  levelFromXp,
  rankForLevel,
  type Attribute,
} from "@/lib/game";
import { useWorld } from "./WorldShell";
import { Avatar, ErrorState, Loading, Meter, useResource } from "./WorldUI";
export function HeroSheet({ id }: { id: number }) {
  const r = useResource<HeroPublic>(`/api/community/hero?id=${id}`);
  const { user, act, busy } = useWorld();
  if (r.error) return <ErrorState error={r.error} retry={r.reload} />;
  if (!r.data) return <Loading />;
  const h = r.data;
  const progress = levelFromXp(h.xp);
  const cl = isClassKey(h.class_key) ? CLASSES[h.class_key] : CLASSES.knight;
  return (
    <>
      <div className="w-breadcrumb">
        THE WORLD / <span>A HERO’S CHARACTER SHEET</span>
      </div>
      <section className="w-character-sheet">
        <div className="w-character-banner">
          <span>✧ THE STORY SO FAR ✧</span>
          <span>
            {h.id === user.id ? "YOUR PUBLIC PROFILE" : "PUBLIC HERO PROFILE"}
          </span>
        </div>
        <div className="w-character-main">
          <div className="w-character-portrait">
            <div className="w-character-halo" aria-hidden="true" />
            <Avatar name={h.display_name} classKey={h.class_key} large />
            <span className="w-character-level">LEVEL {h.level}</span>
          </div>
          <div className="w-character-identity">
            <p className="w-eyebrow">
              {rankForLevel(h.level)} · {cl.label}
            </p>
            <h1>{h.display_name}</h1>
            <p>An everyday adventurer, writing their own story.</p>
            <div className="w-character-xp">
              <strong>{h.xp.toLocaleString()} XP</strong>
              <span>
                {Math.max(0, progress.xpForNext - progress.xpIntoLevel)} to the
                next level
              </span>
            </div>
            <Meter
              value={progress.xpIntoLevel}
              max={progress.xpForNext}
              label="Hero level progression"
            />
            {h.guild_name && (
              <Link
                className="w-character-guild"
                href={`/guilds?guild=${h.guild_id}`}
              >
                ⚑ {h.guild_name} <span>Visit guild →</span>
              </Link>
            )}
          </div>
        </div>
        <div className="w-character-deeds">
          <div>
            <span>🔥</span>
            <strong>{h.streak}</strong>
            <p>Day streak</p>
          </div>
          <div>
            <span>☼</span>
            <strong>{h.reputation}</strong>
            <p>Community reputation</p>
          </div>
          <div>
            <span>✧</span>
            <strong>{h.helpful}</strong>
            <p>Helpful answers</p>
          </div>
          <div>
            <span>✓</span>
            <strong>{h.solved}</strong>
            <p>Problems solved</p>
          </div>
        </div>
        <div className="w-character-attributes">
          <div>
            <p className="w-eyebrow">BUILT ONE REAL-LIFE QUEST AT A TIME</p>
            <h2>Six ways to grow.</h2>
            <p>
              Different strengths.
              <br />
              One whole person.
            </p>
          </div>
          <dl>
            {h.attributes?.map((a) => (
              <div key={a.key}>
                <dt>
                  <span>{ATTRIBUTE_META[a.key as Attribute]?.icon}</span>
                  {ATTRIBUTE_META[a.key as Attribute]?.label ?? a.key}
                </dt>
                <dd>
                  <strong>Lv. {a.level}</strong>
                  <small>{a.xp.toLocaleString()} XP</small>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="w-character-footer">
          <p>
            Only the public character sheet is shared.
            <br />
            Tasks, journals, email and account details stay private.
          </p>
          {h.id === user.id ? (
            <Link href="/guild" className="w-btn w-btn-primary">
              Continue your adventure →
            </Link>
          ) : (
            <button
              className="w-text-btn"
              disabled={busy}
              onClick={async () => {
                try {
                  await act({ action: "block", userId: h.id, blocked: true });
                  r.reload();
                } catch {}
              }}
            >
              Block this hero
            </button>
          )}
        </div>
      </section>
    </>
  );
}
