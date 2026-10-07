import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestUser,
  createSession,
  cleanupSession,
  appendTurn,
  claimCall,
  completeSession,
  readSession,
  readTurns,
  type TestUser,
  assertSchemaReady,} from "../helpers/supabase.ts";

// Top-level so an unapplied migration fails this whole file rather than
// letting individual tests false-pass against a missing function.
const probe = await createTestUser('immutability-probe');
await assertSchemaReady(probe.client);

/**
 * A completed attempt is immutable through EVERY database path.
 *
 * Three guards:
 *   1. RLS UPDATE policy refuses a completed session (slice 1)
 *   2. BEFORE UPDATE trigger refuses any change once completed
 *   3. BEFORE INSERT trigger refuses new turns under a completed parent
 *
 * Plus the RPC-level checks, which must refuse even a legitimate owner.
 *
 * SPEC: devpost/spec.md > Database Operations (Immutability)
 */

let alice: TestUser;
let bob: TestUser;

test("setup: create two users", async () => {
  alice = await createTestUser("freeze-alice");
  bob = await createTestUser("freeze-bob");
});

test("completing a session freezes its status and stores the result", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const applied = await completeSession(alice.client, sid, "binary search");
    assert.equal(applied.ok, true, applied.error ?? "");

    const session = (await readSession(alice.client, sid)).data!;
    assert.equal(session.status, "completed");
    assert.equal(session.stage, "completed");
    assert.ok(session.completed_at, "completed_at must be set");
    assert.ok(session.mastery_result, "mastery_result must be stored");
    assert.equal(session.mastery_result.overall, "mastered");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a completed session cannot be updated by its owner", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    await completeSession(alice.client, sid);

    // RLS refuses a completed row, which means the row is invisible to this
    // statement: zero rows updated, no error. Assert the effect, not the error.
    const { error } = await alice.client
      .from("learning_sessions")
      .update({ topic: "changed" })
      .eq("id", sid);
    if (error) {
      // Acceptable: some paths report the rejection instead of filtering.
    }

    const session = (await readSession(alice.client, sid)).data!;
    assert.equal(session.topic, "Binary Search", "topic must be unchanged");
    assert.equal(session.status, "completed", "session must still be completed");

    // Honest scope note: with only a publishable key, an UPDATE on a completed
    // row is always stopped by the RLS policy first, so the BEFORE UPDATE
    // trigger is unreachable from here. It is defence in depth for paths this
    // app does not use (service role, SQL editor, another integration). The
    // INSERT trigger IS independently proven below, because INSERT is allowed
    // by policy and only the trigger can stop it.
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a completed session rejects NEW turns through the RPC path", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    await completeSession(alice.client, sid);

    const { error } = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: crypto.randomUUID(),
      p_content: "Trying to keep talking after finishing.",
      p_source: "typed",
    });
    assert.ok(error, "append_learner_turn must refuse a completed session");
    assert.match(error.message, /immutable|completed/i);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a completed session rejects a direct PostgREST INSERT into session_turns", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    await completeSession(alice.client, sid);

    // This is the bypass the trigger exists for: skip our route handler and
    // our RPCs entirely and write straight to the table.
    const { data, error } = await alice.client
      .from("session_turns")
      .insert({
        session_id: sid,
        client_turn_id: crypto.randomUUID(),
        sequence: 99,
        role: "learner",
        interaction_type: "explanation",
        source: "typed",
        content: "inserted directly, bypassing every application check",
      })
      .select("id")
      .single();

    assert.ok(error, "direct insert under a completed session must be rejected");
    assert.match(error.message, /completed session/i);
    assert.equal(data, null);

    const turns = await readTurns(alice.client, sid);
    const smuggled = turns.data.filter(
      (t: { content: string }) => t.content.includes("bypassing"),
    );
    assert.equal(smuggled.length, 0, "no turn may be smuggled into a frozen attempt");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("Teach again creates a NEW attempt and leaves the old one intact", async () => {
  const first = await createSession(alice.client, "Binary Search");
  try {
    await completeSession(alice.client, first, "binary search");

    // The learner's "Teach again": a brand-new session, same topic.
    const second = await createSession(alice.client, "Binary Search");
    try {
      assert.notEqual(second, first, "Teach again must create a new session id");

      const oldSession = (await readSession(alice.client, first)).data!;
      assert.equal(oldSession.status, "completed", "prior attempt must remain completed");

      const newSession = (await readSession(alice.client, second)).data!;
      assert.equal(newSession.status, "in_progress", "new attempt must start in progress");
      assert.equal(newSession.topic, "Binary Search", "same topic");
      assert.equal(newSession.stage, "orient", "fresh stage");
      assert.equal(newSession.model_calls_used, 0, "fresh quota");
      assert.deepEqual(newSession.mastery, {}, "no evaluator state may carry forward");
      assert.deepEqual(newSession.evidence_ledger, {}, "no evidence may carry forward");
      assert.equal(newSession.mastery_result, null, "no prior result may carry forward");

      const newTurns = await readTurns(alice.client, second);
      assert.equal(newTurns.data.length, 0, "new attempt must start with an empty transcript");
    } finally {
      await cleanupSession(alice.client, second);
    }
  } finally {
    await cleanupSession(alice.client, first);
  }
});

test("completed-session immutability holds against another user too", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    await completeSession(alice.client, sid);

    const { error } = await bob.client
      .from("session_turns")
      .insert({
        session_id: sid,
        client_turn_id: crypto.randomUUID(),
        sequence: 100,
        role: "learner",
        interaction_type: "explanation",
        source: "typed",
        content: "cross-user insert",
      })
      .select("id")
      .single();

    assert.ok(error, "cross-user insert must be rejected");

    const turns = await readTurns(alice.client, sid);
    assert.equal(
      turns.data.filter((t: { content: string }) => t.content.includes("cross-user")).length,
      0,
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});