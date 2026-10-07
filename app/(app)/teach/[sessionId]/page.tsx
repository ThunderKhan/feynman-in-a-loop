import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TeachingRoomClient } from "@/components/session/teaching-room-client";
import type { LearningSession, StudentState } from "@/lib/types";

export default async function TeachingRoomPage({
  params,
}: PageProps<"/teach/[sessionId]">) {
  await requireUser();

  const { sessionId } = await params;
  const supabase = await createClient();

  const [{ data: sessionData, error }, { data: turnData }] = await Promise.all([
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
      completed={session.status === "completed"}
    />
  );
}
