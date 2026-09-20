# Questbound × InnerLoop — Audit & Implementation Plan

## Phase 1 — Audit (complete)

### Stack
- **Framework**: Next.js 16 (App Router) + React 19, TypeScript (strict), Tailwind 4
- **DB**: Supabase PostgreSQL accessed via **Drizzle ORM** (`src/db/schema.ts`)
- **Auth**: Supabase Auth (`auth.users`) bridged to custom `users` table via `auth_id`; sessions via `sessions` table with hashed bearer cookies (see `src/lib/auth.ts`)
- **Engine** (authoritative): `src/lib/engine.ts` — row-locked transactions
- **Pure game logic**: `src/lib/game.ts` — rewards, leveling, streaks, classes, XP curves
- **Dashboard read model**: `src/lib/dashboard.ts` → single `GET /api/dashboard`
- **Oracle / AI**: `src/lib/oracle.ts` — hedged multi-provider OpenAI-compatible agent with validated JSON + Naive Bayes local fallback
- **UI**: Guild-hall themed (Cinzel + Nunito Sans), gold/violet palette, motion animations
- **Deployment**: Vercel (`vercel.json`), edge-safe APIs with `force-dynamic`

### Key tables (production, do not drop)
| Table | Purpose |
|---|---|
| `users` | hero sheet, XP, gold, streaks, attribute XP, Supabase `auth_id` |
| `quests` | user tasks (daily/habit/once), attribute, difficulty, due date |
| `completions` | immutable ledger — drives Chronicle, heatmap, boss, contracts |
| `inventory` / `items` | Armory catalog + what the hero owns (shields, elixirs, themes) |
| `checkins` | mood journal (1–5 + free-text emotion) |
| `companion_messages` | Oracle conversation history |
| `ai_configs` | per-user LLM config (AES-256-GCM key) |
| `sessions` | hashed session tokens |

### Key API routes
| Route | Purpose |
|---|---|
| `POST /api/auth/signup|login|logout` | Supabase-backed auth |
| `GET|POST /api/quests`, `PATCH|DELETE /api/quests/[id]`, `POST /api/quests/[id]/complete` | Quest CRUD + authoritative completion |
| `GET /api/dashboard` | Single read model |
| `POST /api/checkin` | Mood check-in → emotion label + reply |
| `GET|POST|DELETE /api/companion` | Oracle chat with structured suggestions |
| `POST /api/bounty/claim`, `POST /api/boss/claim` | Daily contract & weekly boss |
| `POST /api/shop/purchase`, `POST /api/inventory/equip`, `POST /api/inventory/use` | Armory |
| `PATCH /api/profile`, `GET|POST /api/settings/ai/*` | Settings |

### Existing reusable systems (MUST reuse)
1. **Quest CRUD + completion pipeline** — `completeQuest()` issues rewards, handles streaks, shields, crits, level-ups inside a transaction
2. **Difficulty enum** already maps cleanly to InnerLoop sizes:
   - `trivial` ≈ Tiny (5–15 min), `easy` ≈ Small (15–30 min), `medium` ≈ Medium (30–60 min), `hard` ≈ Large (60–120 min), `epic` ≈ Epic (120+ min)
3. **Attributes** (strength/intellect/vitality/charisma/discipline/creativity) already classify quests
4. **Check-ins** already capture mood (1–5) + emotion text — extend, don't duplicate
5. **Oracle** already has structured `QuestSuggestion` output with validated schema — add a new "plan" mode
6. **Focus timer** already binds a quest + timer + calls the authoritative complete route
7. **Completions ledger** already provides the data needed for behavioral insights (timestamps, difficulty, attribute, XP, streak)
8. **Optimistic UI pattern** in `useGuild.ts` — new client actions must follow the same pattern

