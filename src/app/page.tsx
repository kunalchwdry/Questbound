import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { ATTRIBUTES, ATTRIBUTE_META } from "@/lib/game";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: "📜",
    title: "Quests, not chores",
    body: "Post one-off quests, dailies that reset at dawn, and habits you can log up to five times a day. Each one pays out XP and gold the second you seal it.",
  },
  {
    icon: "⚔️",
    title: "Six attributes to level",
    body: "Gym raises Strength. Reading raises Intellect. Calling a friend raises Charisma. Watch a character sheet that actually looks like you.",
  },
  {
    icon: "🔥",
    title: "Streaks with mercy",
    body: "Consecutive days multiply your XP up to +60%. Miss a day? A Streak Shield from the Armory absorbs the hit automatically — no punishment, no guilt spirals.",
  },
  {
    icon: "🎲",
    title: "Critical hits",
    body: "Every completion has a 10% chance to crit for double gold and 1.5× XP. Small, honest variable rewards keep the loop exciting without slot-machine tricks.",
  },
  {
    icon: "🏪",
    title: "The Armory",
    body: "Spend gold on titles, companions, profile crests, whole colour themes, and consumables like the Elixir of Insight for double XP.",
  },
  {
    icon: "📖",
    title: "The Chronicle",
    body: "Every deed is written into an immutable ledger on the server: what you did, what it paid, and what your streak was at the time.",
  },
  {
    icon: "🔮",
    title: "The Oracle — an emotion-aware companion",
    body: "Tell it how you actually feel. Free AI models work with no sign-up (or bring your own Gemini, Groq or OpenAI key), fused with an on-device emotion model. It reads your board and sizes the next quest to your energy — CBT-style, never guilt-tripping.",
  },
  {
    icon: "🐉",
    title: "Weekly boss & focus candle",
    body: "Every XP you earn this week is damage against a boss like the Procrastinator Wyrm. Light the candle timer on a quest and it seals itself when the wax runs out.",
  },
];

