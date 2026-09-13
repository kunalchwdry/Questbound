# Questbound — Guild Hall extension

## Delivered

The existing project was extended, not replaced. Personal quests remain at `/guild`, including the character sheet, six attributes, streaks, boss battles, bounty, inventory, achievements, mood journal and Oracle.

| Destination | Features |
|---|---|
| `/community` | Seven post types; guided problem composer; tags; debounced search; type, saved and solved filters; newest/active/fewest-replies ordering; bounded pagination; owner editing and soft deletion; threaded replies (three levels); meaningful reactions; author/moderator accepted solutions; saved scrolls; private reports and blocking |
| `/guilds` | Discovery, creation, public and invitation-only guilds, join/leave, searchable hero invitations, ownership transfer, moderator/member roles, roster, contribution history, shared quests and member-only discussion |
| `/challenges` | Time-bounded global challenges; sessions, XP, unique contributors or UTC active-day metrics; enrollment; completion state; individual contributions and one-time contributor rewards |
| `/leaderboard` | Overall, weekly, monthly, streak, community, problem-solvers and guild boards; podium; highlighted current hero; daily rank movement/personal best; pagination; server-persisted opt-out and local quiet mode |
| `/heroes/[id]` | Public character sheet, actual existing level curve, attribute levels, XP, effective streak, community contribution statistics and guild |
| Postbox (header) | Replies, helpful endorsements, accepted solutions, reputation, invitations, completed guild quests/challenges, ranking movement; read controls and blocked-user management; private moderation queue for configured moderators |

The shared world uses pine-green ink, linen surfaces, heraldic shapes and an inline illustrated hall. Existing typography is reused. Quest XP floats and character feedback are preserved; the old blocking level-up modal is now a non-modal, dismissible reward announcement. Reduced-motion preferences cover the existing Motion components as well as the new CSS transitions.

## What was found and reused

The remote Supabase schema was ahead of Git. All twenty requested social/notification/contribution tables already existed, as did `community_stats` and both ranking visibility columns. Their data was preserved. We reused the existing integer app-user IDs linked to Supabase Auth, all social tables, reputation ledger, completion log, guild/challenge participant and contribution ledgers, notifications and daily rank snapshots.

`src/db/community-schema.ts` captures the remote social schema, while `src/db/schema.ts` retains the original RPG schema and adds only the already-existing ranking preferences. Drizzle snapshots now include this adopted schema; generation reports no changes. Existing `community_stats` is preserved, but ranking queries deliberately use validated reputation transactions rather than treating arbitrary helpful reactions as reputation awards.

## Applied migrations

- `drizzle/0002_community_baseline.sql`: additive adoption of the social schema already present remotely. Types/tables/constraints/indexes are guarded; missing equivalents are created without replacing existing objects or rows.
- `drizzle/0003_community_security.sql`: persistent action rate-limit buckets; RLS and browser-role privilege hardening; own-notification read policy; source-completion validation; completion-triggered guild/challenge contribution accounting; query-specific indexes.

Applied to the existing Supabase database on 2026-09-13. Before/after SQL row fingerprints matched for **all 29 original tables**. The original counts remained 12 users, 64 quests, 27 completions, 7 posts, 3 comments, 1 guild, 1 inventory record and all other records listed in `migration-applied.json`. No fake community users or posts were seeded.

The migration runner uses a checksum-verified adoption ledger in `drizzle.community_migrations`. It intentionally does not replay the legacy init migration against an already populated database. `db:push` is guarded off because destructive schema reconciliation is inappropriate here. Use reviewed additive SQL; never edit an applied migration. A future migration must be added to the runner’s ordered file list and the Drizzle journal/snapshots.

```bash
npm ci
npm run db:check       # rollback-only validation / applied checksum verification
npm run db:migrate     # idempotent apply of the reviewed adoption migrations
npm run dev -- --hostname 0.0.0.0
```

## Security boundary

- Existing Supabase session verification (`auth.getUser()`) remains authoritative. No replacement auth and no test bypass in the app.
- New mutations require same-origin JSON requests, strict Zod action schemas and an authenticated app user. Actors, XP, progress, rewards and reputation values are never accepted from clients.
- The existing architecture uses server PostgreSQL connections. Browser roles have **no direct DML access** to the RPG/social tables; RLS is deny-by-default. Ownership and guild authorization are enforced on every server operation. The only direct browser read grant added is own-user notifications, protected by RLS.
- Unnecessary browser-role TRUNCATE, REFERENCES and TRIGGER privileges were removed. Reports, AI settings, task text and account details are not exposed through public profile DTOs.
- Per-user transaction-scoped advisory locks, resource locks, unique source keys, unique membership/invitation/reaction constraints and persistent hourly throttles prevent ordinary replay/concurrency abuse.
- Posts: 5/hour; comments: 20/hour; invitations: 10/hour; reports: 5/hour; total social mutations: 120/hour. Limits are stored in PostgreSQL and survive serverless instances.
- Existing quest completion is capped at 40 records per rolling 24 hours. Completed quests cannot be reopened by changing their type. The original reward formulas and leveling curve are unchanged.

### Reputation policy

