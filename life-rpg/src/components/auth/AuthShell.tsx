import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="app-bg flex min-h-dvh flex-col" data-theme="midnight">
      <header className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-wider text-gold-2">
          <span aria-hidden="true" className="text-2xl">⚜</span>
          Questbound
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">
        <section
          aria-labelledby="auth-title"
          className="panel panel-gilded rise grid w-full max-w-4xl overflow-hidden md:grid-cols-2"
        >
          {/* Artwork panel (decorative on tablet/desktop; the form is the focus on mobile) */}
          <div className="relative hidden min-h-[26rem] md:block">
            <Image
              src="/images/hero.jpg"
              alt="A glowing guild ledger open on a candle-lit desk beneath a starry window"
              fill
              priority
              sizes="(min-width: 768px) 400px, 0px"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#0c0a1d]/85 via-[#0c0a1d]/25 to-[#0c0a1d]/40"
            />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="font-display text-xl font-bold text-ink">
                Every task is a quest.
              </p>
              <p className="mt-1 text-sm text-ink/70">
                Every day is a chapter. Seal a quest, watch your legend grow.
              </p>
            </div>
          </div>

          {/* Form panel */}
          <div className="p-6 sm:p-8">
            <p className="eyebrow mb-2">Guild registry</p>
            <h1 id="auth-title" className="font-display text-3xl font-bold">
              {title}
            </h1>
            <p className="mb-6 mt-2 text-sm text-muted">{subtitle}</p>
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}
