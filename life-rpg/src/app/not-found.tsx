import Link from "next/link";

export default function NotFound() {
  return (
    <div className="app-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center" data-theme="midnight">
      <p className="eyebrow">404</p>
      <p className="mt-4 text-6xl" aria-hidden="true">
        🗺️
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">This page left the map</h1>
      <p className="mt-3 max-w-md text-muted">
        The cartographer has no record of this hall. Return to the guild gates and try another door.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          Back to the gates
        </Link>
        <Link href="/guild" className="btn btn-ghost">
          Guild Hall
        </Link>
      </div>
    </div>
  );
}
