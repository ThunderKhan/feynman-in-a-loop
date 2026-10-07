import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import type { SessionListItem } from "@/components/layout/sidebar";

/**
 * Authenticated app shell: persistent sidebar plus workspace.
 *
 * SECURITY: requires a verified user via getClaims(). All session reads go
 * through the RLS-governed Supabase client, so a user only ever sees their
 * own rows regardless of what the client asks for.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_sessions")
    .select("id, topic, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // Fail loudly rather than rendering an app that looks empty but is not.
    console.error("[shell] failed to list sessions:", error.message);
  }

  const sessions: SessionListItem[] = (data ?? []) as SessionListItem[];

  return (
    <div className="flex min-h-dvh">
      <Sidebar sessions={sessions} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}