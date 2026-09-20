#!/usr/bin/env node
/**
 * Sandbox demo seed: one hero with a believable two-week history so every
 * screen shows something on first load — today's plan, an active goal,
 * a Chronicle backlog, and enough completions/events for Insights.
 *
 * Idempotent: if the hero already exists the script exits without touching
 * anything, so completed demo work is never reset.
 *
 *   node scripts/sandbox-seed.mjs
 */
import pg from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
const AUTH_ID = "00000000-0000-4000-8000-000000000001"; // matches src/lib/auth.ts

const DAY = 86400_000;
const now = Date.now();
const dayStr = (offsetDays = 0) =>
  new Date(now + offsetDays * DAY).toISOString().slice(0, 10);
/** UTC timestamp `offsetDays` from today at hour:minute. */
const at = (offsetDays, hour, minute = 0) => {
  const d = new Date(now + offsetDays * DAY);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute),
  );
};

const pool = new pg.Pool({ connectionString: url });

const insertQuest = (q) =>
  pool
    .query(
      `INSERT INTO quests
         (user_id, title, notes, attribute, difficulty, type, due_date,
          completed_at, last_completed_on, times_completed, created_at, updated_at,
          goal_id, estimated_minutes, scheduled_for, scheduled_order,
          plan_context, quest_status)
       VALUES ($1,$2,$3,$4,$5,'once',$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,'active')
       RETURNING id`,
      [
        q.userId, q.title, q.notes ?? null, q.attribute, q.difficulty,
        q.dueDate ?? null,
        q.completedAt ?? null,
        q.completedAt ? q.completedAt.toISOString().slice(0, 10) : null,
        q.completedAt ? 1 : 0, q.createdAt,
        q.goalId ?? null, q.est ?? null, q.scheduledFor ?? null,
        q.order ?? null,
        q.planContext ? JSON.stringify(q.planContext) : null,
      ],
    )
    .then((r) => r.rows[0].id);

const insertCompletion = (c) =>
  pool.query(
    `INSERT INTO completions
       (user_id, quest_id, title, attribute, difficulty, xp, gold, crit,
        multiplier_pct, streak_after, completed_on, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      c.userId, c.questId, c.title, c.attribute, c.difficulty, c.xp, c.gold,
      c.crit ?? false, c.crit ? 150 : 100, c.streakAfter ?? 0,
      c.completedOn, c.completedAt,
    ],
  );

const insertEvent = (e) =>
  pool.query(
    `INSERT INTO quest_events
       (user_id, quest_id, event, scheduled_for, from_day, to_day,
        energy_level, mood_tag, meta, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      e.userId, e.questId ?? null, e.event, e.scheduledFor ?? null,
      e.fromDay ?? null, e.toDay ?? null, e.energy ?? null, e.mood ?? null,
      e.meta ? JSON.stringify(e.meta) : null, e.createdAt,
    ],
  );