const STEPS = [
  {
    n: "I",
    title: "Create your hero",
    body: "Pick a class. A Knight gets +15% XP on Strength quests; a Mage on Intellect. It nudges the game toward the life you want.",
  },
  {
    n: "II",
    title: "Post quests",
    body: "Write the task, choose the attribute it trains and how hard it really is — from Trivial (10 XP) to Epic (150 XP).",
  },
  {
    n: "III",
    title: "Seal them & level up",
    body: "Tap the wax seal. XP bars fill, gold clinks, and levels cost more each time — so every ding feels earned.",
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();
  const primaryHref = user ? "/guild" : "/signup";
  const primaryLabel = user ? "Enter the Guild Hall" : "Begin your legend";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Questbound",
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Any",
    description:
      "A Life RPG that turns real-world tasks into quests with XP, gold, attributes, streaks and an item shop.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <div className="app-bg min-h-dvh" data-theme="midnight">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-wider text-gold-2">
          <span aria-hidden="true" className="text-2xl">⚜</span>
          Questbound
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-4">
          <a href="#features" className="hidden text-sm font-semibold text-muted hover:text-ink sm:inline">
            Features
          </a>
          <a href="#how" className="hidden text-sm font-semibold text-muted hover:text-ink sm:inline">
            How it works
          </a>
          {user ? (
            <Link href="/guild" className="btn btn-primary">
              Guild Hall
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      <main id="main">
        {/* Hero -------------------------------------------------------------- */}
        <section
          aria-labelledby="hero-title"
          className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-14"
        >
          <div className="rise">
            <p className="eyebrow mb-4">A Life RPG</p>
            <h1
              id="hero-title"
              className="font-display text-4xl font-bold leading-[1.05] text-ink sm:text-5xl lg:text-6xl"
            >
              Turn your to-do list into a{" "}
              <span className="bg-gradient-to-b from-gold-2 to-gold bg-clip-text text-transparent">
                legend.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Reading a book pays off in months. A quest pays off <em>now</em>.
              Questbound gives real life the instant feedback loops of a great
              game — XP, gold, attributes, streaks and loot — backed by a
              server that keeps your progress honest and synced everywhere.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={primaryHref} className="btn btn-primary text-base">
                {primaryLabel} <span aria-hidden="true">→</span>
              </Link>
              {!user && (
                <Link href="/login" className="btn btn-ghost text-base">
                  I already have a hero
                </Link>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Highlights">
              {["Non-linear leveling", "6 attributes", "Streak shields", "Critical hits", "Themes & companions"].map(
                (t) => (
                  <li key={t} className="chip">
                    {t}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="relative rise" style={{ animationDelay: "120ms" }}>
            <div className="panel panel-gilded overflow-hidden p-2">
              <Image
                src="/images/hero.jpg"
                alt="A glowing guild ledger on a candle-lit desk beneath a starry window"
                width={1536}
                height={1024}
                priority
                sizes="(min-width: 1024px) 560px, 100vw"
                className="h-auto w-full rounded-[0.8rem] object-cover"
              />
            </div>
            <div
              className="panel absolute -bottom-5 -left-3 flex items-center gap-3 px-4 py-3 sm:-left-8"
              aria-hidden="true"
            >
              <span className="seal" data-done="true">
                ✓
              </span>
              <div>
                <p className="text-sm font-bold">Read 20 pages</p>
                <p className="text-xs text-muted">
                  <span className="font-bold text-xp-2">+46 XP</span> ·{" "}
                  <span className="font-bold text-gold-2">+16 gold</span> · Intellect
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Attributes strip ------------------------------------------------- */}
        <section aria-label="Attributes" className="border-y border-line bg-panel/40">
          <ul className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px px-5 py-6 sm:grid-cols-3 sm:px-8 lg:grid-cols-6">
            {ATTRIBUTES.map((key) => (
              <li key={key} className="flex items-center gap-3 px-2 py-2">
                <span aria-hidden="true" className="text-2xl">
                  {ATTRIBUTE_META[key].icon}
                </span>
                <div>
                  <p className="font-display text-sm font-bold" style={{ color: `var(--attr-${key})` }}>
                    {ATTRIBUTE_META[key].label}
                  </p>
                  <p className="text-xs text-muted">{ATTRIBUTE_META[key].blurb}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Features ------------------------------------------------------------ */}
        <section id="features" aria-labelledby="features-title" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
          <p className="eyebrow mb-3">The systems</p>
          <h2 id="features-title" className="font-display text-3xl font-bold sm:text-4xl">
            Built like a game. Engineered like a bank.
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            All rewards are calculated on the server inside database transactions.
            The client can be fast and playful because it is never trusted.
          </p>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="panel p-6 transition-transform duration-300 hover:-translate-y-1">
                <span aria-hidden="true" className="text-3xl">
                  {f.icon}
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works -------------------------------------------------------- */}
        <section id="how" aria-labelledby="how-title" className="border-t border-line bg-panel/30">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
            <p className="eyebrow mb-3">How it works</p>
            <h2 id="how-title" className="font-display text-3xl font-bold sm:text-4xl">
              Three steps to your first level-up
            </h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="panel panel-gilded p-6">
                  <span className="font-display text-3xl font-bold text-gold" aria-hidden="true">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>

            <div className="panel mt-12 grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <h3 className="font-display text-xl font-bold">Designed from the research, not the hype</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  Progress bars exploit the goal-gradient effect; attributes satisfy
                  the need for competence; user-authored quests protect autonomy;
                  and streaks are softened with shields because loss-aversion
                  cuts both ways. There is no HP loss and no punishment for a bad
                  week — studies of punitive habit apps show it backfires.
                </p>
              </div>
              <Link href={primaryHref} className="btn btn-primary">
                {primaryLabel}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:px-8">
        <p>
          <span aria-hidden="true">⚜</span> Questbound — a Life RPG. Built with Next.js, PostgreSQL &amp; Drizzle.
        </p>
        <nav aria-label="Footer">
          <ul className="flex gap-4">
            <li>
              <Link href="/signup" className="hover:text-ink">
                Sign up
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-ink">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </footer>
    </div>
  );
}
