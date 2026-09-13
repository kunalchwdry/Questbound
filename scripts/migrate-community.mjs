// Targeted additive adoption for a database already ahead of this checkout.
// Usage: node scripts/migrate-community.mjs --dry-run | --apply
// Never invokes drizzle push, resets data, or replays the legacy init migration.
import dotenv from "dotenv";
import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
dotenv.config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
const files = ["0002_community_baseline.sql", "0003_community_security.sql"];
async function fingerprints() {
  const ts = (
    await c.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('community_rate_limits') ORDER BY tablename",
    )
  ).rows;
  const out = {};
  for (const { tablename: t } of ts) {
    out[t] = (
      await c.query(
        `SELECT count(*)::int AS count,md5(coalesce(string_agg(row_to_json(x)::text,'|' ORDER BY row_to_json(x)::text),'')) AS fingerprint FROM public."${t}" x`,
      )
    ).rows[0];
  }
  return out;
}
try {
  await c.connect();
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await c.query("SET LOCAL lock_timeout='10s'");
  await c.query("SET LOCAL statement_timeout='60s'");
  await c.query("SELECT pg_advisory_xact_lock(71344,1)");
  const before = await fingerprints();
  // Adoption ledger is separate from historical Drizzle hashes: old remote SQL was
  // never journaled in this Git checkout, so pretending it was would be unsafe.
  await c.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await c.query(
    "CREATE TABLE IF NOT EXISTS drizzle.community_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
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
      if (old.sha256 !== hash)
        throw new Error(
          `Applied migration changed: ${file}. Write a new migration instead.`,
        );
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
  const after = await fingerprints();
  for (const [table, value] of Object.entries(before)) {
    if (JSON.stringify(value) !== JSON.stringify(after[table]))
      throw new Error(`Existing rows changed unexpectedly in ${table}`);
  }
  const report = {
    mode: apply ? "applied" : "dry-run rolled back",
    checkedAt: new Date().toISOString(),
    existingRowsPreserved: true,
    tables: Object.fromEntries(
      Object.entries(before).map(([k, v]) => [k, v.count]),
    ),
    migrations: files,
  };
  await c.query(apply ? "COMMIT" : "ROLLBACK");
  fs.writeFileSync(
    `docs/migration-${apply ? "applied" : "dry-run"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.error("Migration stopped:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
