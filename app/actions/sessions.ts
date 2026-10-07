"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

export type CreateSessionState = {
  error: string | null;
};

/**
 * Creates an in-progress learning session.
 *
 * SECURITY: the row is inserted through the RLS-governed Supabase client and
 * user_id defaults to auth.uid() in the schema, so a user cannot create a
 * session owned by someone else. Topic bounds are enforced by a database CHECK
 * constraint as well as here — the database is the authority.
 */
export async function createSession(
  _prev: CreateSessionState,
  formData: FormData,
): Promise<CreateSessionState> {
  const topic = String(formData.get("topic") ?? "").trim();

  if (!topic) {
    return { error: "What are you going to teach?" };
  }
  if (topic.length > 120) {
    return { error: "Keep the topic under 120 characters." };
  }

  const supabase = await createClient();
  const user = await getUser();

  if (!user) {
    return { error: "Your session expired. Sign in again." };
  }

  // Sessions are created through an RPC, not a direct insert: the client has
  // no INSERT privilege on learning_sessions, so authoritative rows can only
  // come into existence through an authorized path. See
  // supabase/migrations/0002_turns_and_invariants.sql > PRIVILEGE MODEL.
  const { data, error } = await supabase.rpc("create_session", {
    p_topic: topic,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/teach");
  redirect(`/teach/${data as string}`);
}