### Potential conflicts / things to watch
- `quests.dueDate` is a `YYYY-MM-DD` string (no time). For scheduling, we'll add an optional `scheduled_at` and `scheduled_duration_min` column rather than abusing `dueDate`.
- `checkins` only stores `mood` (1–5) + `emotion` string. We need explicit **energy** levels (high/medium/low) and optional context tags for planning. We can extend this with a metadata JSON column or add a `plan_sessions` table for plan-scoped inputs rather than polluting checkins.
- Difficulty-to-time mapping in DIFFICULTY_META is hint-only; the adaptive engine owns its own size bucket map.
- The Oracle's system prompt must be extended for planning/replan explanation mode. Keep existing emotional-companion behavior intact.
- `dashboard.ts` caps history at 40 rows; weekly report needs a wider window (we'll add a dedicated endpoint).

---

## Phase 2 — Design (smallest safe extension)

### New DB tables (additive only)

#### `goals` — long-term goals / campaigns
```
id, user_id, title, attribute (default), difficulty_target,
status (active|completed|abandoned), deadline, notes,
created_at, updated_at, completed_at
```

#### `quests` columns (additive)
- `parent_quest_id integer NULL` — references quests(id), for split quests / campaign chapter parent
- `goal_id integer NULL` — references goals(id)
- `estimated_minutes integer NULL` — InnerLoop size estimate
- `scheduled_for varchar(10) NULL` — the chapter (YYYY-MM-DD) this is scheduled for (uses same day-key convention as existing due_date/lastActiveDate)
- `scheduled_order integer NULL` — sort order within a daily plan
- `plan_context jsonb NULL` — tags for how the quest was generated (energy, source: oracle|plan|manual, split_from, etc.)
- `status varchar(16) NOT NULL DEFAULT 'active'` — active | postponed | split | done-aliased; completedAt still drives completion, this is for plan state only

#### `plan_sessions` — one record per "Plan my day" invocation
```
id, user_id, day varchar(10),
goal_id integer NULL,
energy_level varchar(10),         -- high | medium | low
mood_tag varchar(20) NULL,        -- calm | focused | tired | anxious | overwhelmed | frustrated | neutral
available_minutes integer,
deadlines text,                    -- free text / JSON
note text,
quest_ids integer[],               -- quests generated
created_at
```

#### `quest_events` — behavioral tracking (append-only, small)
```
id, user_id, quest_id,
event varchar(20),                 -- started | completed | abandoned | postponed | rescheduled | split | scheduled
scheduled_for varchar(10) NULL,
from_day varchar(10) NULL,
to_day varchar(10) NULL,
energy_level varchar(10) NULL,
mood_tag varchar(20) NULL,
duration_min integer NULL,         -- for focus/completed
meta jsonb NULL,
created_at
```

All columns nullable where appropriate; indexes on (user_id, day), (quest_id), (user_id, created_at). All additive. Use Drizzle migration via `drizzle-kit generate`. Safe defaults, no drops.

### New API routes
| Route | Purpose |
|---|---|
| `POST /api/plan/generate` | Adaptive daily plan: given goal/time/energy/mood, call Oracle in "plan" mode, validate + insert quests, create a plan_session, return plan diff |
| `POST /api/plan/replan` | Triggered manually (or heuristically); takes today's plan + what was missed + remaining time, returns rebalance patch (split quests, postpone, reschedule), applies via quest updates/inserts |
| `POST /api/plan/split` | Deterministically split an oversized quest into N smaller quests (calls Oracle to name them, inserts child quests, marks parent as split) |
| `GET /api/insights` | Behavioral insights computed from `completions` + `quest_events` (deterministic aggregations) |
| `GET /api/insights/weekly` | Weekly execution report data |
| `POST /api/goals`, `GET /api/goals`, `PATCH /api/goals/[id]` | Campaign/goal CRUD |
| `POST /api/quest-events` | Append a behavioral event (started, postponed, rescheduled, focus start/end) |

Quest completion **still goes through the existing** `POST /api/quests/[id]/complete`. We hook in to write a `quest_events` row (type=completed) inside the existing transaction.

### New server logic (`src/lib/innerloop/`)
- `sizing.ts` — Tiny/Small/Medium/Large/Epic buckets; map to difficulty + estimated_minutes; sizeFor(energy, availableMinutes)
- `planning.ts` — deterministic scaffolding (time-budget pack, default 50/30/20 split, deadline prioritization) before handing to Oracle for naming/decomposition
- `replanning.ts` — detect over-budget or overdue-today quests; compute split vs postpone vs shrink decisions deterministically; build a patch
- `behavior.ts` — aggregate completions + quest_events into insights & profile
- `oracle-plan.ts` — extended system prompt for plan/replan modes reusing `runOracle` with a different schema

**Hard rule**: time budgets, quest sizing, deadlines, rewards, XP, gold — all deterministic. The LLM only names quests, writes natural-language descriptions, and gives a short explanation for the Oracle to speak.

### UI additions (RPG aesthetic, no new app shell)
1. **"Plan My Day" panel** — added to the Sanctum tab (alongside Oracle and Mood/Focus). Energy selector (3 big buttons), mood chips, available minutes slider, goal picker (or free text), deadlines, generate button → animated list of proposed quests → "Accept all" / individual accept.
2. **Daily Plan strip** above the Quest Board — shows today's planned quests in scheduled_order with tiny duration chips; "Rebalance" button triggers replan.
3. **Split button** on QuestCard — appears when estimated_minutes ≥ 60 (Large+) and quest is incomplete. Splits via `/api/plan/split`.
4. **Behavioral Insights card** in Chronicle tab — computed weekly summary + "you work best…" lines.
5. **Oracle now says "why did you change my plan?"** — replan actions post an Oracle message explaining moves (uses existing companion_messages).
6. **Goal card** above QuestBoard or inside character sheet side-panel — shows current goal → chapter → quests progress.

### Data flow — Plan → Execute → Adapt
1. User fills Plan My Day → `POST /api/plan/generate` → Oracle (plan mode) returns structured quest list sized to budget → server inserts quests with parent_quest_id=null, goal_id=X, scheduled_for=today, scheduled_order, estimated_minutes → returns plan.
2. User focuses / completes quests via the existing completion pipeline → quest_events logged as side effect → dashboard refreshes.
3. On dashboard load (and on demand): if scheduled_for=today AND remaining minutes < sum(open estimated_minutes) OR any quest with scheduled_order past window and not done → surface "Rebalance?" → user confirms → `POST /api/plan/replan` → deterministic rebalance + Oracle natural-language explanation written to companion_messages → quests patched (postponed = scheduled_for moved to tomorrow; split = parent marked split + children inserted; re-ordered = scheduled_order updated) → dashboard refreshes.
4. Insights (Chronicle tab) aggregate completions + quest_events to show patterns — no new tables, just queries.
5. Weekly report — endpoint aggregates past 7 days of completions + events, computes stats, asks Oracle for a 2-sentence summary.

### Safety/compatibility checklist
- [x] No changes to reward math, XP, gold, streak, or level curves
- [x] No new required env vars; reuses existing Oracle AI routing
- [x] All additive columns nullable with safe defaults
- [x] Existing quest completion API untouched (we add quest_events in the same tx, optional)
- [x] Existing auth/session/Dashboard pipeline reused
- [x] No new infrastructure, no new deployment config changes
- [x] Oracle 2.0 = same `runOracle` function, new "mode" passed via prompt shape + schema selection
- [x] Existing checkin UI untouched; new energy selector lives in Plan panel (can also flow into checkin metadata later)

### P0 build order (incremental) — status

| # | Step | Status |
|---|---|---|
| 1 | Migration (`drizzle/0004_innerloop.sql`) + Drizzle schema update | ✅ Done — verified idempotent, syntax-checked in pg-mem + embedded PG 18 |
| 2 | `src/lib/innerloop/sizing.ts` pure logic | ✅ Done — 31 unit checks in `scripts/test-innerloop.ts` |
| 3 | `POST /api/plan/generate` (deterministic skeleton + Oracle naming) | ✅ Done — always works, even with no AI targets (template titles) |
| 4 | Plan My Day UI panel in Sanctum | ✅ Done — energy 3-way, mood chips, time choices, goal, deadlines |
| 5 | Daily plan strip above QuestBoard | ✅ Done — `DailyPlanStrip.tsx`, live refresh on completion |
| 6 | Completion hook logs `quest_events` | ✅ Done — fire-and-forget side effect, never blocks rewards |
| 7 | Focus timer emits `started` events + accepts preselection | ✅ Done — Daily Plan "Start" hands the quest + its estimate to the candle |
| 8 | `POST /api/quests/[id]/split` + Split button | ✅ Done — ✂ appears on quests ≥ 60 min; splits to 3 children |
| 9 | `POST /api/plan/replan` + Rebalance button | ✅ Done — deadline-protected greedy fit, split > postpone |
| 10 | Oracle explanation after replan | ✅ Done — LLM explanation w/ template fallback; persisted as an Oracle message in the Sanctum conversation |
| 11 | `GET /api/insights` + Insights card in Chronicle | ✅ Done — 7d weekly report + 30d profile toggle |
| 12 | Goal CRUD (minimal) | ✅ Done — `/api/goals` (max 10 active/user); planner accepts `goalId` |

### Verification performed

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (strict) | ✅ clean |
| `npm run lint` (eslint 9 + react-hooks rules) | ✅ clean |
| `npm run build` (production, placeholder env) | ✅ all routes compiled incl. 8 new endpoints |
| `npx tsx scripts/test-innerloop.ts` (31 pure-logic checks) | ✅ pass |
| `node scripts/verify-innerloop-sql.mjs` (pg-mem) | ✅ idempotent migration, all columns/tables/enums present |
| `npx tsx scripts/test-innerloop-e2e.ts` (embedded PG 18, real drizzle + engine code) | ✅ 40 checks pass: plan → complete → replan (postpone) → split; rewards, streak, dashboard intact |

### How the replan e2e proves the product principle

The e2e simulates **PLAN → EXECUTE → OBSERVE → ADAPT → CONTINUE** with a real Postgres:
1. PLAN — 90-min budget, medium energy → 3–4 right-sized quests (≤ budget).
2. EXECUTE — first quest completed through the **existing authoritative engine** (`completeQuest` XP/gold/streak verified).
3. OBSERVE — available time collapses to 30 min.
4. ADAPT — `computeReplan` moves the overflow to tomorrow (no "streak broken", no guilt), re-orders the rest deterministically.
5. SPLIT — a lone 90-min Large quest with 25 min left splits in two; the **first child fits today (≤ 30 min)**, inherits attribute and deadline; the parent leaves the board.

### Next run steps (production) — ✅ DONE 2026-09-20

`npm run db:check:innerloop` (dry-run, rolled back) followed by `npm run db:migrate:innerloop --apply` were run against the production Supabase project. Result: `quests` gained all 7 additive columns (77 existing rows preserved byte-for-byte per the runner's fingerprint check, `quest_status` backfilled to `active`), `goals`/`plan_sessions`/`quest_events` and the 3 enums were created, and the ledger row was recorded. Reports: `docs/migration-innerloop-dry-run.json`, `docs/migration-innerloop-applied.json`.

One runner defect was found and fixed during the production run: the row-fingerprint hashed `row_to_json` over *full* rows, so any additive column with a default (e.g. `quest_status`) legitimately changed every row's JSON and tripped the "existing rows changed" safety gate. The fingerprint now hashes only the column set that existed before the migration — the gate still proves existing data is untouched, without false-positiving additive schema changes.

Existing features were NOT touched except where noted: quest completion route gains a fire-and-forget event insert; quest delete logs an `abandoned` event first; `serializeQuest` returns 6 new nullable fields. All reward math, XP curves, streak logic, Supabase Auth, Oracle ensemble and the community/guild social systems are byte-for-byte unchanged.

### Run it in a sandbox (no Supabase, no cloud DB)

```bash
npm i --no-save embedded-postgres      # one-time test/runtime helper
npm run sandbox:db                     # embedded Postgres + full schema (keep running)
npm run sandbox:seed                   # demo hero + 2 weeks of history (once, idempotent)
npm run dev                            # .env.local points at the sandbox DB
```

`.env.local` (gitignored) enables the **dev-only auth bypass** (ADR-024): `QUESTBOUND_DEV_AUTH_BYPASS=1` impersonates the seeded hero everywhere, `AI_PROVIDER=local` keeps every LLM call on deterministic template fallbacks. The flag is inert in production builds and on Vercel.

Seeded demo state: today's plan (3 quests, one due tomorrow), 4 backlog quests incl. a 90-minute split candidate, a goal with a child quest, 8 Chronicle completions, 7 check-ins, and an event history that yields an honest 55 % completion rate in Insights — improving live as you complete plan quests.

Verified live over HTTP in the Arena sandbox (2026-09-20): `/guild` renders, completing a quest pays XP 22 / gold 8 through the existing pipeline (streak 3→4), and `POST /api/plan/replan {"remainingMinutes":30}` split the deadline-critical 60 m quest into two parts (part 1 ≤ 30 m stays today) while postponing the 45 m design quest — with the Oracle's deterministic explanation.

### Not yet built (intentionally out of P0/P1 scope)

- Client UI for goals/campaigns (API is ready: `/api/goals`)
- What-if planner endpoint (`"I only have 45 min"`) — the deterministic packBudget primitive already supports it; wire it to `/api/plan/generate?preview=true` later
- Full Goal→Campaign→Chapter tree UI (P2)
