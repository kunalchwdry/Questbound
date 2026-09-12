# Deploying Questbound (Vercel + Supabase)

Questbound is a Next.js 16 (App Router) app with a PostgreSQL database and
Supabase Auth. The easiest production setup is **Supabase** (database + login)
and **Vercel** (the Next.js app). Both have free tiers.

- **App framework:** Next.js 16, Node runtime (Node ≥ 20)
- **Auth:** Supabase Auth (GoTrue) via `@supabase/ssr` (httpOnly JWT cookies)
- **Database:** Supabase Postgres through the **Supavisor transaction pooler**
- **AI:** keyless free models work out of the box (optional keyed providers)

---

## 1. One-time Supabase setup (already done for the current project)

These steps are complete for project `tencwroacamoszruytvk` (region
`ap-northeast-2`, Seoul). They are documented here so you can reproduce them in
a fresh project.

1. Create a project at <https://supabase.com/dashboard>.
2. **Apply the schema.** The app manages tables with Drizzle. Because the
   transaction pooler (recommended for serverless) doesn't support
   `drizzle-kit push` introspection well, generate SQL and apply it once:

   ```bash
   # uses DATABASE_URL from .env
   npm run db:generate -- --name init
   # apply the generated SQL through the pooler (psql), e.g.:
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0000_init.sql
   ```

   (For this project all 8 tables were already applied.)
3. **Email confirmation.** Authentication → Sign In / Providers → Email:
   - Turn **"Confirm email" OFF** for instant sign-in (great for demos), or
   - leave it ON; the signup screen then shows a "check your inbox" state.
   The current project returns sessions immediately (auto-confirm on).
4. **Row Level Security** is left as created by Drizzle (RLS off on these
   tables). The app connects with the server-side pooler credentials and never
   touches Postgres from the browser, so this matches the trusted-server
   design. Do **not** expose the database password to the client.

### Connection strings (project `tencwroacamoszruytvk`)

| Use | Host | Port | User |
| --- | --- | --- | --- |
| App on Vercel / serverless (**recommended**) | `aws-0-ap-northeast-2.pooler.supabase.com` | **6543** (transaction) | `postgres.tencwroacamoszruytvk` |
| Migrations that need a session (rare) | `aws-1-ap-northeast-2.pooler.supabase.com` | 5432 (session) | `postgres.tencwroacamoszruytvk` |
| Direct (IPv4-restricted) | `db.tencwroacamoszruytvk.supabase.co` | 5432 | `postgres` |

**Percent-encode special characters in the password inside the URL**
(`#`→`%23`, `@`→`%40`). The app enables TLS automatically for non-local hosts,
so no `sslmode` parameter is required.

---

## 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and in
`.env` locally; see `.env.example`).

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres.tencwroacamoszruytvk:<encoded-password>@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tencwroacamoszruytvk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's **publishable/anon** key |
| `SUPABASE_URL` | same as above |
| `SUPABASE_ANON_KEY` | same publishable/anon key |
| `NEXT_PUBLIC_SITE_URL` | your deployed URL, e.g. `https://questbound.vercel.app` |
| `AI_PROVIDER` | *(optional)* leave empty for keyless ensemble, or `local`, a keyless id, or `gemini`/`groq`/`nvidia`/`openai`/`custom` |
| `AI_ALLOW_KEYLESS` | `true` (default) |
| `AI_API_KEY` | *(optional)* a keyed-provider key |

Only the `NEXT_PUBLIC_*` values are safe in the browser. Keep the database
password and any service-role key server-side only.

---

## 3. Deploy on Vercel

1. Push the code to GitHub/GitLab/Bitbucket.
2. At <https://vercel.com/new>, import the repository.
3. Framework preset: **Next.js** (auto-detected). Build command `next build`,
   output the default. Set the **Node.js version to 20 or 22** (Project →
   Settings → General).
4. Add every environment variable from the table above for the **Production**
   environment (and Preview if you want previews to work).
5. Click **Deploy**.

No release-time migration step is needed — the schema is already in Supabase.
When you change the schema later:

```bash
npm run db:generate -- --name <change>
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/000x_<change>.sql
```

### Auth cookies / embedded previews

Supabase stores its session in two chunked httpOnly cookies (`sb-<ref>-auth-token.0/.1`).
The app sets them to `SameSite=Lax` on localhost and to **`SameSite=None; Secure`**
on every non-localhost host (`src/lib/supabase.ts`). The latter is required so
login works when the app is viewed inside a cross-site/embedded preview; it is
also fine on a normal Vercel domain. The `proxy.ts` middleware refreshes the
session on every request (the official `@supabase/ssr` pattern).

### Post-deploy checks
- Open the site → sign up a new hero → you land in `/guild` with starter quests.
- Seal a quest (XP/gold update) and refresh — data persists in Supabase.
- In Supabase → Table Editor you should see rows in `public.users` and
  `public.quests`; auth identities live under Authentication → Users.

---

## 4. How auth now works

- `/api/auth/signup` and `/api/auth/login` call Supabase Auth server-side with
  `@supabase/ssr`, which sets the GoTrue JWT as httpOnly cookies.
- Each authenticated request calls `supabase.auth.getUser()` to **validate the
  token**, then `ensureAppUser()` lazily creates/loads the matching
  `public.users` profile (linked by `auth_id`) and seeds starter quests once.
- All game logic, rewards and transactions remain server-authoritative.
- `proxy.ts` redirects anonymous `/guild` visits based on the presence of the
  `sb-<ref>-auth-token` cookie; the page re-validates the token.

---

## 5. Other hosts

### Railway / Render / Fly (Node server)
- Use `npm run build` then `npm start` (Next starts on `$PORT`).
- Set the same environment variables; use the transaction pooler
  (`...:6543...?pgbouncer=true`) so instances don't exhaust Postgres
  connections.
- Ensure the service exposes the port Next prints and terminates TLS publicly.

### Docker (optional)
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
```

---

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `SELF_SIGNED_CERT_IN_CHAIN` on queries | Remove `sslmode=require` from `DATABASE_URL`; the app sets TLS with loose CA verification for poolers. Use `sslmode=no-verify`-equivalent via the app config. |
| `tenant/user postgres.<ref> not found` on port 5432 | Use the correct regional pooler host, or the transaction pooler on **6543**. |
| Sign-up says "confirm your email" | Disable **Confirm email** in Supabase Auth settings, or click the mailed link. |
| Login fails `Invalid login credentials` | Confirm the email/password; check `NEXT_PUBLIC_SUPABASE_URL` and the anon key match the project. |
| `drizzle-kit push` hangs on the pooler | Use `npm run db:generate` + apply the SQL with `psql` (see §1), or run push over the session pooler / a direct connection. |
| Oracle replies from the local model | The free keyless endpoints can rate-limit shared IPs; the app falls back safely. Add a Groq/Gemini key for stable cloud replies. |
