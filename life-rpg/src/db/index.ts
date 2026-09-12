import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

// Enable TLS for cloud Postgres (Supabase/Neon/…); leave it off for a local
// Docker Postgres on 127.0.0.1. Supabase certificates are publicly trusted.
const isLocal = /@(127\.0\.0\.1|localhost)(:|\/)/.test(databaseUrl);
const usePooler = /(pgbouncer=true|pooler\.supabase)/.test(databaseUrl);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    // Transaction poolers (Supavisor/PgBouncer) keep connections short-lived;
    // keep the pool modest so serverless functions don't exhaust it.
    max: usePooler ? 10 : 20,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
