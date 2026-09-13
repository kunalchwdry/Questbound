"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { Guild, GuildDetail, HeroPublic } from "@/lib/community-types";
import { useWorld } from "./WorldShell";
import {
  Empty,
  ErrorState,
  HeroLink,
  Loading,
  Meter,
  Pager,
  useDebounced,
  useResource,
} from "./WorldUI";
import { SharedQuestCard, SharedQuestForm } from "./SharedQuests";
export function GuildDirectory() {
  const { act, busy } = useWorld();
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [page, setPage] = useState(0);
  const r = useResource<{ guilds: Guild[]; hasMore: boolean }>(
    `/api/community/guilds?q=${encodeURIComponent(q)}&page=${page}`,
  );
  const close = useCallback(() => setCreating(false), []);
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get("guild"));
    if (id > 0) {
      const t = setTimeout(() => setSelected(id), 0);
      return () => clearTimeout(t);
    }
  }, []);
  if (selected)
    return (
      <GuildRoom
        key={selected}
        id={selected}
        back={() => {
          setSelected(null);
          r.reload();
        }}
      />
    );
  return (
    <>
      <div className="w-breadcrumb">
        THE WORLD / <span>GUILDS</span>
      </div>
      <section className="w-page-intro">
        <div>
          <p className="w-eyebrow">FIND YOUR PARTY</p>
          <h1>
            Better, together<span>.</span>
          </h1>
          <p>
            Different heroes. A shared direction.
            <br />
            Find the people who make showing up a little easier.
          </p>
        </div>
        <div className="w-heraldry" aria-hidden="true">
          ⚑<span>ONE GUILD. MANY SMALL VICTORIES.</span>
        </div>
      </section>
      <div className="w-section-heading">
        <h2>The guild registry</h2>
        <button
          className="w-btn w-btn-primary"
          onClick={() => setCreating(true)}
        >
          ＋ Found a guild
        </button>
      </div>
      <label className="w-search w-search-wide">
        <span aria-hidden="true">⌕</span>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Find a guild by name…"
          aria-label="Search guilds"
        />
      </label>
      {r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Loading />
      ) : (
        <>
          <div className="w-guild-grid">
            {r.data.guilds.map((g) => (
              <article className="w-guild-banner" key={g.id}>
                <div className="w-guild-banner-top">
                  <span>
                    {g.visibility === "public" ? "OPEN DOORS" : "BY INVITATION"}
                  </span>
                  {g.role && <b>YOUR GUILD</b>}
                </div>
                <div className="w-guild-crest" aria-hidden="true">
                  {g.emblem}
                </div>
                <span className="w-eyebrow">LEVEL {g.level} GUILD</span>
                <h2>{g.name}</h2>
                <p>
                  {g.description ||
                    g.motto ||
                    "A gathering of heroes, building a better everyday."}
                </p>
                <dl>
                  <div>
                    <dt>Guildmates</dt>
                    <dd>{g.member_count}</dd>
                  </div>
                  <div>
                    <dt>This week</dt>
                    <dd>+{g.weekly_xp.toLocaleString()} XP</dd>
                  </div>
                </dl>
                <Meter
                  value={g.xp % 500}
                  max={500}
                  label="Guild level progress"
                />
                <button className="w-btn" onClick={() => setSelected(g.id)}>
                  {g.role ? "Enter your guild" : "Visit the guild"} →
                </button>
              </article>
            ))}
          </div>
          {!r.data.guilds.length && (
            <Empty icon="⚑" title="A banner waiting to be raised.">
              No guilds match your search. You can start a small party of your
              own.
            </Empty>
          )}
          <Pager page={page} more={r.data.hasMore} onChange={setPage} />
        </>
      )}
      <div className="w-guild-footnote">
        <span>☼</span>
        <div>
          <h3>A guild is a commitment, not a competition.</h3>
          <p>
            Join one guild at a time. Complete real-life quests together. Leave
            whenever your path changes.
          </p>
        </div>
      </div>
      <Dialog open={creating} onClose={close} title="Raise your guild’s banner">
        <form
          className="w-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              const g = await act({
                action: "createGuild",
                name: String(f.get("name")),
                description: String(f.get("description")),
                visibility: f.get("visibility") as "public" | "invite_only",
              });
              setCreating(false);
              setSelected(g.id!);
              r.reload();
            } catch {}
          }}
        >
          <label>
            Guild name
            <input
              name="name"
              required
              minLength={3}
              maxLength={60}
              placeholder="The Steady Coders"
            />
          </label>
          <label>
            What brings you together?
            <textarea
              name="description"
              maxLength={1500}
              rows={3}
              placeholder="Who is this guild for? What will you work on?"
            />
          </label>
          <label>
            Who can join?
            <select name="visibility">
              <option value="public">Open to everyone</option>
              <option value="invite_only">By invitation</option>
            </select>
          </label>
          <p className="w-muted">
            You’ll be the owner. Owners can appoint moderators and transfer
            ownership. One guild per hero.
          </p>
          <button className="w-btn w-btn-primary" disabled={busy}>
            Found the guild →
          </button>
        </form>
      </Dialog>
    </>
  );
}
function GuildRoom({ id, back }: { id: number; back: () => void }) {
  const r = useResource<GuildDetail>(`/api/community/guild?id=${id}`);
  const { act, busy, user } = useWorld();
  const [showQuest, setShowQuest] = useState(false);
  const [invite, setInvite] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [roleTarget, setRoleTarget] = useState<number | null>(null);
  if (r.error)
    return (
      <>
        <button className="w-text-btn" onClick={back}>
          ← Guild registry
        </button>
        <ErrorState error={r.error} retry={r.reload} />
      </>
    );
  if (!r.data) return <Loading />;
  const { guild: g, members, quests } = r.data;
  const manager = ["owner", "moderator"].includes(g.role ?? "");
  return (
    <>
      <button className="w-text-btn" onClick={back}>
        ← Guild registry
      </button>
      <section className="w-guild-room-header">
        <div className="w-guild-crest" aria-hidden="true">
          {g.emblem}
        </div>
        <div>
          <p className="w-eyebrow">
            LEVEL {g.level} GUILD · {g.member_count} GUILDMATES
          </p>
          <h1>{g.name}</h1>
          <p>{g.description || "A shared quest starts with showing up."}</p>
          <div className="w-actions">
            {g.role ? (
              <>
                <Link
                  className="w-btn w-btn-primary"
                  href={`/community?guild=${id}`}
                >
                  Gather around the fire →
                </Link>
                {manager && (
                  <button className="w-btn" onClick={() => setInvite(!invite)}>
                    Invite a hero
                  </button>
                )}
                <button
                  className="w-text-btn"
                  onClick={() => setLeaving(!leaving)}
                >
                  Leave guild
                </button>
              </>
            ) : g.visibility === "public" ? (
              <button
                className="w-btn w-btn-primary"
                disabled={busy}
                onClick={async () => {
                  try {
                    await act({ action: "joinGuild", id });
                    r.reload();
                  } catch {}
                }}
              >
                Join this guild →
              </button>
            ) : (
              <p className="w-muted">
                This guild is invitation-only. Invitations arrive in your
                postbox.
              </p>
            )}
          </div>
        </div>
        <div className="w-guild-total">
          <span>GUILD XP</span>
          <strong>{g.xp.toLocaleString()}</strong>
          <small>+{g.weekly_xp} this week</small>
        </div>
      </section>
      {leaving && (
        <div className="w-confirm">
          <p>
            {g.role === "owner"
              ? "Before leaving, transfer ownership using a guildmate’s role control below."
              : "Leave this guild? Your past contributions remain in its history."}
          </p>
          <div className="w-actions">
            {g.role !== "owner" && (
              <button
                className="w-btn"
                disabled={busy}
                onClick={async () => {
                  try {
                    await act({ action: "leaveGuild", id });
                    setLeaving(false);
                    r.reload();
                  } catch {}
                }}
              >
                Confirm leaving
              </button>
            )}
            <button className="w-text-btn" onClick={() => setLeaving(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {invite && <InviteForm guildId={id} onDone={() => setInvite(false)} />}
      {g.role ? (
        <div className="w-guild-room-grid">
          <section>
            <div className="w-section-heading">
              <h2>The shared quest board</h2>
              {manager && (
                <button
                  className="w-text-btn"
                  onClick={() => setShowQuest(!showQuest)}
                >
                  ＋ New quest
                </button>
              )}
            </div>
            {showQuest && (
              <SharedQuestForm
                guildId={id}
                onDone={() => {
                  setShowQuest(false);
                  r.reload();
                }}
              />
            )}
            <p className="w-muted w-board-explainer">
              Enroll, then complete matching quests in your adventure. Each
              completion advances your oldest eligible guild quest. Progress
              can’t be entered manually.
            </p>
            {quests.map((q) => (
              <SharedQuestCard key={q.id} quest={q} guild reload={r.reload} />
            ))}
            {!quests.length && (
              <Empty title="Your first shared adventure awaits.">
                {manager
                  ? "Create a weekly goal your guildmates can work toward."
                  : "Your owner or moderators can create the next guild quest."}
              </Empty>
            )}
          </section>
          <aside className="w-roster">
            <div className="w-section-heading">
              <h2>The party</h2>
              <span>{g.member_count} heroes</span>
            </div>
            {members.map((m) => (
              <div className="w-roster-member" key={m.id}>
                <HeroLink
                  id={m.id}
                  name={m.display_name}
                  classKey={m.class_key}
                  subtitle={`Level ${m.level} · ${m.role} · ${m.contribution_xp} contribution XP`}
                />
                {g.role === "owner" && m.id !== user.id && (
                  <button
                    className="w-text-btn"
                    onClick={() =>
                      setRoleTarget(roleTarget === m.id ? null : m.id)
                    }
                  >
                    Role
                  </button>
                )}
                {roleTarget === m.id && (
                  <form
                    className="w-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      try {
                        await act({
                          action: "role",
                          guildId: id,
                          userId: m.id,
                          role: f.get("role") as
                            | "owner"
                            | "moderator"
                            | "member",
                        });
                        setRoleTarget(null);
                        r.reload();
                      } catch {}
                    }}
                  >
                    <label>
                      New role for {m.display_name}
                      <select name="role" defaultValue={m.role}>
                        <option value="member">Member</option>
                        <option value="moderator">Moderator</option>
                        <option value="owner">Transfer ownership</option>
                      </select>
                    </label>
                    <p className="w-muted">
                      Transferring ownership makes you a moderator.
                    </p>
                    <button className="w-btn" disabled={busy}>
                      Confirm role change
                    </button>
                  </form>
                )}
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <Empty icon="⚑" title="Meet your next adventure.">
          Join to see the party, shared quests and members-only discussions.
        </Empty>
      )}
    </>
  );
}
function InviteForm({
  guildId,
  onDone,
}: {
  guildId: number;
  onDone: () => void;
}) {
  const { act, busy } = useWorld();
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const r = useResource<{ heroes: HeroPublic[] }>(
    `/api/community/search-heroes?q=${encodeURIComponent(q)}`,
  );
  return (
    <section className="w-invite-form">
      <h3>Invite a hero</h3>
      <label className="w-search">
        <input
          aria-label="Search heroes by display name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by hero name (at least 2 letters)…"
        />
      </label>
      {r.error && <ErrorState error={r.error} retry={r.reload} />}
      <div className="w-invite-results">
        {r.data?.heroes.map((h) => (
          <div className="w-notice" key={h.id}>
            <HeroLink id={h.id} name={h.display_name} classKey={h.class_key} />
            <button
              className="w-btn"
              disabled={busy}
              onClick={async () => {
                try {
                  await act({ action: "invite", guildId, userId: h.id });
                  onDone();
                } catch {}
              }}
            >
              Invite
            </button>
          </div>
        ))}
      </div>
      <button className="w-text-btn" onClick={onDone}>
        Close invitations
      </button>
    </section>
  );
}
