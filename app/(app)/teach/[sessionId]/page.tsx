import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StudentOrb } from "@/components/student/student-orb";
import type { LearningSession } from "@/lib/types";

/**
 * The teaching room.
 *
 * Slice 1 scope: render the room and the orb in `ready`. Voice and the typed
 * input arrive in slices 3 and 5 — per the 2-scope decision, voice is P0 for
 * the shipped experience but is not on the critical path for proving the
 * learning engine.
 */
export default async function TeachingRoomPage({
  params,
}: PageProps<"/teach/[sessionId]">) {
  await requireUser();

  const { sessionId } = await params;
  const supabase = await createClient();

  // RLS scopes this read to the signed-in user: requesting another user's
  // session id returns no row rather than their data.
  const { data, error } = await supabase
    .from("learning_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !data) notFound();

  const session = data as LearningSession;
  const orbState = session.student_state ?? "ready";

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-8 pt-7 pb-4">
        <h1 className="font-editorial text-xl text-base-200">{session.topic}</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-8 pb-20">
        <StudentOrb state={orbState} />

        <p className="max-w-md text-center text-sm text-base-400">
          {orbState === "ready"
            ? "Ready when you are. Voice and typing arrive in the next slices."
            : null}
        </p>
      </div>
    </main>
  );
}