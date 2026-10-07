import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestUser,
  createSession,
  cleanupSession,
  appendTurn,
  claimCall,
  releaseCall,
  applyResult,
  completeSession,
  readSession,
  readTurns,
  adminClient,
  type TestUser,
} from "../helpers/supabase.ts";

// Top-level so an unapplied migration fails this whole file rather than
// letting individual tests false-pass against a missing function.
const probe = await createTestUser("priv_probe");
const { assertSchemaReady } = await import("../helpers/supabase.ts");
await assertSchemaReady(probe.client);

/**
 * The privilege model.
 *
 *   RLS answers "which rows". It does NOT protect authoritative columns.
 *   The authenticated client may READ its own data. User-originated writes
 *   use narrow ownership-checking RPCs; evaluator/quota RPCs are server-only.
 *
 * Every case here is a direct PostgREST mutation attempt, i.e. exactly what an
 * attacker with a valid session and network access would try.
 *
 * SPEC: devpost/spec.md > Database Operations (PRIVILEGE MODEL)
 * SPEC: devpost/spec.md > Data Model
 */

let alice: TestUser;
let bob: TestUser;

test("setup", async () => {
  alice = await createTestUser("priv_alice");
  bob = await createTestUser("priv_bob");
});

/** Asserts a direct mutation failed AND had no effect. */
async function assertNoDirectMutation(
  label: string,
  mutate: () => Promise<unknown>,
  sessionId: string,
  verify: () => Promise<void>,
) {
  await mutate();
  await verify();
}

test("1. a user cannot directly reset model_calls_used", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);
    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 1);

    const { error } = await alice.client
      .from("learning_sessions")
      .update({ model_calls_used: 0 })
      .eq("id", sid);
    assert.ok(error, "direct model_calls_used reset must be rejected");

    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      1,
      "quota must not be resettable by the client",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("2. a user cannot directly change stage", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { error } = await alice.client
      .from("learning_sessions")
      .update({ stage: "completed" })
      .eq("id", sid);
    assert.ok(error, "direct stage change must be rejected");

    assert.equal((await readSession(alice.client, sid)).data!.stage, "orient");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("3. a user cannot directly write mastery or mastery_result", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const mastery = await alice.client
      .from("learning_sessions")
      .update({
        mastery: {
          coreIdea: "mastered",
          mechanism: "mastered",
          misconceptionRepair: "mastered",
          transfer: "mastered",
        },
      })
      .eq("id", sid);
    assert.ok(mastery.error, "direct mastery write must be rejected");

    const result = await alice.client
      .from("learning_sessions")
      .update({
        status: "completed",
        mastery_result: { overall: "mastered" },
        completed_at: new Date().toISOString(),
      })
      .eq("id", sid);
    assert.ok(result.error, "direct mastery_result write must be rejected");

    const session = (await readSession(alice.client, sid)).data!;
    assert.deepEqual(session.mastery, {}, "mastery must be untouched");
    assert.equal(session.mastery_result, null, "mastery_result must be untouched");
    assert.equal(session.status, "in_progress", "session must not be completed by direct write");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("4. a user cannot directly alter evaluation_state or evaluation_claimed_at", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const backdate = await alice.client
      .from("session_turns")
      .update({ evaluation_claimed_at: new Date(0).toISOString() })
      .eq("id", turnId);
    assert.ok(backdate.error, "backdating a claim must be rejected");

    const state = await alice.client
      .from("session_turns")
      .update({ evaluation_state: "applied" })
      .eq("id", turnId);
    assert.ok(state.error, "forcing evaluation_state must be rejected");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].evaluation_state, "pending", "state must be untouched");
    assert.equal(turns.data[0].evaluation_claimed_at, null);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("5. a user cannot fabricate a student turn", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const { data, error } = await alice.client
      .from("session_turns")
      .insert({
        session_id: sid,
        client_turn_id: null,
        responds_to_turn_id: turnId,
        sequence: 99,
        role: "student",
        interaction_type: "misconception",
        source: "voice",
        content: "I totally understand this concept now.",
      })
      .select("id")
      .single();

    assert.ok(error, "direct student-turn insert must be rejected");
    assert.equal(data, null);

    const turns = await readTurns(alice.client, sid);
    assert.equal(
      turns.data.filter((t: { role: string }) => t.role === "student").length,
      0,
      "no student turn may be fabricated",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("6. a user cannot change interaction_type or responds_to_turn_id", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const type = await alice.client
      .from("session_turns")
      .update({ interaction_type: "correction" })
      .eq("id", turnId);
    assert.ok(type.error, "interaction_type must be server-owned");

    const link = await alice.client
      .from("session_turns")
      .update({ responds_to_turn_id: turnId })
      .eq("id", turnId);
    assert.ok(link.error, "responds_to_turn_id must be server-owned");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].interaction_type, "explanation");
    assert.equal(turns.data[0].responds_to_turn_id, null);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("7. a user cannot complete or reopen a session by updating status", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    // Force completion through the authorized RPC.
    assert.equal((await completeSession(alice.client, sid)).ok, true);
    assert.equal((await readSession(alice.client, sid)).data!.status, "completed");

    // Reopen by direct write.
    const reopen = await alice.client
      .from("learning_sessions")
      .update({ status: "in_progress", completed_at: null })
      .eq("id", sid);
    assert.ok(reopen.error, "reopening a completed session must be rejected");

    // And try to complete one that is still in progress, bypassing the RPC.
    const sid2 = await createSession(alice.client, "Recursion");
    try {
      const force = await alice.client
        .from("learning_sessions")
        .update({
          status: "completed",
          mastery_result: { overall: "mastered" },
          completed_at: new Date().toISOString(),
        })
        .eq("id", sid2);
      assert.ok(force.error, "force-completing via direct write must be rejected");
      assert.equal((await readSession(alice.client, sid2)).data!.status, "in_progress");
    } finally {
      await cleanupSession(alice.client, sid2);
    }
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a user cannot insert a session row directly", async () => {
  const { data, error } = await alice.client
    .from("learning_sessions")
    .insert({ topic: "inserted directly", user_id: alice.userId })
    .select("id")
    .single();

  assert.ok(error, "direct insert must be rejected — creation goes through create_session()");
  assert.equal(data, null);
});

test("a user cannot insert a learner turn directly", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { error } = await alice.client
      .from("session_turns")
      .insert({
        session_id: sid,
        client_turn_id: crypto.randomUUID(),
        sequence: 50,
        role: "learner",
        interaction_type: "correction",
        source: "typed",
        content: "inserted directly",
      })
      .select("id")
      .single();
    assert.ok(error, "direct learner-turn insert must be rejected");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a user cannot delete their own session directly (delete goes through the RPC)", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { error } = await alice.client.from("learning_sessions").delete().eq("id", sid);
    assert.ok(error, "direct delete must be rejected");

    // Still readable, so the delete did not take effect.
    assert.ok((await readSession(alice.client, sid)).data);

    // The authorized path still works.
    await cleanupSession(alice.client, sid);
    assert.equal((await readSession(alice.client, sid)).data, null);
  } catch (e) {
    throw e;
  }
});

