# Questbound extension: audit → map → extend → migrate → verify

## Audit (2026-09-13)
- Existing Next.js 16 App Router, React 19, Tailwind 4, Motion, Cinzel/Nunito typography, parchment/ember themes.
- `/guild` is the personal quest workspace, not a multi-user guild. Preserve this route and all five tabs.
- Supabase Auth cookies are validated with `auth.getUser()`; integer `public.users.id` maps to `auth_id`. Server routes use a PostgreSQL pool/Drizzle; browser roles have no application DML grants. Preserve this boundary.
- Quest completion locks user and quest rows, computes XP/gold on the server, records completions. Levels and achievements are derived. Bounty/boss rewards update existing user balances. Inventory, mood journal, encrypted AI settings and Oracle remain intact.
- Existing XP floats, count-up, quest feedback and character sheet are reusable. Change blocking level-up presentation to a dismissible non-modal celebration.
- Remote schema is ahead of Git: all requested social tables, notification table and rank snapshots already exist with data. Catalog-only inspection saved in `database-audit.json` (no user records or credentials).
- Baseline counts: 12 users, 64 quests, 27 completions, 7 posts, 3 comments, 1 guild; see audit for every table.
- No public application functions/triggers or policies except Supabase auto-RLS function. All tables RLS-enabled. Browser roles retain unnecessary TRUNCATE/REFERENCES/TRIGGER privileges: revoke without affecting server paths.
- Security gap: quest type editing can reopen completed one-off tasks. Prevent changing type after first completion. Add a rolling completion cap without changing reward formulas.

## Mapping / design
Reuse all existing social tables and uniqueness constraints (including one guild per hero and one guild-quest contribution per completion). SQL migration 0002 reconciles the existing remote social schema to version control; IF NOT EXISTS plus catalog guards preserve rows. 0003 adds only missing controls/functions. The full Drizzle social schema and snapshots are now captured; `db:push` is guarded off for this populated database.

Use authenticated, same-origin server endpoints and parameterized SQL, explicit resource authorization, strict action schemas, transaction-scoped per-user locks and persistent hourly rate limits. Browser roles cannot write progression or social ledgers directly. RLS is deny-by-default; notifications have an own-user read policy. Public profile DTOs never expose email, auth IDs, timezone, AI keys, moods, inventory secrets or task text.

Reputation: author-endorsed helpful answer +5, one accepted solution +15, established-member tip quorum +3. Unique source keys, no self-awards, daily recipient cap and actor/recipient cap. No XP for posting/reactions. Guild/challenge progress comes ONLY from new trusted completion rows after enrollment, with temporal checks and per-source uniqueness. Rewards are fixed by server policy, claimed once by contributors into existing balances. No backfill of speculative historical contributions.

Frontend: dedicated /community, /guilds, /challenges, /leaderboard and /heroes/[id], linked to /guild. Shared world navigation, illustrated heraldic hall, editorial noticeboard, guided composer, threaded discussion, contributor podium, public character sheets, invitation inbox, private reports and blocks. Bounded pagination, abortable debounced searches, accessible controls, responsive layouts and reduced motion. No always-on realtime subscriptions; refresh on focus and explicit refresh keeps the first release inexpensive.

## Verification
Typecheck + lint + production build. Database rollback-only fixture tests for source validation, duplicate contribution/reward prevention, RLS denial, preservation checks; API permission tests where possible. Authenticated browser scenarios require test-account permission or an existing session; do not invent results. Never reset/drop/truncate existing tables or seed fake community users.
