"use client";
import Link from "next/link";
import { useState } from "react";
import {
  CATEGORIES,
  type BoardCategory,
  type HeroPublic,
  type Guild,
} from "@/lib/community-types";
import { useWorld } from "./WorldShell";
import {
  Avatar,
  Empty,
  ErrorState,
  Loading,
  Pager,
  useResource,
} from "./WorldUI";
const labels: Record<BoardCategory, string> = {
  overall: "Overall",
  weekly: "Weekly XP",
  monthly: "Monthly XP",
  streak: "Streaks",
  community: "Community",
  solvers: "Problem solvers",
  guilds: "Guilds",
};
const units: Record<BoardCategory, string> = {
  overall: "total XP",
  weekly: "quest XP",
  monthly: "quest XP",
  streak: "active-day streak",
  community: "reputation",
  solvers: "problems solved",
  guilds: "guild XP",
};
interface Board {
  heroes: HeroPublic[];
  guilds: (Guild & { rank: number; score: number })[];
  self: HeroPublic | null;
  hasMore: boolean;
  visible: boolean;
  period?: string;
}
export function RankingBoard() {
  const { user, act, busy } = useWorld();
  const [category, setCategory] = useState<BoardCategory>("community");
  const [page, setPage] = useState(0);
  const [calm, setCalm] = useState(false);
  const r = useResource<Board>(
    `/api/community/leaderboard?category=${category}&page=${page}`,
  );
  const board = r.data;
  const podium = page === 0 ? (board?.heroes.slice(0, 3) ?? []) : [];
  const list =
    page === 0 ? (board?.heroes.slice(3) ?? []) : (board?.heroes ?? []);
  return (
    <>
      <div className="w-breadcrumb">
        THE WORLD / <span>HALL OF HEROES</span>
      </div>
      <section className="w-ranking-intro">
        <div className="w-laurel" aria-hidden="true">
          ❧ ♛ ❧
        </div>
        <p className="w-eyebrow">GOOD DEEDS DESERVE A PLACE IN THE STORY</p>
        <h1>
          The Hall of Heroes<span>.</span>
        </h1>
        <p>
          Not who’s best. A little recognition for showing up
          <br className="w-desktop" /> and helping others find their way.
        </p>
      </section>
      <div className="w-ranking-settings">
        <label>
          <input
            type="checkbox"
            checked={calm}
            onChange={(e) => setCalm(e.target.checked)}
          />{" "}
          Quiet mode — hide competitive rankings
        </label>
        {category !== "guilds" && board && (
          <label>
            <input
              type="checkbox"
              checked={board.visible}
              disabled={busy}
              onChange={async (e) => {
                try {
                  await act({
                    action: "visibility",
                    visible: e.target.checked,
                  });
                  r.reload();
                } catch {}
              }}
            />{" "}
            Include me in ranking boards
          </label>
        )}
      </div>
      <nav className="w-board-tabs" aria-label="Leaderboard category">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            onClick={() => {
              setCategory(c);
              setPage(0);
            }}
          >
            {labels[c]}
          </button>
        ))}
      </nav>
      {calm ? (
        <Empty icon="☼" title="Your adventure. Your pace.">
          The ranking board is tucked away. Your progress and contributions
          still count.
          <br />
          <Link className="w-btn w-btn-primary" href="/guild">
            Back to your adventure →
          </Link>
        </Empty>
      ) : r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : !board ? (
        <Loading />
      ) : (
        <>
          {category !== "guilds" && (
            <>
              <div className="w-podium" aria-label="Top community heroes">
                {podium.map((h, i) => (
                  <Link
                    href={`/heroes/${h.id}`}
                    key={h.id}
                    className={`w-podium-hero place-${i + 1}`}
                  >
                    <div className="w-podium-rank">
                      <span>{i === 0 ? "♛" : "✧"}</span> {h.rank}
                    </div>
                    <Avatar
                      name={h.display_name}
                      classKey={h.class_key}
                      large
                    />
                    <h2>{h.display_name}</h2>
                    <p>
                      Level {h.level} · {h.class_key}
                    </p>
                    <strong className="w-podium-score">
                      {h.score?.toLocaleString()}
                    </strong>
                    <span className="w-score-label">{units[category]}</span>
                    <div className="w-podium-deeds">
                      <span>☼ {h.helpful} helpful answers</span>
                      <span>✓ {h.solved} problems solved</span>
                    </div>
                    <div className="w-podium-base">
                      {h.guild_name
                        ? `⚑ ${h.guild_name}`
                        : "An independent adventurer"}
                      <span>View character sheet ↗</span>
                    </div>
                  </Link>
                ))}
              </div>
              {board.self && (
                <section className="w-your-rank" aria-label="Your position">
                  <span className="w-your-star" aria-hidden="true">
                    ✦
                  </span>
                  <div>
                    <p className="w-eyebrow">YOUR CHAPTER IN THE STORY</p>
                    <h3>
                      #{board.self.rank} {board.self.display_name}
                    </h3>
                    <p>
                      {board.self.score?.toLocaleString()} {units[category]} ·{" "}
                      {board.self.helpful} helpful answers
                    </p>
                  </div>
                  <div className="w-rank-movement" role="status">
                    {board.self.movement !== null &&
                    board.self.movement !== undefined &&
                    board.self.movement > 0 ? (
                      <>
                        <strong>↑ {board.self.movement} positions</strong>
                        <span>since your previous daily snapshot</span>
                      </>
                    ) : (
                      <span>Every useful step counts.</span>
                    )}
                    {board.self.best && <strong>✧ New personal best</strong>}
                  </div>
                </section>
              )}
              <div className="w-ranking-list">
                <div className="w-ranking-list-label">
                  <span>THE ADVENTURERS</span>
                  <span>{units[category].toUpperCase()}</span>
                </div>
                {list.map((h) => (
                  <Link
                    key={h.id}
                    href={`/heroes/${h.id}`}
                    className={`w-rank-row ${h.id === user.id ? "is-you" : ""}`}
                  >
                    <span className="w-rank-number">{h.rank}</span>
                    <Avatar name={h.display_name} classKey={h.class_key} />
                    <div className="w-rank-name">
                      <h3>
                        {h.display_name}{" "}
                        {h.id === user.id && <small>YOU</small>}
                      </h3>
                      <p>
                        Level {h.level} · {h.guild_name ?? h.class_key}
                      </p>
                      <div className="w-rank-details">
                        🔥 {h.streak} day streak{" "}
                        <span>☼ {h.helpful} helpful</span>
                        <span>✓ {h.solved} solved</span>
                        <span>{h.xp.toLocaleString()} XP</span>
                      </div>
                    </div>
                    <strong className="w-rank-score">
                      {h.score?.toLocaleString()}
                      <span>{units[category]}</span>
                    </strong>
                    <span className="w-rank-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </Link>
                ))}
              </div>
              {!board.heroes.length && (
                <Empty icon="♛" title="A hall with room to grow.">
                  Visible heroes will appear here as the community progresses.
                </Empty>
              )}
            </>
          )}
          {category === "guilds" && (
            <div className="w-guild-ranks">
              {board.guilds.map((g, i) => (
                <Link
                  key={g.id}
                  href={`/guilds?guild=${g.id}`}
                  className={`w-guild-rank ${i === 0 && page === 0 ? "first" : ""}`}
                >
                  <span className="w-rank-number">#{g.rank}</span>
                  <div className="w-guild-crest" aria-hidden="true">
                    {g.emblem}
                  </div>
                  <div>
                    <p className="w-eyebrow">LEVEL {g.level} GUILD</p>
                    <h2>{g.name}</h2>
                    <p>
                      {g.member_count} heroes · +{g.weekly_xp} XP this week
                    </p>
                  </div>
                  <strong>
                    {g.xp.toLocaleString()}
                    <span>Guild XP</span>
                  </strong>
                </Link>
              ))}
              {!board.guilds.length && (
                <Empty title="Raise the first banner." />
              )}
            </div>
          )}
          <Pager page={page} more={board.hasMore} onChange={setPage} />
        </>
      )}
      <div className="w-ranking-rules">
        <h3>☼ A fairer kind of recognition.</h3>
        <p>
          Overall uses existing server-maintained RPG XP. Weekly and monthly
          boards count completed-quest XP, on UTC weeks beginning Monday. Legacy
          bonus rewards were not timestamped and are not guessed.
        </p>
        <p>
          Helpful-answer reputation requires the question author’s endorsement.
          Solutions are accepted once. Established-account requirements, daily
          limits and unique reward records make farming less rewarding.
          Real-life task completion is still self-reported—not independently
          verified.
        </p>
        <p>
          Rank movement compares your server-captured daily visits, not
          fabricated live changes.
        </p>
      </div>
    </>
  );
}
