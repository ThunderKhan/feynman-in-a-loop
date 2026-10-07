import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Integration-test harness for the Slice 2 database guarantees.
 *
 * These run against a REAL Supabase project and cannot be mocked: the database
 * itself is the authorization boundary, so a fake client would test nothing.
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and the server-only
 * SUPABASE_SECRET_KEY, plus both migrations applied via the SQL Editor.
 */

loadEnv({ path: ".env.local" });

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, " +
      "or SUPABASE_SECRET_KEY. Integration tests require a real Supabase project " +
      "and server-only secret key in .env.local.",
  );
}

if (SUPABASE_URL.includes("your-project-ref")) {
  throw new Error(
    "Supabase credentials are still the .env.example placeholders. " +
      "Fill in .env.local before running integration tests.",
  );
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Server-only client used to exercise evaluator/quota RPCs exactly as the
 * Next.js server will. Never expose this key to browser code.
 */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function verifiedUserId(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error(`Could not verify test caller: ${error?.message ?? "no user"}`);
  }
  return data.user.id;
}

async function serverRpc(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
) {
  const userId = await verifiedUserId(client);
  return adminClient().rpc(fn, { p_user_id: userId, ...args });
}

export type TestUser = {
  email: string;
  password: string;
  client: SupabaseClient;
  userId: string;
};

const stamp = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * Stable throwaway test accounts, persisted OUTSIDE git.
 *
 * Creating a fresh user on every run hits Supabase's email-signup rate limit
 * and makes the suite non-repeatable, so accounts are created once and reused.
 * Credentials live in .env.test.local, which is git-ignored; if that file is
 * deleted, a new pool is created on the next run.
 *
 * These are deliberately throwaway accounts in a test project. Never reuse a
 * real credential here, and never point these tests at a production project.
 */
const CREDS_FILE = ".env.test.local";

type Creds = Record<string, { email: string; password: string }>;

function loadCreds(): Creds {
  if (!existsSync(CREDS_FILE)) return {};
  const out: Creds = {};
  for (const line of readFileSync(CREDS_FILE, "utf8").split("\n")) {
    const m = line.match(/^FIL_TEST_([A-Z_]+)_(EMAIL|PASSWORD)=(.+)$/);
    if (m) {
      const [, label, field, value] = m;
      const key = label.toLowerCase();
      out[key] ??= { email: "", password: "" };
      out[key][field.toLowerCase() as "email" | "password"] = value.trim();
    }
  }
  return out;
}

function saveCreds(creds: Creds) {
  const lines = Object.entries(creds).flatMap(([label, c]) => [
    `FIL_TEST_${label.toUpperCase()}_EMAIL=${c.email}`,
    `FIL_TEST_${label.toUpperCase()}_PASSWORD=${c.password}`,
  ]);
  writeFileSync(CREDS_FILE, `${lines.join("\n")}\n`);
}

/** Returns the shared, signed-in test user for a label. */
export async function createTestUser(label: string): Promise<TestUser> {
  const creds = loadCreds();
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");

  let entry = creds[key];
  if (!entry) {
    entry = { email: `fil-${key}@example.test`, password: `fil-${stamp()}-Aa1` };
    creds[key] = entry;
    saveCreds(creds);
  }

  const client = anonClient();

  // Try signing in first — this is the normal path after the first run.
  const signInResult = await client.auth.signInWithPassword(entry);
  if (!signInResult.error && signInResult.data.session) {
    return { ...entry, client, userId: signInResult.data.user!.id };
  }

  // Not yet provisioned, or the account was removed. Create it.
  const { data, error } = await client.auth.signUp(entry);
  if (error) {
    throw new Error(
      `Could not provision test user "${label}": ${error.message}\n` +
        "If this is a rate limit, wait and re-run. If the account exists but the " +
        "password in .env.test.local no longer matches, delete that file to reset.",
    );
  }
  if (!data.session) {
    throw new Error(
      `signUp returned no session for "${label}". Enable "Confirm email" = OFF in ` +
        "Supabase → Authentication → Sign In / Providers → Email.",
    );
  }

  return { ...entry, client, userId: data.user!.id };
}

