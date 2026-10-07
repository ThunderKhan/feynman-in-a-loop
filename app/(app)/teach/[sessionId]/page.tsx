import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeachingRoomClient } from "@/components/session/teaching-room-client";
import type { LearningSession, StudentState } from "@/lib/types";

export default async function TeachingRoomPage({
  params,
}: PageProps<"/teach/[sessionId]">) {
  const user = await requireUser();

  const { sessionId } = await params;
  const supabase = await createClient();
  const serverDb = createAdminClient();

  const [
    { data: sessionData, error },
    { data: turnData },
    { data: pendingTurnData },
  ] = await Promise.all([
    supabase
      .from("learning_sessions")
      .select("id, topic, status, stage, student_state")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("session_turns")
      .select("id, sequence, role, content")
      .eq("session_id", sessionId)
      .order("sequence", { ascending: true }),
    serverDb
      .from("session_turns")
      .select("client_turn_id, content, evaluation_state")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .eq("role", "learner")
      .in("evaluation_state", ["pending", "claimed"])
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (error || !sessionData) notFound();

  const session = sessionData as Pick<
    LearningSession,
    "id" | "topic" | "status" | "stage" | "student_state"
  >;
  const turns = (turnData ?? []).filter(
    (turn): turn is {
      id: string;
      sequence: number;
      role: "learner" | "student";
      content: string;
    } => turn.role === "learner" || turn.role === "student",
  );

  return (
    <TeachingRoomClient
      sessionId={session.id}
      topic={session.topic}
      initialStage={session.stage}
      initialStudentState={
        (session.student_state as StudentState | null) ?? "ready"
      }
      initialTurns={turns}
      initialPending={
        pendingTurnData?.client_turn_id
          ? {
              clientTurnId: pendingTurnData.client_turn_id,
              content: pendingTurnData.content,
            }
          : null
      }
      completed={session.status === "completed"}
    />
  );
}