test("authenticated browser cannot invoke server-only evaluator RPCs", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const directClaim = await alice.client.rpc("claim_model_call", {
      p_user_id: alice.userId,
      p_session_id: sid,
      p_learner_turn_id: turnId,
    });
    assert.ok(directClaim.error, "claim_model_call must be server-only");

    const directRelease = await alice.client.rpc("release_model_call", {
      p_user_id: alice.userId,
      p_session_id: sid,
      p_learner_turn_id: turnId,
    });
    assert.ok(directRelease.error, "release_model_call must be server-only");

    const directApply = await alice.client.rpc("apply_turn_result", {
      p_user_id: alice.userId,
      p_session_id: sid,
      p_learner_turn_id: turnId,
      p_student_state: "mastered",
      p_message: "I get it.",
      p_interaction_type: "assessment",
      p_stage: "completed",
      p_mastery: { coreIdea: "mastered" },
      p_evidence_ledger: {},
      p_complete: true,
      p_mastery_result: { overall: "mastered" },
    });
    assert.ok(directApply.error, "apply_turn_result must be server-only");

    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 0);
    assert.equal((await readSession(alice.client, sid)).data!.status, "in_progress");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("the same operations DO succeed through their authorized server paths", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    // create_session
    assert.ok(sid);

    // append_learner_turn
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    assert.ok(turnId);

    // claim_model_call
    assert.equal((await claimCall(alice.client, sid, turnId)).ok, true);
    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 1);

    // apply_turn_result writes the authoritative columns that direct writes cannot
    const applied = await applyResult(alice.client, {
      sessionId: sid,
      learnerTurnId: turnId,
      stage: "repair",
      mastery: { coreIdea: "mastered" },
      evidenceLedger: { coreIdea: [{ turnId, summary: "Explained halving." }] },
    });
    assert.equal(applied.ok, true, applied.error ?? "");

    const session = (await readSession(alice.client, sid)).data!;
    assert.equal(session.stage, "repair", "RPC must be able to set stage");
    assert.equal(session.mastery.coreIdea, "mastered", "RPC must be able to set mastery");

    // release_model_call refuses an already-applied turn, which proves the
    // lifecycle guards still work under the new privilege model.
    const release = await releaseCall(alice.client, sid, turnId);
    assert.equal(release.ok, false);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("one user still cannot mutate another user's rows", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { error } = await bob.client.rpc("claim_model_call", {
      p_user_id: bob.userId,
      p_session_id: sid,
      p_learner_turn_id: crypto.randomUUID(),
    });
    assert.ok(error, "browser must not have EXECUTE on server-only claim RPC");

    const adminClaim = await adminClient().rpc("claim_model_call", {
      p_user_id: bob.userId,
      p_session_id: sid,
      p_learner_turn_id: crypto.randomUUID(),
    });
    assert.ok(adminClaim.error, "server-only RPC must still enforce row ownership");

    const del = await bob.client.rpc("delete_session", { p_session_id: sid });
    assert.ok(del.error, "cross-user delete must be refused");

    assert.ok((await readSession(alice.client, sid)).data, "session must survive");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});