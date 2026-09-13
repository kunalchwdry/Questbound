"use client";
import { useState } from "react";
import type { SharedQuest } from "@/lib/community-types";
import { Empty, ErrorState, Loading, Pager, useResource } from "./WorldUI";
import { SharedQuestCard, SharedQuestForm } from "./SharedQuests";
export function ChallengeBoard() {
  const [page, setPage] = useState(0);
  const [create, setCreate] = useState(false);
  const r = useResource<{
    challenges: SharedQuest[];
    hasMore: boolean;
    canCreate: boolean;
  }>(`/api/community/challenges?page=${page}`);
  return (
    <>
      <div className="w-breadcrumb">
        THE WORLD / <span>COMMUNITY CHALLENGES</span>
      </div>
      <section className="w-page-intro w-challenge-intro">
        <div>
          <p className="w-eyebrow">
            A THOUSAND SMALL STEPS. ONE SHARED VICTORY.
          </p>
          <h1>
            A quest bigger
            <br />
            than any one of us<span>.</span>
          </h1>
          <p>
            Read a page. Finish a session. Show up again.
            <br />
            Your everyday effort becomes part of something shared.
          </p>
        </div>
        <div className="w-challenge-art" aria-hidden="true">
          <span>⚔</span>
          <i>✦</i>
          <small>TOGETHER, WE ADVANCE</small>
        </div>
      </section>
      <div className="w-section-heading">
        <div>
          <span className="w-eyebrow">THE COMMUNITY QUEST BOARD</span>
          <h2>Answer the call.</h2>
        </div>
        <div className="w-actions">
          <button className="w-text-btn" onClick={r.reload}>
            ↻ Refresh progress
          </button>
          {r.data?.canCreate && (
            <button className="w-btn" onClick={() => setCreate(!create)}>
              ＋ New challenge
            </button>
          )}
        </div>
      </div>
      {create && (
        <SharedQuestForm
          onDone={() => {
            setCreate(false);
            r.reload();
          }}
        />
      )}
      <div className="w-challenge-guide">
        <span>
          <b>01</b> Join a challenge
        </span>
        <span>
          <b>02</b> Complete real-life quests
        </span>
        <span>
          <b>03</b> Share in the victory
        </span>
      </div>
      {r.error ? (
        <ErrorState error={r.error} retry={r.reload} />
      ) : !r.data ? (
        <Loading />
      ) : (
        <>
          <div className="w-challenge-grid">
            {r.data.challenges.map((q) => (
              <SharedQuestCard key={q.id} quest={q} reload={r.reload} />
            ))}
          </div>
          {!r.data.challenges.length && (
            <Empty icon="⚔" title="The next adventure is being written.">
              New community challenges will appear here. Your personal quests
              are always ready.
            </Empty>
          )}
          <Pager page={page} more={r.data.hasMore} onChange={setPage} />
        </>
      )}
      <p className="w-fair-play">
        ☼ Join before you contribute. Only future, server-recorded quest
        completions count. Active-day goals count at most once per UTC day;
        unique-hero goals count each contributor once.
      </p>
    </>
  );
}
