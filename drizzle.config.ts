import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
config({path:".env.local",quiet:true});

if (process.argv.includes("push")) throw new Error("db:push is disabled for this populated, adopted schema. Use npm run db:check and npm run db:migrate with reviewed additive SQL migrations.");

/**
 * Full adopted RPG + social schema for generating reviewed migrations.
 * The database is populated and was ahead of the original checkout.
 * Use npm run db:check / db:migrate; never push/reset the production schema.
 * Functions, grants and triggers are versioned in the additive SQL migrations.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/db/schema.ts", "./src/db/community-schema.ts"],
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
