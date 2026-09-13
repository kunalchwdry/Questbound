"use client";
import { SpellButton } from "@/components/ui/SpellButton";
import { EnchantedCeiling } from "@/components/ui/EnchantedEffects";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { POST_TYPES, type Post, type PostType } from "@/lib/community-types";
import { levelFromXp } from "@/lib/game";
import { formatRelativeTime } from "@/lib/dates";
import { useWorld } from "./WorldShell";
import {
  HeroLink,
  Empty,
  ErrorState,
  Loading,
  Pager,
  useDebounced,
  useResource,
} from "./WorldUI";
import { Discussion } from "./Discussion";
export const TYPE_LABELS: Record<PostType, string> = {
  help: "Help & problems",
  question: "Questions",
  discussion: "Discussions",
  achievement: "Achievements",
  tip: "Tips & wisdom",
  goal: "Goals",
  challenge: "Challenges",
};
const ICONS: Record<PostType, string> = {
  help: "⚑",
  question: "?",
  discussion: "☷",
  achievement: "✦",
  tip: "☼",
  goal: "◎",
  challenge: "⚔",
};
export function CommunityHall() {
  const { meta, act, busy } = useWorld();
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [sort, setSort] = useState("new");
  const [saved, setSaved] = useState(false);
  const [solved, setSolved] = useState(false);
  const [page, setPage] = useState(0);
  const [compose, setCompose] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [guild, setGuild] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const id = Number(p.get("post"));
    const t = setTimeout(() => {
      if (id > 0) setSelected(id);
      if (p.get("guild")) setGuild(p.get("guild")!);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const resource = useResource<{ posts: Post[]; hasMore: boolean }>(
    `/api/community/posts?${new URLSearchParams({ type, q, sort, saved: String(saved), solved: String(solved), page: String(page), guild })}`,
  );
  const reload = resource.reload;
  const closeCompose = useCallback(() => setCompose(false), []);
  const closeThread = useCallback(() => {
    setSelected(null);
    reload();
  }, [reload]);
  const save = async (postId: number) => {
    try {
      await act({ action: "save", postId });
      resource.reload();
    } catch {}
  };
  return (
    <>
      <div className="w-breadcrumb">
        THE WORLD / <span>THE GUILD HALL</span>
        <span className="w-edition">A place to grow, together</span>
      </div>
      <section className="w-hall-banner">
        <EnchantedCeiling />
        <div className="w-banner-copy">
          <p className="w-eyebrow">
            <span className="w-live-dot" /> THE FIRE IS LIT. COME ON IN.
          </p>
          <h1>
            No hero journeys
            <br />
            alone<span>.</span>
          </h1>
          <p>
            A question, a small victory, a little wisdom.
            <br className="w-desktop" /> Bring it to the hall. Leave a little
            stronger.
          </p>
          <button
            className="w-btn w-btn-primary"
            onClick={() => setCompose(true)}
          >
            <span>＋</span> Post to the guild
          </button>
          <SpellButton />
        </div>
        <div
          className="w-hall-artwork"
          role="img"
          aria-label="A glowing guild ledger on a candlelit desk beneath a starry window, matching the signup artwork"
        />
        <span className="w-banner-stamp">
          THE GUILD HALL
          <br />
          <b>EST. FOR EVERYONE</b>
        </span>
      </section>
      <div className="w-hall-grid">
        <section className="w-noticeboard" aria-label="Community noticeboard">
          <div className="w-section-heading">
            <div>
              <span className="w-eyebrow">NOTES FROM FELLOW ADVENTURERS</span>
              <h2>
                The noticeboard <span>↙</span>
              </h2>
            </div>
            <button
              className="w-text-btn"
              onClick={resource.reload}
              aria-label="Refresh noticeboard"
            >
              ↻ Refresh
            </button>
          </div>
          <div className="w-search-row">
            <label className="w-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search posts and tags"
                placeholder="Find a question, a topic, a little inspiration…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="w-sort">
              <span className="sr-only">Sort posts</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(0);
                }}
              >
                <option value="new">Newest first</option>
                <option value="active">Recently active</option>
                <option value="unanswered">Fewest replies</option>
              </select>
            </label>
          </div>
          <div className="w-filters" aria-label="Post types">
            {["all", ...POST_TYPES].map((t) => (
              <button
                key={t}
                className="w-chip"
                aria-pressed={type === t}
                onClick={() => {
                  setType(t);
                  setPage(0);
                }}
              >
                {t === "all" ? "All scrolls" : TYPE_LABELS[t as PostType]}
              </button>
            ))}
          </div>
          <div className="w-subfilters">
            <label>
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => {
                  setSaved(e.target.checked);
                  setPage(0);
                }}
              />{" "}
              My saved scrolls
            </label>
            <label>
              <input
                type="checkbox"
                checked={solved}
                onChange={(e) => {
                  setSolved(e.target.checked);
                  setPage(0);
                }}
              />{" "}
              Solved
            </label>
            {guild && (
              <button
                className="w-text-btn"
                onClick={() => {
                  setGuild("");
                  setPage(0);
                }}
              >
                Guild discussion ×
              </button>
            )}
          </div>
          {resource.error ? (
            <ErrorState error={resource.error} retry={resource.reload} />
          ) : !resource.data ? (
            <Loading />
          ) : (
            <>
              {!resource.data.posts.length && (
                <Empty icon="⚑" title="There’s room for your story.">
                  {search || type !== "all" || saved
                    ? "No scrolls match these filters. Try a different topic."
                    : "Ask for help, share a useful tip, or celebrate a step forward."}
                  <br />
                  <button
                    className="w-text-btn"
                    onClick={() => setCompose(true)}
                  >
                    Write the first scroll →
                  </button>
                </Empty>
              )}
              <div className="w-posts">
                {resource.data.posts.map((p, i) => (
                  <article
                    className={`w-post ${p.post_type === "help" ? "w-post-help" : ""} ${p.is_solved ? "w-post-solved" : ""} ${i === 0 ? "w-post-featured" : ""}`}
                    key={p.id}
                  >
                    <div className="w-post-marker" aria-hidden="true">
                      {ICONS[p.post_type]}
                    </div>
                    <div className="w-post-body">
                      <div className="w-post-top">
                        <span className="w-post-type">
                          {TYPE_LABELS[p.post_type]}
                        </span>
                        {p.is_solved && (
                          <span className="w-solved">
                            ✓ A way forward found
                          </span>
                        )}
                        {p.guild_name && (
                          <span className="w-guild-tag">⚑ {p.guild_name}</span>
                        )}
                      </div>
                      <button
                        className="w-post-title"
                        onClick={() => setSelected(p.id)}
                      >
                        {p.title}
                      </button>
                      <p className="w-post-excerpt">{p.content}</p>
                      <div className="w-tags">
                        {p.tags.map((t) => (
                          <button
                            key={t}
                            onClick={() => {
                              setSearch(t);
                              setPage(0);
                            }}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                      <div className="w-post-footer">
                        <HeroLink
                          id={p.author_id}
                          name={p.display_name}
                          classKey={p.class_key}
                          subtitle={`Level ${levelFromXp(p.xp).level} · ${formatRelativeTime(p.created_at)}`}
                        />
                        <div className="w-post-stats">
                          <button
                            className="w-text-btn"
                            onClick={() => setSelected(p.id)}
                            aria-label={`Open ${p.title}, ${p.comment_count} replies`}
                          >
                            ☏ {p.comment_count}
                            <span> replies</span>
                          </button>
                          <span title="Meaningful reactions">
                            ✧ {p.reaction_count}
                          </span>
                          <button
                            className="w-save"
                            aria-label={p.saved ? "Unsave post" : "Save post"}
                            aria-pressed={p.saved}
                            disabled={busy}
                            onClick={() => save(p.id)}
                          >
                            {p.saved ? "▣" : "▢"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <Pager
                page={page}
                more={resource.data.hasMore}
                onChange={setPage}
              />
            </>
          )}
        </section>
        <aside className="w-hall-aside">
          <div className="w-code">
            <span className="w-ornament">✥</span>
            <p className="w-eyebrow">THE GUILD CODE</p>
            <h3>
              Be the hero
              <br />
              someone needs.
            </h3>
            <ol>
              <li>
                <span>01</span>Ask with curiosity.
              </li>
              <li>
                <span>02</span>Share what actually helped.
              </li>
              <li>
                <span>03</span>Celebrate the small things.
              </li>
            </ol>
            <p>
              We’re here for real-life progress.
              <br />
              Not perfect highlight reels.
            </p>
          </div>
          <Link
            href={meta?.guild ? `/guilds?guild=${meta.guild.id}` : "/guilds"}
            className="w-aside-guild"
          >
            <span aria-hidden="true">⚑</span>
            <p className="w-eyebrow">YOUR NEXT ADVENTURE</p>
            <h3>{meta?.guild ? meta.guild.name : "Find your people."}</h3>
            <p>
              {meta?.guild
                ? "Your guildmates are on the same journey. See what you can accomplish together."
                : "A shared quest is a little easier with good company."}
            </p>
            <strong>
              {meta?.guild ? "Enter your guild" : "Explore the guilds"} →
            </strong>
          </Link>
          <div className="w-reputation-note">
            <h3>☼ Helpfulness, not popularity.</h3>
            <p>
              Useful answers and accepted solutions earn reputation. Posting
              more doesn’t.
            </p>
            <Link href="/leaderboard">Meet the community heroes →</Link>
          </div>
        </aside>
      </div>
      <Dialog
        open={compose}
        onClose={closeCompose}
        title="Leave a scroll at the hall"
        description="A little honesty goes a long way. What’s on your mind?"
        size="lg"
      >
        {compose && (
          <Composer
            initialGuild={guild ? Number(guild) : null}
            onDone={() => {
              setCompose(false);
              setPage(0);
              resource.reload();
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={selected !== null}
        onClose={closeThread}
        title="Around the guild fire"
        size="lg"
      >
        {selected !== null && (
          <Discussion key={selected} id={selected} onRemoved={closeThread} />
        )}
      </Dialog>
    </>
  );
}
export function Composer({
  onDone,
  initialGuild = null,
}: {
  onDone: () => void;
  initialGuild?: number | null;
}) {
  const { act, busy, meta } = useWorld();
  const [type, setType] = useState<PostType>("help");
  const [error, setError] = useState("");
  return (
    <form
      className="w-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          setError("");
          await act({
            action: "post",
            title: String(f.get("title")),
            content: String(f.get("content")),
            type,
            tried: String(f.get("tried") ?? ""),
            tags: String(f.get("tags") ?? "")
              .split(",")
              .map((x) => x.trim().toLowerCase().replace(/\s+/g, "-"))
              .filter(Boolean),
            guildId: f.get("guild") ? Number(f.get("guild")) : null,
          });
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to post.");
        }
      }}
    >
      <label>
        What kind of scroll?
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PostType)}
        >
          {POST_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {type === "help"
          ? "What’s blocking your progress?"
          : "Give your scroll a title"}
        <input
          name="title"
          required
          minLength={4}
          maxLength={160}
          placeholder={
            type === "help"
              ? "I’m struggling to stay consistent with…"
              : "One small step worth sharing…"
          }
        />
      </label>
      <label>
        {type === "help" ? "Tell the guild a little more" : "Your story"}
        <textarea
          name="content"
          required
          maxLength={8000}
          rows={5}
          placeholder="A little context helps people give you useful advice."
        />
      </label>
      {(type === "help" || type === "question") && (
        <label>
          What have you already tried? <small>Optional</small>
          <textarea
            name="tried"
            maxLength={2000}
            rows={2}
            placeholder="What worked, what didn’t, and where you’re stuck…"
          />
        </label>
      )}
      <div className="w-form-columns">
        <label>
          Tags <small>Up to 5, comma-separated</small>
          <input
            name="tags"
            placeholder="dsa, study, consistency"
            maxLength={124}
          />
        </label>
        <label>
          Share with
          <select name="guild" defaultValue={initialGuild ?? ""}>
            <option value="">The whole community</option>
            {meta?.guild && (
              <option value={meta.guild.id}>{meta.guild.name}</option>
            )}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="w-form-error">
          {error}
        </p>
      )}
      <div className="w-form-footer">
        <p>
          Useful beats perfect.
          <br />
          No XP for posting. Just good company.
        </p>
        <button className="w-btn w-btn-primary" disabled={busy}>
          {busy
            ? "Hanging your scroll…"
            : type === "help"
              ? "Ask the guild →"
              : "Post your scroll →"}
        </button>
      </div>
    </form>
  );
}
