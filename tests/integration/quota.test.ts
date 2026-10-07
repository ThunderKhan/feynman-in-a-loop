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
  readSession,
  readTurns,
  type TestUser,
  assertSchemaReady,} from "../helpers/supabase.ts";

// Top-level so an unapplied migration fails this whole file rather than
// letting individual tests false-pass against a missing function.
const probe = await createTestUser('quota-probe');
await assertSchemaReady(probe.client);

/**
 * Quota accounting: claim BEFORE the provider is contacted.
 *
 * SPEC: devpost/spec.md > Rate and Quota Controls
 * SPEC: devpost/spec.md > Database Operations (claim_model_call)
 */

let alice: TestUser;
let bob: TestUser;

test("setup: create two users", async () => {
  alice = await createTestUser("quota-alice");
  bob = await createTestUser("quota-bob");
});

test("claiming a call increments the persisted counter", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const before = (await readSession(alice.client, sid)).data!;
    assert.equal(before.model_calls_used, 0);

    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    const claim = await claimCall(alice.client, sid, turnId);
    assert.equal(claim.ok, true, claim.error ?? "");

    const after = (await readSession(alice.client, sid)).data!;
    assert.equal(after.model_calls_used, 1, "counter must increment on claim");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].evaluation_state, "claimed");
    assert.ok(turns.data[0].evaluation_claimed_at, "claim must be timestamped");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("the counter persists across client instances (serverless-safe)", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    // A different connection would be a different serverless instance in
    // production. The count must not depend on process memory.
    const { createClient } = await import("@supabase/supabase-js");
    const other = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: userData, error: signInErr } = await other.auth.signInWithPassword({
      email: alice.email,
      password: alice.password,
    });
    assert.equal(signInErr, null);
    assert.ok(userData.session);

    const { data } = await readSession(other, sid);
    assert.equal(data!.model_calls_used, 1, "counter must live in the database");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a second claim for the same turn is refused", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    const first = await claimCall(alice.client, sid, turnId);
    assert.equal(first.ok, true);

    const second = await claimCall(alice.client, sid, turnId);
    assert.equal(second.ok, false, "a turn may only be claimed once");
    assert.match(second.error ?? "", /not claimable/i);

    // The refused claim must NOT have charged quota: the function is
    // transactional, so raising rolls the increment back.
    const after = (await readSession(alice.client, sid)).data!;
    assert.equal(after.model_calls_used, 1, "refused claim must not consume allowance");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("concurrent claims for one turn: exactly one wins", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const results = await Promise.all([
      claimCall(alice.client, sid, turnId),
      claimCall(alice.client, sid, turnId),
      claimCall(alice.client, sid, turnId),
    ]);

    const wins = results.filter((r) => r.ok);
    assert.equal(wins.length, 1, `exactly one concurrent claim should win, got ${wins.length}`);

    const after = (await readSession(alice.client, sid)).data!;
    assert.equal(after.model_calls_used, 1, "only the winning claim consumes quota");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("concurrent claims for different turns in one session: exactly one wins", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const first = await appendTurn(alice.client, sid, "First explanation.");
    const second = await appendTurn(alice.client, sid, "Second explanation.");

    const results = await Promise.all([
      claimCall(alice.client, sid, first.turnId),
      claimCall(alice.client, sid, second.turnId),
    ]);

    assert.equal(
      results.filter((r) => r.ok).length,
      1,
      "the database must allow only one live evaluation per session",
    );
    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      1,
      "the losing concurrent claim must roll its quota increment back",
    );

    const turns = await readTurns(alice.client, sid);
    assert.equal(
      turns.data.filter(
        (t: { role: string; evaluation_state: string }) =>
          t.role === "learner" && t.evaluation_state === "claimed",
      ).length,
      1,
      "exactly one learner turn may remain claimed",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a claim is consumed even when the provider call subsequently fails", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    // The claim happens first.
    const claim = await claimCall(alice.client, sid, turnId);
    assert.equal(claim.ok, true);

    // Simulate a provider outage: nothing is applied, and the learner turn
    // stays 'claimed'. The spent allowance must NOT be refunded, because real
    // provider quota was consumed.
    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].evaluation_state, "claimed");

    const after = (await readSession(alice.client, sid)).data!;
    assert.equal(
      after.model_calls_used,
      1,
      "a failed provider call must still consume the allowance",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("the cap refuses further claims (max 8 per attempt)", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    // Simulate eight provider attempts that fail after being charged. The
    // single-live-claim invariant means each failed attempt is explicitly
    // released before the next one can be claimed.
    for (let i = 0; i < 8; i++) {
      const claim = await claimCall(alice.client, sid, turnId);
      assert.equal(claim.ok, true, `claim ${i + 1} should succeed below the cap`);
      const release = await releaseCall(alice.client, sid, turnId);
      assert.equal(release.ok, true, `release ${i + 1} should succeed`);
    }

    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 8);

    const refused = await claimCall(alice.client, sid, turnId);
    assert.equal(refused.ok, false, "claim at the cap must be refused");
    assert.match(refused.error ?? "", /cap reached/i);

    const after = (await readSession(alice.client, sid)).data!;
    assert.equal(after.model_calls_used, 8, "refused claim must not push past the cap");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("one user cannot claim against another user's session", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const cross = await claimCall(bob.client, sid, turnId);
    assert.equal(cross.ok, false, "cross-user claim must be refused");

    const after = (await readSession(alice.client, sid)).data!;
    assert.equal(after.model_calls_used, 0, "cross-user claim must not consume quota");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("applyResult stores evaluator state and links the student turn", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    const applied = await applyResult(alice.client, {
      sessionId: sid,
      learnerTurnId: turnId,
      stage: "repair",
      studentState: "confused",
      message: "Would this still work if the list wasn't sorted?",
      interactionType: "misconception",
      mastery: { coreIdea: "mastered", mechanism: "partial" },
      evidenceLedger: { mechanism: [{ turnId, summary: "Explained halving." }] },
    });
    assert.equal(applied.ok, true, applied.error ?? "");

    // The response is a SANITIZED public projection only.
    const payload = applied.data as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ["publicStage", "student"]);
    assert.equal(payload.publicStage, "repair");
    const student = payload.student as Record<string, unknown>;
    assert.deepEqual(Object.keys(student).sort(), ["message", "state"]);
    assert.ok(!("dimensions" in payload), "mastery must not reach the client");
    assert.ok(!("evidence_ledger" in payload), "ledger must not reach the client");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data.length, 2);

    const learnerTurn = turns.data.find((t: { role: string }) => t.role === "learner")!;
    const studentTurn = turns.data.find((t: { role: string }) => t.role === "student")!;

    assert.equal(learnerTurn.evaluation_state, "applied");
    assert.equal(studentTurn.responds_to_turn_id, turnId, "student turn must link to its learner turn");
    assert.equal(studentTurn.user_id, alice.userId);

    const session = (await readSession(alice.client, sid)).data!;
    assert.equal(session.stage, "repair");
    assert.equal(session.student_state, "confused");
    assert.equal(session.mastery.coreIdea, "mastered");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("one learner turn may receive only ONE applied student response", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    const first = await applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId });
    assert.equal(first.ok, true, first.error ?? "");

    // Simulate the lost-HTTP-response retry landing twice.
    const duplicate = await applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId });
    assert.equal(duplicate.ok, false, "a second applied response must be refused");
    assert.match(duplicate.error ?? "", /already has an applied response/i);

    const turns = await readTurns(alice.client, sid);
    const studentTurns = turns.data.filter((t: { role: string }) => t.role === "student");
    assert.equal(studentTurns.length, 1, "exactly one student turn must exist");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("concurrent applies for one learner turn: exactly one wins", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    const results = await Promise.all([
      applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId }),
      applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId }),
    ]);
    const wins = results.filter((r) => r.ok);
    assert.equal(wins.length, 1, `exactly one apply should win, got ${wins.length}`);

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data.filter((t: { role: string }) => t.role === "student").length, 1);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("one user cannot apply a result to another user's session", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    const cross = await applyResult(bob.client, { sessionId: sid, learnerTurnId: turnId });
    assert.equal(cross.ok, false, "cross-user apply must be refused");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data.length, 1, "no student turn may be appended cross-user");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});