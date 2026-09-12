import { defineConfig } from "drizzle-kit";

/**
 * Uses DATABASE_URL from the environment so the same command applies the
 * schema to a local Docker/Postgres instance or to a cloud database
 * (Neon / Supabase / Railway / Render):
 *
 *   npx drizzle-kit push                         # local dev (fallback below)
 *   DATABASE_URL='postgres://…' npx drizzle-kit push   # any remote database
 *
 * For serverless Postgres (Neon, Supabase poolers) run the push against the
 * direct / non-pooled connection string, and let the app use the pooled one.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
