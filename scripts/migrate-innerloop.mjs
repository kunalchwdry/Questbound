// Targeted additive InnerLoop migration runner, modelled after
// scripts/migrate-community.mjs. Safe against re-runs, verified by
// fingerprints before/after, never invokes drizzle push, never resets data.
//
// Usage:
//   node scripts/migrate-innerloop.mjs --dry-run   (validates & rolls back)
//   node scripts/migrate-innerloop.mjs --apply     (applies and commits)
import dotenv from "dotenv";
import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";

dotenv.config({ path: ".env.local", quiet: true });

const apply = process.argv.includes("--apply");
const files = ["0004_innerloop.sql"];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (set it in .env.local).");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

// Row fingerprints must be limited to columns that existed BEFORE the
// migration: row_to_json() over the full row legitimately changes when an
// additive migration adds columns (new keys appear, e.g. quest_status), which
// would falsely flag a safe additive migration as "rows changed". Hashing
// only the pre-existing column set still proves existing data is untouched.
async function fingerprint(table, cols) {
  const colList = cols.map((col) => `x."${col}"`).join(", ");
  return (
    await c.query(
      `SELECT count(*)::int AS count,
              md5(coalesce(string_agg(j, '|' ORDER BY j), '')) AS fingerprint
       FROM (
         SELECT row_to_json((SELECT y FROM (SELECT ${colList}) y))::text AS j
         FROM public."${table}" x
       ) sub`,
    )
  ).rows[0];
}

async function fingerprints(colsByTable) {
  if (!colsByTable) {
    colsByTable = {};
    const ts = (
      await c.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows;
    for (const { tablename: t } of ts) {
      colsByTable[t] = (
        await c.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
          [t],
        )
      ).rows.map((r) => r.column_name);
    }
  }
  const out = {};
  for (const [t, cols] of Object.entries(colsByTable)) {
    out[t] = await fingerprint(t, cols);
  }
  return { values: out, colsByTable };
}

try {
  await c.connect();
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await c.query("SET LOCAL lock_timeout='10s'");
  await c.query("SET LOCAL statement_timeout='60s'");
  // Distinct advisory key from the community migration runner (71344,1) so
  // the two processes can never interleave.
  await c.query("SELECT pg_advisory_xact_lock(71344,2)");

  const { values: before, colsByTable } = await fingerprints();

  await c.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await c.query(
    "CREATE TABLE IF NOT EXISTS drizzle.community_migrations(name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );

  for (const file of files) {
    const sql = fs.readFileSync(`drizzle/${file}`, "utf8");
    const hash = crypto.createHash("sha256").update(sql).digest("hex");
    const old = (
      await c.query(
        "SELECT sha256 FROM drizzle.community_migrations WHERE name=$1",
        [file],
      )
    ).rows[0];
    if (old) {
      if (old.sha256 !== hash) {
        throw new Error(
          `Applied migration changed: ${file}. Write a new migration instead.`,
        );
      }
      console.log(`Already applied: ${file}`);
      continue;
    }
    await c.query(sql);
    await c.query(
      "INSERT INTO drizzle.community_migrations(name,sha256) VALUES($1,$2)",
      [file, hash],
    );
    console.log(`Validated: ${file}`);
  }

  const { values: after } = await fingerprints(colsByTable);

  // Verify all pre-existing rows are preserved over the pre-existing column
  // set (only brand-new tables may appear in `after`).
  for (const [table, value] of Object.entries(before)) {
    if (JSON.stringify(value) !== JSON.stringify(after[table])) {
      throw new Error(`Existing rows changed unexpectedly in ${table}`);
    }
  }
  // Informational only: enumerate tables that appeared during the migration.
  const tablesAfter = (
    await c.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  const newTables = tablesAfter.filter((t) => !(t in colsByTable));
  console.log(
    newTables.length
      ? `New tables created: ${newTables.join(", ")}`
      : "No new tables (columns only).",
  );

  const report = {
    mode: apply ? "applied" : "dry-run rolled back",
    checkedAt: new Date().toISOString(),
    existingRowsPreserved: true,
    tables: Object.fromEntries(
      Object.entries(before).map(([k, v]) => [k, v.count]),
    ),
    newTables,
  };
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(
    `docs/migration-innerloop-${apply ? "applied" : "dry-run"}.json`,
    JSON.stringify(report, null, 2),
  );

  if (apply) {
    await c.query("COMMIT");
    console.log("✅ Applied. Report → docs/migration-innerloop-applied.json");
  } else {
    await c.query("ROLLBACK");
    console.log(
      "✅ Dry-run OK (rolled back). Report → docs/migration-innerloop-dry-run.json",
    );
  }
} catch (err) {
  try {
    await c.query("ROLLBACK");
  } catch {}
  console.error("❌ Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
