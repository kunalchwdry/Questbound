"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/client-api";
import { Dialog } from "@/components/ui/Dialog";
import type { CommunityAction } from "@/lib/community-validation";
import type { Notice, Invite } from "@/lib/community-types";
import { Avatar, Empty, ErrorState, Loading, useResource } from "./WorldUI";
import "./world.css";
import "./midnight-world.css";
type User = { id: number; name: string; classKey: string };
type Meta = {
  userId: number;
  moderator: boolean;
  guild: { id: number; name: string; role: string } | null;
  unread: number;
};
const WorldContext = createContext<{
  user: User;
  meta: Meta | null;
  act: (a: CommunityAction) => Promise<{ message: string; id?: number }>;
  busy: boolean;
}>({
  user: { id: 0, name: "", classKey: "knight" },
  meta: null,
  act: async () => ({ message: "" }),
  busy: false,
});
export const useWorld = () => useContext(WorldContext);
const LINKS = [
  ["/guild", "My adventure", "⌂"],
  ["/community", "Guild Hall", "♜"],
  ["/guilds", "Guilds", "⚑"],
  ["/challenges", "Challenges", "⚔"],
  ["/leaderboard", "Hall of Heroes", "♛"],
];
export function WorldShell({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const path = usePathname();
  const { data: meta, reload } = useResource<Meta>("/api/community/meta");
  const [inbox, setInbox] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const act = useCallback(
    async (a: CommunityAction) => {
      if (lock.current) throw new Error("Another action is still syncing.");
      lock.current = true;
      setBusy(true);
      try {
        const r = await api<{ message: string; id?: number }>(
          "/api/community/actions",
          { method: "POST", body: JSON.stringify(a) },
        );
        setError(false);
        setMessage(r.message);
        reload();
        window.dispatchEvent(new Event("questbound:social"));
        return r;
      } catch (e) {
        setError(true);
        setMessage(
          e instanceof Error ? e.message : "Could not sync this action.",
        );
        throw e;
      } finally {
        setBusy(false);
        lock.current = false;
      }
    },
    [reload],
  );
  const closeInbox = useCallback(() => setInbox(false), []);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("inbox"))
      setTimeout(() => setInbox(true), 0);
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <WorldContext.Provider value={{ user, meta, act, busy }}>
      <div className="world app-bg" data-theme="midnight">
        <header className="w-masthead">
          <div className="w-masthead-inner">
            <Link className="w-brand" href="/guild">
              <span aria-hidden="true">✥</span> QUESTBOUND
              <small>A LIFE WELL QUESTED</small>
            </Link>
            <div className="w-account">
              <button
                className="w-inbox"
                onClick={() => setInbox(true)}
                aria-label={`Open inbox, ${meta?.unread ?? 0} unread notifications`}
              >
                ✉{" "}
                <span>
                  {meta?.unread ? Math.min(99, meta.unread) : "Inbox"}
                </span>
              </button>
              <Link className="w-account-hero" href={`/heroes/${user.id}`}>
                <Avatar name={user.name} classKey={user.classKey} />
                <span>
                  {user.name}
                  <small>Character sheet ↗</small>
                </span>
              </Link>
            </div>
          </div>
        </header>
        <nav className="w-world-nav" aria-label="World destinations">
          <div>
            {LINKS.map(([href, label, icon]) => (
              <Link
                href={href}
                key={href}
                aria-current={path === href ? "page" : undefined}
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
          <span className="w-nav-note">Small steps. Shared adventures.</span>
        </nav>
        <main id="main" className="w-main">
          {children}
        </main>
        <footer className="w-footer">
          <span>✥ QUESTBOUND</span>
          <p>Reputation measures contribution. Never your worth.</p>
          <Link href="/guild">Back to real life →</Link>
        </footer>
        {message && (
          <div
            className={`w-toast ${error ? "is-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{error ? "!" : "✓"}</span>
            <p>{message}</p>
            <button
              onClick={() => setMessage("")}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}
        <Dialog
          open={inbox}
          onClose={closeInbox}
          title="Your guild postbox"
          size="lg"
        >
          {inbox && <Inbox />}
        </Dialog>
      </div>
    </WorldContext.Provider>
  );
}
function Inbox() {
  const { act, busy, meta } = useWorld();
  const r = useResource<{
    notifications: Notice[];
    invites: Invite[];
    blocks: { id: number; display_name: string }[];
  }>("/api/community/inbox");
  const [tab, setTab] = useState("mail");
  const run = async (a: CommunityAction) => {
    try {
      await act(a);
      r.reload();
    } catch {}
  };
  if (r.error) return <ErrorState error={r.error} retry={r.reload} />;
  if (!r.data) return <Loading />;
  return (
    <div className="w-inbox-content">
      <div className="w-filters">
        {["mail", "blocked", ...(meta?.moderator ? ["reports"] : [])].map(
          (t) => (
            <button
              className="w-chip"
              key={t}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {tab === "mail" && (
        <>
          {r.data.invites.map((i) => (
            <section className="w-invitation" key={i.id}>
              <p className="w-eyebrow">GUILD INVITATION</p>
              <h3>{i.name}</h3>
              <p>{i.inviter} invited you to adventure together.</p>
              <div className="w-actions">
                <button
                  className="w-btn w-btn-primary"
                  disabled={busy}
                  onClick={() =>
                    run({ action: "respondInvite", id: i.id, accept: true })
                  }
                >
                  Accept invitation
                </button>
                <button
                  className="w-btn"
                  disabled={busy}
                  onClick={() =>
                    run({ action: "respondInvite", id: i.id, accept: false })
                  }
                >
                  Decline
                </button>
              </div>
            </section>
          ))}
          <button
            className="w-text-btn"
            disabled={busy}
            onClick={() => run({ action: "readNotice" })}
          >
            Mark all as read
          </button>
          {!r.data.notifications.length && (
            <Empty title="A quiet postbox">
              Replies, invitations and shared victories will arrive here.
            </Empty>
          )}
          {r.data.notifications.map((n) => (
            <article
              className={`w-notice ${n.read_at ? "" : "unread"}`}
              key={n.id}
            >
              <div>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <Link
                  href={
                    n.href?.startsWith("/") && !n.href.startsWith("//")
                      ? n.href
                      : "/community"
                  }
                >
                  Visit →
                </Link>
              </div>
              {!n.read_at && (
                <button
                  className="w-text-btn"
                  disabled={busy}
                  onClick={() => run({ action: "readNotice", id: n.id })}
                >
                  Mark read
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "blocked" && (
        <>
          {!r.data.blocks.length && <Empty title="No blocked heroes" />}
          {r.data.blocks.map((b) => (
            <div className="w-notice" key={b.id}>
              {b.display_name}
              <button
                className="w-btn"
                disabled={busy}
                onClick={() =>
                  run({ action: "block", userId: b.id, blocked: false })
                }
              >
                Unblock
              </button>
            </div>
          ))}
        </>
      )}
      {tab === "reports" && <Reports />}
    </div>
  );
}
function Reports() {
  const r = useResource<{
    reports: { id: number; reason: string; details: string; title: string }[];
  }>("/api/community/reports");
  const { act, busy } = useWorld();
  const resolve = async (id: number, remove: boolean) => {
    try {
      await act({ action: "resolveReport", id, remove });
      r.reload();
    } catch {}
  };
  return (
    <>
      {r.error && <ErrorState error={r.error} retry={r.reload} />}
      <p className="w-muted">
        Private moderation queue. Removal hides content without deleting
        history.
      </p>
      {r.data?.reports.map((p) => (
        <article className="w-notice" key={p.id}>
          <div>
            <strong>{p.title}</strong>
            <p>{p.reason}</p>
            <p>{p.details}</p>
            <div className="w-actions">
              <button
                className="w-btn"
                disabled={busy}
                onClick={() => resolve(p.id, true)}
              >
                Remove content
              </button>
              <button
                className="w-btn"
                disabled={busy}
                onClick={() => resolve(p.id, false)}
              >
                Dismiss report
              </button>
            </div>
          </div>
        </article>
      ))}
      {r.data && !r.data.reports.length && <Empty title="No open reports" />}
    </>
  );
}
