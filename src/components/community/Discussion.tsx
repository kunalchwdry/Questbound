"use client";
import { useState } from "react";
import { type Post, type Comment, REACTIONS } from "@/lib/community-types";
import type { CommunityAction } from "@/lib/community-validation";
import { useWorld } from "./WorldShell";
import {
  HeroLink,
  Empty,
  ErrorState,
  Loading,
  Pager,
  useResource,
} from "./WorldUI";
import { formatRelativeTime } from "@/lib/dates";
const labels: Record<string, string> = {
  helpful: "☼ Helpful",
  motivating: "✦ Motivating",
  encouragement: "♡ Encouragement",
  learned_something: "✧ Learned something",
  relatable: "↔ Relatable",
};
export function Discussion({
  id,
  onRemoved,
}: {
  id: number;
  onRemoved: () => void;
}) {
  const { user, act, busy } = useWorld();
  const [page, setPage] = useState(0);
  const r = useResource<{
    post: Post;
    comments: Comment[];
    hasMore: boolean;
    canModerate: boolean;
  }>(`/api/community/discussion?id=${id}&page=${page}`);
  const [reply, setReply] = useState<Comment | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<number | "post" | null>(null);
  const [report, setReport] = useState<number | "post" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | "post" | null>(
    null,
  );
  const [error, setError] = useState("");
  const run = async (a: CommunityAction) => {
    try {
      setError("");
      await act(a);
      r.reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      return false;
    }
  };
  if (r.error) return <ErrorState error={r.error} retry={r.reload} />;
  if (!r.data) return <Loading />;
  const { post, comments, canModerate } = r.data;
  const canSolve =
    (post.author_id === user.id || canModerate) &&
    ["help", "question"].includes(post.post_type) &&
    !post.is_solved;
  const react = (
    reaction: (typeof REACTIONS)[number],
    commentId: number | null,
  ) => run({ action: "react", postId: id, commentId, reaction });
  return (
    <div className="w-thread">
      <div className="w-thread-heading">
        <span className="w-post-type">{post.post_type}</span>
        {post.is_solved && (
          <span className="w-solved">✓ Solution accepted</span>
        )}
        <h2>{post.title}</h2>
        <HeroLink
          id={post.author_id}
          name={post.display_name}
          classKey={post.class_key}
          subtitle={formatRelativeTime(post.created_at)}
        />
      </div>
      {editing === "post" ? (
        <form
          className="w-form w-inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await run({
                action: "editPost",
                id,
                title: String(f.get("title")),
                content: String(f.get("content")),
              })
            )
              setEditing(null);
          }}
        >
          <label>
            Title
            <input
              name="title"
              required
              minLength={4}
              maxLength={160}
              defaultValue={post.title}
            />
          </label>
          <label>
            Content
            <textarea
              name="content"
              required
              maxLength={8000}
              defaultValue={post.content}
            />
          </label>
          <div className="w-actions">
            <button className="w-btn w-btn-primary" disabled={busy}>
              Save changes
            </button>
            <button
              type="button"
              className="w-btn"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="w-prose">{post.content}</p>
      )}
      {post.tried && (
        <div className="w-tried">
          <strong>What I’ve already tried</strong>
          <p className="w-prose">{post.tried}</p>
        </div>
      )}
      <div className="w-reactions" aria-label="React to post">
        {REACTIONS.map((t) => (
          <button
            key={t}
            aria-pressed={post.reactions.includes(t)}
            disabled={busy || post.author_id === user.id}
            onClick={() => react(t, null)}
          >
            {labels[t]}
          </button>
        ))}
      </div>
      <div className="w-actions w-thread-tools">
        <button
          className="w-text-btn"
          disabled={busy}
          onClick={() => run({ action: "save", postId: id })}
        >
          {post.saved ? "▣ Saved" : "▢ Save for later"}
        </button>
        {post.author_id === user.id ? (
          <>
            <button className="w-text-btn" onClick={() => setEditing("post")}>
              Edit
            </button>
            <button
              className="w-text-btn"
              onClick={() => setConfirmDelete("post")}
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <button className="w-text-btn" onClick={() => setReport("post")}>
              Report privately
            </button>
            <button
              className="w-text-btn"
              disabled={busy}
              onClick={async () => {
                if (
                  await run({
                    action: "block",
                    userId: post.author_id,
                    blocked: true,
                  })
                )
                  onRemoved();
              }}
            >
              Block hero
            </button>
          </>
        )}
      </div>
      {confirmDelete !== null && (
        <div className="w-confirm" role="alert">
          <p>
            Remove {confirmDelete === "post" ? "this scroll" : "this response"}{" "}
            from the hall? Its history will be preserved.
          </p>
          <div className="w-actions">
            <button
              className="w-btn"
              disabled={busy}
              onClick={async () => {
                const isPost = confirmDelete === "post";
                if (
                  await run(
                    isPost
                      ? { action: "deletePost", id }
                      : {
                          action: "deleteComment",
                          id: confirmDelete as number,
                        },
                  )
                ) {
                  setConfirmDelete(null);
                  if (isPost) onRemoved();
                }
              }}
            >
              Yes, remove
            </button>
            <button
              className="w-text-btn"
              onClick={() => setConfirmDelete(null)}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
      {report !== null && (
        <form
          className="w-form w-inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await run({
                action: "report",
                postId: id,
                commentId: report === "post" ? null : report,
                reason: String(f.get("reason")),
                details: String(f.get("details")),
              })
            )
              setReport(null);
          }}
        >
          <label>
            Why are you reporting this?
            <select name="reason">
              <option>Spam or reward farming</option>
              <option>Harassment or hateful content</option>
              <option>Unsafe advice or other concern</option>
            </select>
          </label>
          <label>
            Additional context
            <textarea name="details" maxLength={2000} />
          </label>
          <div className="w-actions">
            <button className="w-btn" disabled={busy}>
              Send private report
            </button>
            <button
              type="button"
              className="w-text-btn"
              onClick={() => setReport(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="w-section-heading">
        <h3>
          Voices around the fire <small>{post.comment_count}</small>
        </h3>
        <button className="w-text-btn" onClick={r.reload}>
          ↻ Refresh
        </button>
      </div>
      <div className="w-comments">
        {comments.map((cm) => (
          <article
            key={cm.id}
            id={`answer-${cm.id}`}
            className={`w-comment ${cm.is_solution ? "w-solution" : ""}`}
            style={{ marginLeft: `${(cm.depth - 1) * 14}px` }}
          >
            {cm.is_solution && (
              <div className="w-solution-heading">
                ☼ THE WAY FORWARD <span>Accepted solution</span>
              </div>
            )}
            <HeroLink
              id={cm.author_id}
              name={cm.display_name}
              classKey={cm.class_key}
              subtitle={`${formatRelativeTime(cm.created_at)}${cm.parent_comment_id ? ` · Reply to #${cm.parent_comment_id}` : ""}`}
            />
            {editing === cm.id ? (
              <form
                className="w-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await run({
                      action: "editComment",
                      id: cm.id,
                      content: String(f.get("content")),
                    })
                  )
                    setEditing(null);
                }}
              >
                <label>
                  Edit response
                  <textarea
                    name="content"
                    required
                    maxLength={8000}
                    defaultValue={cm.content}
                  />
                </label>
                <div className="w-actions">
                  <button className="w-btn" disabled={busy}>
                    Save
                  </button>
                  <button
                    className="w-text-btn"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="w-prose">{cm.content}</p>
            )}
            {!cm.deleted_at && (
              <>
                <div className="w-reactions">
                  <button
                    disabled={busy || cm.author_id === user.id}
                    aria-pressed={cm.reactions.includes("helpful")}
                    onClick={() => react("helpful", cm.id)}
                  >
                    ☼ Helpful · {cm.helpful_count}
                  </button>
                  <button
                    disabled={busy || cm.author_id === user.id}
                    aria-pressed={cm.reactions.includes("encouragement")}
                    onClick={() => react("encouragement", cm.id)}
                  >
                    ♡ Encourage
                  </button>
                  {cm.depth < 3 && (
                    <button
                      onClick={() => {
                        setReply(cm);
                        document.getElementById("guild-reply")?.focus();
                      }}
                    >
                      ↳ Reply
                    </button>
                  )}
                  {canSolve &&
                    cm.author_id !== post.author_id &&
                    cm.author_id !== user.id && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run({
                            action: "solution",
                            postId: id,
                            commentId: cm.id,
                          })
                        }
                      >
                        ✓ Accept solution
                      </button>
                    )}
                </div>
                <div className="w-actions w-thread-tools">
                  {cm.author_id === user.id ? (
                    <>
                      {!cm.is_solution && (
                        <button
                          className="w-text-btn"
                          onClick={() => setEditing(cm.id)}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="w-text-btn"
                        onClick={() => setConfirmDelete(cm.id)}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      className="w-text-btn"
                      onClick={() => setReport(cm.id)}
                    >
                      Report
                    </button>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
      {!comments.length && (
        <Empty title="Pull up a chair.">
          Have you been here before? Share what helped you.
        </Empty>
      )}
      {(page > 0 || r.data.hasMore) && (
        <Pager page={page} more={r.data.hasMore} onChange={setPage} />
      )}
      <form
        className="w-form w-reply-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run({
              action: "comment",
              postId: id,
              content: text,
              parentId: reply?.id ?? null,
            })
          ) {
            setText("");
            setReply(null);
          }
        }}
      >
        {reply && (
          <p className="w-reply-to">
            Replying to {reply.display_name}{" "}
            <button
              type="button"
              className="w-text-btn"
              onClick={() => setReply(null)}
            >
              × Cancel
            </button>
          </p>
        )}
        <label htmlFor="guild-reply">
          {reply ? "Continue the conversation" : "Share a helpful response"}
        </label>
        <textarea
          id="guild-reply"
          required
          maxLength={8000}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What worked for you? A kind, specific suggestion can go a long way."
        />
        {error && (
          <p className="w-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="w-form-footer">
          <p>
            Helpful answers aren’t medical or professional advice.
            <br />
            Share experiences, not guarantees.
          </p>
          <button
            className="w-btn w-btn-primary"
            disabled={busy || !text.trim()}
          >
            Send response →
          </button>
        </div>
      </form>
    </div>
  );
}