async function main() {
  const existing = await pool.query(
    "SELECT id FROM users WHERE auth_id = $1",
    [AUTH_ID],
  );
  if (existing.rows[0]) {
    console.log("[sandbox-seed] hero already exists (id %s) — nothing to do", existing.rows[0].id);
    return;
  }

  const created10dAgo = at(-10, 8);
  const { rows: urows } = await pool.query(
    `INSERT INTO users
       (auth_id, email, display_name, class_key, timezone,
        xp, gold, streak, longest_streak, last_active_date, onboarded_at,
        strength_xp, intellect_xp, vitality_xp, charisma_xp, discipline_xp, creativity_xp,
        created_at)
     VALUES ($1,'hero@questbound.local','Sandbox Hero','knight','UTC',
             345, 128, 3, 6, $2, $3,
             20, 95, 65, 40, 75, 50, $3)
     RETURNING id`,
    [AUTH_ID, dayStr(-1), created10dAgo],
  );
  const userId = urows[0].id;
  console.log("[sandbox-seed] hero created, id", userId);

  // -- Goal (campaign) with one child quest on today's plan -----------------
  const { rows: grows } = await pool.query(
    `INSERT INTO goals (user_id, title, attribute, status, notes, created_at, updated_at)
     VALUES ($1,'Launch my portfolio website','creativity','active',
             'Ship v1 before the guild showcase.', $2,$2) RETURNING id`,
    [userId, created10dAgo],
  );
  const goalId = grows[0].id;

  // -- Today's plan (mirrors exactly what Plan My Day writes) ---------------
  const planMood = "calm";
  const planEnergy = "medium";
  const planCtx = (size) => ({ source: "plan", energy: planEnergy, mood: planMood, size });
  const planned = [
    { title: "Design the portfolio hero section", attribute: "creativity", difficulty: "medium", est: 45, size: "medium", goalId, dueDate: dayStr(4), notes: "Mock the above-the-fold layout in Figma." },
    { title: "Read 20 pages of Deep Work", attribute: "intellect", difficulty: "easy", est: 25, size: "small" },
    { title: "Close out the Q3 invoice spreadsheet", attribute: "discipline", difficulty: "hard", est: 60, size: "large", dueDate: dayStr(1), notes: "Client is waiting — due tomorrow." },
  ];
  const planIds = [];
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const id = await insertQuest({
      userId, title: p.title, notes: p.notes, attribute: p.attribute,
      difficulty: p.difficulty, dueDate: p.dueDate, createdAt: at(0, 8),
      goalId: p.goalId, est: p.est, scheduledFor: dayStr(0), order: i,
      planContext: planCtx(p.size),
    });
    planIds.push(id);
    await insertEvent({
      userId, questId: id, event: "scheduled", scheduledFor: dayStr(0),
      energy: planEnergy, mood: planMood, meta: { size: p.size, order: i },
      createdAt: at(0, 8),
    });
  }
  await pool.query(
    `INSERT INTO plan_sessions
       (user_id, day, goal_text, energy_level, mood_tag, available_minutes,
        quest_ids, explanation, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      userId, dayStr(0), "Portfolio launch week — make visible progress",
      planEnergy, planMood, 150, planIds,
      "I packed your 150 minutes into three quests (130 scheduled, 20 kept as slack). The invoice is due tomorrow, so it anchors the day; the design task rides your creative momentum; reading is your low-friction warmup.",
      at(0, 8),
    ],
  );

  // -- Backlog (unscheduled active quests) ----------------------------------
  const backlog = [
    { title: "Morning run — riverside loop", attribute: "vitality", difficulty: "easy", est: 30 },
    { title: "Sketch three logo concepts for the guild", attribute: "creativity", difficulty: "medium", est: 40 },
    { title: "Book dentist appointment", attribute: "vitality", difficulty: "trivial", est: 10 },
  ];
  for (const b of backlog) {
    await insertQuest({ userId, ...b, createdAt: at(-3, 9) });
  }
  const backlogBigId = await insertQuest({
    userId, title: "Write the full case-study chapter", attribute: "charisma",
    difficulty: "hard", est: 90, createdAt: at(-6, 9),
    notes: "Client interview write-up. Big — a split candidate.",
  });

  // -- Two weeks of completions (the Chronicle + Insights feed) -------------
  const history = [
    { off: -9, h: 18, title: "Write the launch-page outline", attribute: "creativity", difficulty: "easy", est: 20, xp: 20, gold: 10, scheduled: false },
    { off: -8, h: 17, title: "Grocery run for the week", attribute: "vitality", difficulty: "trivial", est: 10, xp: 10, gold: 5, scheduled: false },
    { off: -6, h: 18, title: "Study the TypeScript generics chapter", attribute: "intellect", difficulty: "medium", est: 45, xp: 40, gold: 18, scheduled: true },
    { off: -5, h: 7, title: "Evening walk — 40 minutes", attribute: "vitality", difficulty: "easy", est: 25, xp: 20, gold: 10, scheduled: true },
    { off: -4, h: 20, title: "Refactor the invoice template", attribute: "discipline", difficulty: "medium", est: 45, xp: 40, gold: 18, scheduled: true, crit: true },
    { off: -3, h: 18, title: "Draft case-study interview questions", attribute: "charisma", difficulty: "medium", est: 45, xp: 40, gold: 18, scheduled: true },
    { off: -2, h: 19, title: "Read 20 pages of Atomic Habits", attribute: "intellect", difficulty: "easy", est: 25, xp: 20, gold: 10, scheduled: true },
    { off: -1, h: 18, title: "Plan portfolio grid breakpoints", attribute: "creativity", difficulty: "easy", est: 20, xp: 20, gold: 10, scheduled: true },
  ];
  const logoId = await insertQuest({
    userId, title: "Pick a display typeface", attribute: "creativity",
    difficulty: "easy", est: 20, createdAt: at(-4, 9),
  });
  for (const h of history) {
    const qid = await insertQuest({
      userId, title: h.title, attribute: h.attribute, difficulty: h.difficulty,
      est: h.est, completedAt: at(h.off, h.h), createdAt: at(h.off - 1, 9),
    });
    await insertCompletion({
      userId, questId: qid, title: h.title, attribute: h.attribute,
      difficulty: h.difficulty, xp: h.xp, gold: h.gold, crit: h.crit,
      streakAfter: 0, completedOn: dayStr(h.off), completedAt: at(h.off, h.h),
    });
    if (h.scheduled) {
      await insertEvent({
        userId, questId: qid, event: "scheduled", scheduledFor: dayStr(h.off),
        createdAt: at(h.off, 8),
      });
    }
    await insertEvent({
      userId, questId: qid, event: "completed", createdAt: at(h.off, h.h),
      meta: { xp: h.xp, gold: h.gold },
    });
  }

  // -- The misses: scheduled-but-unfinished work (drives the honest 55 %) ---
  // "Pick a display typeface" was scheduled and quietly dropped.
  await insertEvent({
    userId, questId: logoId, event: "scheduled", scheduledFor: dayStr(-3),
    createdAt: at(-3, 8),
  });
  // The big case-study chapter was scheduled, then postponed — twice.
  await insertEvent({
    userId, questId: backlogBigId, event: "scheduled", scheduledFor: dayStr(-6),
    createdAt: at(-6, 8),
  });
  await insertEvent({
    userId, questId: backlogBigId, event: "postponed",
    fromDay: dayStr(-6), toDay: dayStr(-2), createdAt: at(-6, 21),
    meta: { reason: "less-time" },
  });

  // -- Morning check-ins -----------------------------------------------------
  const checkinDays = [
    { off: -6, mood: 3, emotion: "tired", note: "Slept badly." },
    { off: -5, mood: 4, emotion: "calm" },
    { off: -4, mood: 5, emotion: "joy", note: "Template refactor finally clicked!" },
    { off: -3, mood: 3, emotion: "anxious" },
    { off: -2, mood: 4, emotion: "neutral" },
    { off: -1, mood: 4, emotion: "calm" },
    { off: 0, mood: 4, emotion: "calm", note: "Ready for a solid day." },
  ];
  for (const c of checkinDays) {
    await pool.query(
      `INSERT INTO checkins (user_id, mood, emotion, note, day, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, c.mood, c.emotion, c.note ?? null, dayStr(c.off), at(c.off, 8, 15)],
    );
  }

  console.log("[sandbox-seed] done — 3 quests planned today, 4 in backlog, 8 chronicle entries");
}

main()
  .catch((err) => {
    console.error("[sandbox-seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