- Helpful answer: +5, only for the post author’s endorsement.
- Accepted solution: +15, only the author or a permitted guild/global moderator may accept, no self-solutions and no solution cycling.
- Useful tip: +3 after three distinct established heroes endorse it as helpful/learned-something.
- Established means an account at least 24 hours old with at least five recorded quest completions.
- Positive reputation has a 50/day recipient budget and a 20/day actor-to-recipient budget. Guild/challenge contributor claims respect the recipient budget.
- One source is rewarded once. Removing/re-adding a reaction never reissues reputation. Accepted-solution text cannot be silently rewritten; authors can add a follow-up or remove it. Historical reputation remains a record of the original event after source removal.
- Guild and challenge contribution reputation is awarded only on a completed shared objective, with a real contribution and one-time claim. No rewards for posting, page views, reactions alone or reviewing reports.

These are abuse controls, not proof of real-world work. Personal quest completion remains self-reported; coordinated established-account collusion would require moderation and additional abuse analytics. Existing historical balances/transactions were not reclassified or erased.

### Guild/challenge accounting

- One guild per hero, matching the existing database constraint. Owners must transfer ownership before leaving.
- Guild managers may create one shared quest per seven days. New guild quest rewards are fixed at 500 Guild XP plus 50 gold and up to 5 reputation per contributing participant.
- One completion goes to the oldest eligible enrolled guild quest, matching the existing unique source-completion constraint. A new matching completion contributes one unit and 10 Guild XP. No retroactive enrollment credit.
- Global challenges can each count a completion once. Unique-hero goals count a hero once. Active-day goals count at most one completion per hero per UTC day. Timestamps must fall in the challenge interval and after enrollment.
- Global challenge rewards are fixed at 100 personal XP, 50 gold and up to 5 reputation per contributor. Historical configured rewards are respected within these caps.
- Contributor claims lock the existing user balance and participant record; XP/gold go into the existing RPG balances, not a second economy. Group completion does not automatically grant personal rewards to nonparticipants.
- Expired objectives reject new enrollment/contributions. No artificial sample objectives were added to the live database.

## Ranking semantics

Overall: current server-maintained RPG XP. Weekly/monthly: immutable **completed-quest XP**, not guessed historical bonus timestamps. UTC weeks begin Monday. Streak uses the hero’s existing timezone and drops stale streaks from the board. Community/problem-solver metrics use trusted reputation ledger records. Guild rankings use existing guild progression.

Daily snapshots are captured when a hero visits a board, not fabricated as a realtime ranking history. Movement compares to the most recent earlier daily visit. Snapshot capture is bounded to the current hero, not a full copy of the user base on every request.

Quiet mode hides competitive content for the current page session. The separate visibility checkbox persists ranking opt-out in the existing user columns. Opting out of rankings does not erase a public character sheet or authored community content.

## Verification performed

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, including all existing and new routes.
- `npx drizzle-kit generate --name verify_no_drift`: no schema changes.
- `npm run test:community`: **21 checks passed** using real PostgreSQL and rollback-only fixtures. Includes ownership, solution authorization, duplicate awards, reaction uniqueness, cross-post reply prevention, reports, blocks, private guilds, invitations, source validation, enrollment/attribute matching, one-time claims, unique-hero/active-day challenge semantics, ranking opt-out, safe DTOs, all query routes, RLS/grants, existing quest/level/achievement/dashboard/inventory/bounty regressions and persistent rate limits.
- `npm run test:browser`: **19 checks passed**. Five screens at 1440px, 768px and 390px; no horizontal page overflow; composer labels/Escape; threaded solution interaction; guild deep link; reduced-motion/quiet-mode. Automated axe WCAG A/AA checks found **zero violations** on these tested screens and dialogs after contrast fixes.
- Live production-build smoke checks: six authenticated destinations redirect anonymous visitors to the existing login; five old/new APIs return 401; cross-origin mutation returns 403; database health returns 200; existing email/password login controls render.
- Browser interaction tests use **isolated fictional fixtures and mocked APIs**, not a live signed-in Supabase session. Database integration tests use actual SQL with every test row rolled back. Existing-user login success and the complete signed-in browser loop still require a test session supplied by the owner. No user was impersonated.

Reports: `integration-test-results.json`, `browser-test-results.json`, `live-smoke-results.json`, `migration-applied.json`. Browser screenshots in `docs/screenshots/` are **test-fixture renderings**, not live community data.

Browser-test prerequisites:

```bash
npx playwright install --with-deps chromium
npm run build
npm run test:browser
```

## Deployment and remaining operator setup

The production build is running in the workspace preview on port 3000. **GitHub has not been pushed and Vercel has not been deployed.**

1. Rotate the database password previously shared in chat and update `.env.local` and Vercel’s server-side `DATABASE_URL`. Do not commit credentials.
2. Choose the community moderators. Set server-only `COMMUNITY_MODERATOR_IDS` to a comma-separated list of integer `public.users.id` values (not auth UUIDs). By default, nobody is assigned global moderation permissions. Guild owners/moderators already have their scoped permissions. Global report review and challenge creation require this explicit setup.
3. Sign into the live preview with an authorized test account and verify the full quest → contribution → reward → profile loop across two accounts. Production login credentials were not requested or assumed.
4. Deploy the checked build to the existing Vercel project with the existing environment variables plus optional moderator IDs. Confirm Supabase site/redirect URL configuration for the deployment hostname.
5. For a future live-update enhancement, subscribe only to own-user notifications with the existing RLS policy; do not expose full community tables. This release uses focus/explicit refresh and avoids unnecessary realtime subscriptions.

No reset, table drop, truncation, replacement Supabase project or replacement authentication was used.
