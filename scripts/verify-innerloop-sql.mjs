// Runs the InnerLoop migration SQL against an in-memory Postgres (pg-mem) to
// catch syntax errors without touching a real database.
import { newDb } from "pg-mem";
import fs from "node:fs";

const base = newDb();
const { Pool } = base.adapters.createPg();
const pool = new Pool();
const q = (sql, params) => pool.query(sql, params);

// Strip DO blocks — pg-mem doesn't implement plpgsql. The DO wrapper in the
// real migration only guards duplicate type/column creation, so for syntax
// verification we execute the inner statement unguarded on the first pass and
// tolerate "already exists" errors on the second.
function explodeDoBlocks(sql) {
  return sql.replace(
    /DO \$\$ BEGIN\s*([\s\S]*?)\s*EXCEPTION WHEN duplicate_(?:object|column) THEN NULL;\s*END \$\$;?/g,
    (_, body) => body,
  );
}

// Minimal pre-existing schema so the migration's FKs/ALTERs resolve.
const pre = `
CREATE TABLE users (id serial PRIMARY KEY);
CREATE TYPE attribute AS ENUM ('strength','intellect','vitality','charisma','discipline','creativity');
CREATE TYPE difficulty AS ENUM ('trivial','easy','medium','hard','epic');
CREATE TYPE quest_type AS ENUM ('daily','habit','once');
CREATE TABLE quests (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  title varchar(120) NOT NULL,
  notes text,
  attribute attribute NOT NULL,
  difficulty difficulty NOT NULL DEFAULT 'medium',
  type quest_type NOT NULL DEFAULT 'once',
  due_date varchar(10),
  completed_at timestamptz,
  last_completed_on varchar(10),
  times_completed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO users(id) VALUES (1);
INSERT INTO quests(user_id, title, attribute) VALUES (1, 'Sample','intellect');
`;

const migrateRaw = fs.readFileSync(new URL("../drizzle/0004_innerloop.sql", import.meta.url), "utf8");
const migrate = explodeDoBlocks(migrateRaw);

try {
  await q(pre);
  console.log("✓ base schema prepared");
} catch (err) {
  console.error("✗ base schema failed:", err.message);
  process.exit(1);
}

async function runStatements(sql, tolerateExisting) {
  // Strip line comments, then split on ';' at top level (no $$ bodies here).
  const clean = sql.replace(/^\s*--.*$/gm, "");
  const stmts = clean
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of stmts) {
    try {
      await q(s);
    } catch (err) {
      if (tolerateExisting && /already exists/i.test(err.message)) continue;
      // pg-mem can't plan "CREATE TABLE IF NOT EXISTS" — verify the table
      // exists directly instead of re-executing (real Postgres handles it).
      if (tolerateExisting && /^CREATE TABLE IF NOT EXISTS (\w+)/i.test(s)) {
        const name = /^CREATE TABLE IF NOT EXISTS (\w+)/i.exec(s)[1];
        const { rows } = await q(
          "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
          [name],
        );
        if (rows.length === 1) continue;
      }
      throw err;
    }
  }
}

try {
  await runStatements(migrate, false);
  console.log("✓ 0004_innerloop.sql executed cleanly");
} catch (err) {
  console.error("✗ migration failed:", err.message);
  process.exit(1);
}

try {
  await runStatements(migrate, true);
  console.log("✓ idempotent: second run only hits tolerated 'already exists' cases");
} catch (err) {
  console.error("✗ second run failed:", err.message);
  process.exit(1);
}

const { rows: cols } = await q(
  "SELECT column_name FROM information_schema.columns WHERE table_name='quests' ORDER BY ordinal_position",
);
const names = cols.map((c) => c.column_name);
const expected = [
  "parent_quest_id",
  "estimated_minutes",
  "scheduled_for",
  "scheduled_order",
  "plan_context",
  "quest_status",
  "goal_id",
];
const missing = expected.filter((c) => !names.includes(c));
if (missing.length) {
  console.error("✗ missing quest columns:", missing);
  process.exit(1);
}
console.log("✓ quests columns present:", expected.join(", "));

const { rows: tbls } = await q(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
);
const tnames = tbls.map((t) => t.table_name);
for (const t of ["goals", "plan_sessions", "quest_events"]) {
  if (!tnames.includes(t)) {
    console.error(`✗ table ${t} missing`);
    process.exit(1);
  }
}
console.log("✓ new tables exist:", ["goals", "plan_sessions", "quest_events"].join(", "));

// pg-mem doesn't expose created enums in pg_type; probe each with a cast.
const enumProbes = {
  energy_level: "high",
  quest_event_kind: "started",
  plan_status: "active",
};
for (const [e, v] of Object.entries(enumProbes)) {
  try {
    await q(`SELECT '${v}'::${e} AS probe`);
  } catch (err) {
    console.error(`✗ enum ${e} missing or unusable:`, err.message);
    process.exit(1);
  }
}
console.log("✓ enums exist:", Object.keys(enumProbes).join(", "));

console.log("\n✅ InnerLoop migration verified");
process.exit(0);
