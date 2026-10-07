import Link from "next/link";
import type { SessionStatus } from "@/lib/types";

/**
 * Sidebar = learning history, not chat history.
 *
 * Per prd.md > Screens and Layout, this lists ATTEMPTS: repeated attempts on
 * the same topic appear as separate rows rather than being grouped.
 */
export type SessionListItem = {
  id: string;
  topic: string;
  status: SessionStatus;
  created_at: string;
};

const statusLabel: Record<SessionStatus, string> = {
  in_progress: "In progress",
  completed: "—",
};

export function Sidebar({
  sessions,
  activeId,
}: {
  sessions: SessionListItem[];
  activeId?: string;
}) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-base-800 bg-base-900">
      <div className="px-5 pt-6 pb-5">
        <Link
          href="/teach"
          className="font-mono text-xs uppercase tracking-[0.18em] text-base-400 transition hover:text-base-300"
        >
          Feynman
          <br />
          in a Loop
        </Link>

        <Link
          href="/teach"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-base-700 px-3 py-2.5 text-sm font-medium text-base-200 transition hover:border-base-600 hover:bg-base-850 hover:text-base-100"
        >
          <span aria-hidden="true" className="text-base-400">
            +
          </span>
          New Session
        </Link>
      </div>

      <nav aria-label="Learning history" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <h2 className="px-2 pt-2 pb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-base-600">
          Today
        </h2>

        {sessions.length === 0 ? (
          <p className="px-2 py-1 text-sm leading-relaxed text-base-500">
            No attempts yet. Start one and teach something you just learned.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              return (
                <li key={s.id}>
                  <Link
                    href={`/teach/${s.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`block rounded-lg px-2.5 py-2.5 text-sm transition ${
                      isActive
                        ? "bg-base-800 text-base-100"
                        : "text-base-300 hover:bg-base-850 hover:text-base-200"
                    }`}
                  >
                    <span className="block truncate">{s.topic}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-base-500">
                      {statusLabel[s.status] ?? s.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-base-800 px-5 py-4">
        <form action="/api/signout" method="post">
          <button
            type="submit"
            className="text-sm text-base-400 transition hover:text-base-200"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}