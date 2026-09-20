#!/usr/bin/env node
/**
 * Sandbox database: starts an embedded PostgreSQL with the FULL Questbound
 * schema applied (0000 → 0004 + production-drift guards), then stays alive.
 *
 * Data lives in .cache/sandbox-pg (git- and snapshot-excluded), so the demo
 * database persists across restarts but is never committed.
 *
 *   node scripts/sandbox-db.mjs          # keeps running; Ctrl-C to stop
 *
 * Requires: npm i --no-save embedded-postgres
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".cache", "sandbox-pg");
const PORT = Number(process.env.SANDBOX_PG_PORT ?? 55432);
export const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
} catch {
  console.error(
    "[sandbox-db] embedded-postgres is not installed.\nRun: npm i --no-save embedded-postgres",
  );
  process.exit(1);
}

const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: PORT,
  user: "postgres",
  password: "postgres",
  persistent: true,
});

if (fresh) {
  console.log("[sandbox-db] initialising data directory:", dataDir);
  await pg.initialise();
}
console.log("[sandbox-db] starting postgres on 127.0.0.1:" + PORT);
await pg.start();

const { default: pgmod } = await import("pg");
const admin = new pgmod.Pool({ connectionString: DATABASE_URL });

const readSql = (f) =>
  fs
    .readFileSync(path.join(root, "drizzle", f), "utf8")
    .replace(/--> statement-breakpoint/g, "");

// Supabase shims: 0003 hardening references Supabase-native roles
// (anon, authenticated) and auth.uid(), none of which exist in a vanilla
// embedded Postgres. Provide no-op stand-ins so the migration applies as-is.
// RLS stays irrelevant at runtime: the app always connects as the owner.
await admin.query(`
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN;
    END IF;
  END $$;
`);
console.log("[sandbox-db] supabase role/auth shims in place");

// Every migration is written additive/idempotent; the try/catch makes a
// second start over an existing data directory a safe no-op.
const MIGRATIONS = [
  "0000_init.sql",
  "0001_ai_configs.sql",
  "0002_community_baseline.sql",
  "0003_community_security.sql",
  "0004_innerloop.sql",
];
for (const file of MIGRATIONS) {
  try {
    await admin.query(readSql(file));
    console.log("[sandbox-db] applied", file);
  } catch (err) {
    console.warn(
      "[sandbox-db] %s: %s (tolerated — rerun over existing schema)",
      file,
      String(err?.message ?? err).split("\n")[0],
    );
  }
}
// Production-drift guards (no-op when 0002/0003 already added the columns).
await admin
  .query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_visible boolean NOT NULL DEFAULT true;
     ALTER TABLE users ADD COLUMN IF NOT EXISTS leaderboard_opt_out boolean NOT NULL DEFAULT false;`,
  )
  .catch(() => undefined);

await admin.end();
console.log("[sandbox-db] SANDBOX DB READY → " + DATABASE_URL);

// Keep the database alive until the process is stopped.
const shutdown = async () => {
  console.log("[sandbox-db] stopping…");
  await pg.stop().catch(() => undefined);
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
setInterval(() => {}, 1 << 30);
