export default function GuildLoading() {
  return (
    <div className="app-bg min-h-dvh" aria-busy="true" aria-label="Loading your guild hall">
      <header className="sticky top-0 z-[60] border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="skeleton h-7 w-36" />
          <div className="flex gap-2">
            <div className="skeleton h-8 w-16 rounded-full" />
            <div className="skeleton h-8 w-14 rounded-full" />
          </div>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-24 pt-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <aside className="panel p-6">
          <div className="flex items-center gap-4">
            <div className="skeleton h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          </div>
          <div className="skeleton mt-6 h-3 w-full" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
          </div>
          <div className="mt-6 hidden space-y-4 lg:block">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-3 w-1/3" />
                <div className="skeleton h-2.5 w-full" />
              </div>
            ))}
          </div>
        </aside>
        <section>
          <div className="skeleton mb-4 h-12 w-full rounded-2xl" />
          <div className="panel p-5">
            <div className="skeleton h-6 w-40" />
            <div className="skeleton mt-2 h-3 w-64" />
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel flex items-center gap-3 p-4">
                <div className="skeleton h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-2/3" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
