import { NavLink, Outlet } from 'react-router'

const NAV_ITEMS = [
  { to: '/', label: 'Goals', end: true },
  { to: '/buckets', label: 'Buckets', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white" aria-hidden="true">
              ◎
            </span>
            <span className="hidden sm:inline">Goal Tracker</span>
          </NavLink>
          <nav aria-label="Main">
            <ul className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-2 text-sm font-medium ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100'
                          : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