/**
 * Signs in as an EXISTING user. Use this to prove a stolen/spoofed session
 * cannot do anything, since identity comes from verified JWT claims only.
 */
export async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed: ${error.message}`);
  return client;
}

export async function createSession(client: SupabaseClient, topic: string) {
  const { data, error } = await client.rpc("create_session", { p_topic: topic });
  if (error) throw new Error(`createSession failed: ${error.message}`);
  return data as string;
}

/**
 * Test cleanup uses the server-only client. Session deletion is deliberately
 * not an authenticated product RPC: completed attempts are immutable records.
 */
export async function cleanupSession(_client: SupabaseClient, sessionId: string) {
  const { error } = await adminClient()
    .from("learning_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw new Error(`cleanup failed: ${error.message}`);
}

/**
 * Shortens this session's stale-claim window.
 *
 * Only permitted while the attempt is untouched (zero turns, zero consumed
 * calls), so it cannot be used to steal a live claim. This is how the suite
 * tests crash recovery without waiting out the production two-minute window.
 * It is invoked through the server-only secret-key path, never by the browser.
 */
export async function setStaleWindow(
  client: SupabaseClient,
  sessionId: string,
  seconds: number,
) {
  const { data, error } = await serverRpc(client, "set_claim_stale_after", {
    p_session_id: sessionId,
    p_seconds: seconds,
  });
  return { ok: !error, error: error?.message ?? null, data };
}

/** The default stale-claim window in seconds. */
export async function defaultStaleWindowSeconds(client: SupabaseClient) {
  const { data } = await client.rpc("claim_stale_after");
  const s = String(data);
  const m = s.match(/(\d+):(\d+):(\d+)/);
  if (!m) return null;
  return Number(m[2]) * 60 + Number(m[3]);
}

export async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const clientTurnId = () => randomUUID();

/**
 * Fails loudly when the slice-2 migration has not been applied.
 *
 * Without this, tests that assert "an error occurred" would PASS merely because
 * the RPC does not exist — the missing function raises, which looks exactly
 * like a working guard. This precondition converts that class of false pass
 * into an obvious setup failure.
 */
export async function assertSchemaReady(client: SupabaseClient) {
  const { data, error } = await client.rpc("max_model_calls");

  if (error || data !== 8) {
    throw new Error(
      "Slice 2 schema is not applied (or is stale).\n" +
        "Run supabase/migrations/0002_turns_and_invariants.sql in the Supabase SQL Editor.\n" +
        `max_model_calls() returned: ${JSON.stringify(data)} (error: ${error?.message ?? "none"})`,
    );
  }

  // Probe the NEW server-only function signature with impossible UUIDs. A
  // current schema reaches the function and reports "session not found". A
  // stale schema reports a missing function/signature or permission mismatch.
  const userId = await verifiedUserId(client);
  const probe = await adminClient().rpc("claim_model_call", {
    p_user_id: userId,
    p_session_id: randomUUID(),
    p_learner_turn_id: randomUUID(),
  });

  if (!probe.error || !/session not found/i.test(probe.error.message)) {
    throw new Error(
      "Slice 2 schema is stale: server-only claim_model_call(user_id, session_id, turn_id) " +
        `probe returned ${probe.error?.message ?? "no error"}`,
    );
  }
}

/** Best-effort server-only cleanup of a session created by a test. */
export async function removeSessionAnyWay(_client: SupabaseClient, sessionId: string) {
  const { error } = await adminClient()
    .from("learning_sessions")
    .delete()
    .eq("id", sessionId);
  return { ok: !error, error: error?.message ?? null };
}

/** Appends a learner turn via the idempotent RPC and returns its id. */
export async function appendTurn(
  client: SupabaseClient,
  sessionId: string,
  content: string,
  source: "voice" | "typed" = "typed",
) {
  const id = clientTurnId();
  const { data, error } = await client.rpc("append_learner_turn", {
    p_session_id: sessionId,
    p_client_turn_id: id,
    p_content: content,
    p_source: source,
  });
  if (error) throw new Error(`append_learner_turn failed: ${error.message}`);
  return { clientTurnId: id, turnId: data as string };
}

export async function claimCall(
  client: SupabaseClient,
  sessionId: string,
  turnId: string,
) {
  const { data, error } = await serverRpc(client, "claim_model_call", {
    p_session_id: sessionId,
    p_learner_turn_id: turnId,
  });
  return { ok: !error, error: error?.message ?? null, data };
}

/**
 * Returns a claimed turn to 'pending' so it can be retried.
 *
 * The consumed allowance is NOT refunded: a provider call was genuinely spent.
 * A retry must therefore claim again, consuming a further allowance.
 */
export async function releaseCall(
  client: SupabaseClient,
  sessionId: string,
  turnId: string,
) {
  const { data, error } = await serverRpc(client, "release_model_call", {
    p_session_id: sessionId,
    p_learner_turn_id: turnId,
  });
  return { ok: !error, error: error?.message ?? null, data };
}

/** The configured stale-claim window, in seconds. */
export async function staleWindowSeconds(client: SupabaseClient) {
  return defaultStaleWindowSeconds(client);
}

export async function applyResult(
  client: SupabaseClient,
  args: {
    sessionId: string;
    learnerTurnId: string;
    studentState?: string;
    message?: string;
    interactionType?: string;
    stage?: string;
    mastery?: Record<string, string>;
    evidenceLedger?: Record<string, unknown[]>;
    complete?: boolean;
    masteryResult?: Record<string, unknown>;
  },
) {
  const { data, error } = await serverRpc(client, "apply_turn_result", {
    p_session_id: args.sessionId,
    p_learner_turn_id: args.learnerTurnId,
    p_student_state: args.studentState ?? "confused",
    p_message: args.message ?? "Would this still work if the list wasn't sorted?",
    p_interaction_type: args.interactionType ?? "misconception",
    p_stage: args.stage ?? "repair",
    p_mastery: args.mastery ?? {},
    p_evidence_ledger: args.evidenceLedger ?? {},
    p_complete: args.complete ?? false,
    p_mastery_result: args.masteryResult ?? null,
  });
  return { ok: !error, error: error?.message ?? null, data };
}

/**
 * Completes a session through the real pipeline (append → claim → apply with
 * p_complete). A direct UPDATE cannot complete a session: the
 * `completed_is_final` CHECK constraint requires mastery_result and
 * completed_at, so completion is only reachable via apply_turn_result.
 */
export async function completeSession(
  client: SupabaseClient,
  sessionId: string,
  topic = "test topic",
) {
  const { turnId } = await appendTurn(
    client,
    sessionId,
    `A short explanation of ${topic}.`,
  );
  const claim = await claimCall(client, sessionId, turnId);
  if (!claim.ok) throw new Error(`claim failed while completing: ${claim.error}`);

  return applyResult(client, {
    sessionId,
    learnerTurnId: turnId,
    stage: "completed",
    studentState: "mastered",
    message: "I think I get it now.",
    interactionType: "assessment",
    complete: true,
    masteryResult: {
      overall: "mastered",
      dimensions: {
        coreIdea: "mastered",
        mechanism: "mastered",
        misconceptionRepair: "mastered",
        transfer: "mastered",
      },
      evidence: ["Explained the core idea."],
      remainingGaps: [],
    },
  });
}

/** Reads a session row as the given user. */
export async function readSession(client: SupabaseClient, sessionId: string) {
  const { data, error } = await client
    .from("learning_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  return { data, error };
}

/** Reads turns for a session as the given user. */
export async function readTurns(client: SupabaseClient, sessionId: string) {
  const { data, error } = await client
    .from("session_turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true });
  return { data: data ?? [], error };
}