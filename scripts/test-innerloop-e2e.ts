/**
 * InnerLoop engine end-to-end test against an embedded PostgreSQL.
 * Exercises the REAL server code (drizzle + engine + innerloop modules)
 * with zero LLM calls (deterministic fallbacks) and zero network.
 *
 *   npx tsx scripts/test-innerloop-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@127.0.0.1:55433/postgres";
process.env.AI_PROVIDER = "local"; // kill cloud calls; everything must fall back deterministically
// The Supabase client only needs these to *import* — the engine never calls Auth.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "placeholder-anon-key";
process.env.SUPABASE_URL ??= "https://placeholder.supabase.co";
process.env.SUPABASE_ANON_KEY ??= "placeholder-anon-key";

// Minimal constructor type so the script typechecks whether or not the
// optional embedded-postgres package is installed.
interface EmbeddedPostgresCtor {
  new (opts: {
    databaseDir: string;
    port: number;
    user?: string;
    password?: string;
    persistent?: boolean;
  }): {
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
  };
}

async function main() {
  // Optional devDependency: installed ad-hoc for this test
  // (`npm i --no-save embedded-postgres`). A types shim lives next to this
  // file so `tsc` passes on fresh checkouts where the package is absent.
  let EmbeddedPostgres: EmbeddedPostgresCtor;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch {
    console.error(
      "embedded-postgres is not installed. Run: npm i --no-save embedded-postgres",
    );
    process.exit(1);
  }
  const pg = new EmbeddedPostgres({
    databaseDir: "/tmp/innerloop-e2e-pgdata",
    port: 55433,
    user: "postgres",
    password: "postgres",
    persistent: false,
  });
  console.log("▶ starting embedded postgres…");
  await pg.initialise().catch(() => {});
  await pg.start();

  const pgmod = await import("pg");
  const admin = new pgmod.default.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const readSql = (f: string) =>
    fs
      .readFileSync(path.resolve("drizzle", f), "utf8")
      .replace(/--> statement-breakpoint/g, "");

  console.log("▶ applying base schema + innerloop…");
  await admin.query(readSql("0000_init.sql"));
  await admin.query(readSql("0001_ai_configs.sql"));
  // Production drift captured by 0002/0003: leaderboard visibility flags on users.
  await admin.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_visible boolean NOT NULL DEFAULT true;
     ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_opt_out boolean NOT NULL DEFAULT false;`,
  );
  await admin.query(readSql("0004_innerloop.sql"));

  await admin.query(
    `INSERT INTO users (auth_id, email, display_name, class_key, timezone)
     VALUES ('e2e-auth-id', 'e2e@example.com', 'E2E Hero', 'mage', 'UTC')`,
  );
  const { rows: urows } = await admin.query("SELECT id FROM users LIMIT 1");
  const userId = urows[0].id as number;
  console.log("▶ seeded user id", userId);

  // ---- import the app modules (they resolve DATABASE_URL at first import) ----
  const { db } = await import("@/db");
  const { getDashboard } = await import("@/lib/dashboard");
  const { generatePlan } = await import("@/lib/innerloop/planning");
  const { computeReplan } = await import("@/lib/innerloop/replanning");
  const { completeQuest } = await import("@/lib/engine");
  const { computeReport, computeExecutionProfile } = await import(
    "@/lib/innerloop/behavior"
  );
  const { quests } = await import("@/db/schema");
  const { questEvents } = await import("@/db/innerloop-schema");
  const { and, eq } = await import("drizzle-orm");

  let failures = 0;
  const check = (name: string, cond: boolean, detail?: unknown) => {
    if (cond) console.log("  ✓ " + name);
    else {
      failures += 1;
      console.error("  ✗ " + name, detail ?? "");
    }
  };

  // 1. Dashboard loads on the new schema
  const dash = await getDashboard(userId);
  check("dashboard loads", dash.profile.id === userId);
  check("no quests initially", dash.quests.length === 0);

  // 2. Generate a plan (deterministic fallback naming; AI calls off)
  const plan = await generatePlan(dash, {
    userId,
    goal: "Study machine learning",
    availableMinutes: 90,
    energy: "medium",
    mood: "calm",
    targets: [],
  });
  check("plan created ≥2 quests", plan.quests.length >= 2, plan.quests.length);
  check(
    "plan fits budget (+slack)",
    plan.scheduledMinutes <= 90 + 15,
    plan.scheduledMinutes,
  );
  check(
    "plan has explanation",
    typeof plan.explanation === "string" && plan.explanation.length > 4,
  );
  const today = dash.profile.today;
  check(
    "quests scheduled today",
    plan.quests.every((q) => q.scheduledFor === today),
  );
  check(
    "quests have order",
    plan.quests.every((q, i) => q.scheduledOrder === i),
  );
  check(
    "all quests active",
    plan.quests.every((q) => (q.questStatus ?? "active") === "active"),
  );

  // 3. Events logged for each scheduled quest
  const ev = await db
    .select()
    .from(questEvents)
    .where(eq(questEvents.userId, userId));
  check("scheduled events logged", ev.length === plan.quests.length, ev.length);

  // 4. Complete the first plan quest through the EXISTING reward pipeline
  const first = plan.quests[0];
  const result = await completeQuest(userId, first.id);
  check("completion pays XP", result.reward.xp > 0, result.reward.xp);
  check("completion pays gold", result.reward.gold > 0);

  const afterDash = await getDashboard(userId);
  check("dashboard xp increased", afterDash.profile.xp === result.reward.xp);
  check(
    "completed quest is done",
    afterDash.quests.find((q) => q.id === first.id)?.completedAt != null,
  );
  check("streak advanced", afterDash.profile.streak >= 1);

  // 5. Replan with drastically less time: something must move or split
  const replan = await computeReplan({
    userId,
    reason: "less-time",
    remainingMinutes: 30,
    targets: [],
  });
  check("replan produced changes", replan.changes.length >= 1, replan.changes);
  const moved = replan.changes.filter((c) => c.action === "postponed");
  const splits = replan.changes.filter((c) => c.action === "split");
  check(
    "at least one postpone or split",
    moved.length + splits.length >= 1,
    replan.changes.map((c) => `${c.action}:${c.title}`),
  );

  // Remaining open plan fits the 30 min (+ one small bucket of slack)
  const remaining = await db
    .select()
    .from(quests)
    .where(and(eq(quests.userId, userId), eq(quests.questStatus, "active")));
  const todayOpen = remaining.filter(
    (r) => r.scheduledFor === today && r.completedAt == null,
  );
  const estSum = todayOpen.reduce(
    (s, r) => s + (r.estimatedMinutes ?? 45),
    0,
  );
  check(
    "open work today fits remaining time",
    estSum <= 30 + 20,
    { estSum, open: todayOpen.map((t) => t.title) },
  );

  // 6. Postponed quests went to tomorrow
  if (moved.length > 0) {
    const q = await db
      .select()
      .from(quests)
      .where(eq(quests.id, moved[0].questId));
    check(
      "postponed quest moved to tomorrow",
      q[0].scheduledFor !== today,
      q[0].scheduledFor,
    );
  }

  // 7. Split children wired to the parent
  if (splits.length > 0) {
    const parents = await db
      .select()
      .from(quests)
      .where(
        and(eq(quests.userId, userId), eq(quests.questStatus, "split")),
      );
    check("parent marked split", parents.length >= 1);
    const children = await db
      .select()
      .from(quests)
      .where(eq(quests.parentQuestId, splits[0].questId));
    check("children exist", children.length >= 2, children.length);
    check(
      "children keep attribute",
      children.every((c) => c.attribute === "intellect"),
    );
    check(
      "children have estimates ≥10m",
      children.every((c) => (c.estimatedMinutes ?? 0) >= 10),
      children.map((c) => [c.title, c.estimatedMinutes]),
    );
    check(
      "children are sized below parent scale",
      children.every((c) => (c.estimatedMinutes ?? 45) <= 60),
    );
  }

  // 8. Behavioural events accumulated
  const ev2 = await db
    .select()
    .from(questEvents)
    .where(eq(questEvents.userId, userId));
  check(
    "events accumulated",
    ev2.length >= plan.quests.length + 1,
    ev2.length,
  );
  const kinds = new Set(ev2.map((e) => e.event));
  check("has scheduled events", kinds.has("scheduled"));
  if (splits.length > 0) check("has split events", kinds.has("split"));
  if (moved.length > 0) check("has postpone events", kinds.has("postponed"));

  // 9. Insights compute without error
  const report = await computeReport(userId, 7, today);
  check("report returns completions", report.completedQuests >= 1, report.completedQuests);
  check("report has insights array", Array.isArray(report.insights));
  check("report xp ≥ quest reward", report.xpEarned >= result.reward.xp, report.xpEarned);
  const profile = await computeExecutionProfile(userId, 30);
  check("execution profile shape ok", typeof profile === "object" && profile !== null);
  check("profile saw a completed quest size", profile.avgCompletedMinutes !== null, profile);

  // 9b. Split path: when the ONLY remaining quest is Large and barely any
  //     time is left, the rebalancer must split it — and the first child must
  //     fit today. (Keep the rest of the plan evacuated so the scenario is
  //     isolated: everything left from the earlier replan moves to tomorrow.)
  await db
    .update(quests)
    .set({ scheduledFor: "2999-01-01" })
    .where(
      and(eq(quests.userId, userId), eq(quests.scheduledFor, today)),
    );
  const [big] = await db
    .insert(quests)
    .values({
      userId,
      title: "Build the training pipeline",
      attribute: "intellect",
      difficulty: "hard",
      type: "once",
      scheduledFor: today,
      scheduledOrder: 0,
      estimatedMinutes: 90,
    })
    .returning();
  const splitReplan = await computeReplan({
    userId,
    reason: "less-time",
    remainingMinutes: 25,
    targets: [],
  });
  const splitChange = splitReplan.changes.find(
    (c) => c.questId === big.id && c.action === "split",
  );
  check("large quest got split", Boolean(splitChange), splitReplan.changes);
  if (splitChange) {
    const children = await db
      .select()
      .from(quests)
      .where(eq(quests.parentQuestId, big.id));
    check("split produced children", children.length >= 2, children.length);
    check(
      "first child fits today",
      (children[0].estimatedMinutes ?? 99) <= 30,
      children[0].estimatedMinutes,
    );
    check("children inherit attribute", children.every((c) => c.attribute === "intellect"));
    check("children keep dueDate", children.every((c) => c.dueDate === big.dueDate));
    const [parentRow] = await db
      .select()
      .from(quests)
      .where(eq(quests.id, big.id));
    check("parent marked split", parentRow.questStatus === "split");
  }

  // 10. Schema safety: all new columns exist
  const cols = (await db.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_name='quests'",
  )) as unknown as { rows: { column_name: string }[] };
  const names = cols.rows.map((r) => r.column_name);
  for (const c of [
    "parent_quest_id",
    "estimated_minutes",
    "scheduled_for",
    "scheduled_order",
    "plan_context",
    "quest_status",
    "goal_id",
  ]) {
    check(`quest column ${c}`, names.includes(c));
  }

  // 11. Idempotency: re-running the migration SQL is a no-op
  try {
    await admin.query(readSql("0004_innerloop.sql"));
    check("migration SQL is re-runnable", true);
  } catch (err) {
    check(
      "migration SQL is re-runnable",
      false,
      err instanceof Error ? err.message : err,
    );
  }

  // Close every pool before stopping the server so shutdown stays quiet.
  try {
    const { pool: appPool } = await import("@/db");
    await appPool.end();
  } catch {
    /* already closed */
  }
  await admin.end().catch(() => undefined);
  console.log(failures === 0 ? "\nE2E PASS ✅" : `\nE2E FAIL ❌ ${failures}`);
  // Give sockets a tick to close before stopping postgres.
  await new Promise((r) => setTimeout(r, 300));
  await pg.stop().catch(() => undefined);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("e2e crashed:", err);
  process.exit(1);
});
