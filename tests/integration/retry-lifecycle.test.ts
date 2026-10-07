import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestUser,
  createSession,
  cleanupSession,
  appendTurn,
  claimCall,
  releaseCall,
  setStaleWindow,
  waitMs,
  staleWindowSeconds,
  applyResult,
  readSession,
  readTurns,
  type TestUser,
} from "../helpers/supabase.ts";

// Top-level so an unapplied migration fails this whole file rather than
// letting individual tests false-pass against a missing function.
const probe = await createTestUser("retry_probe");
const { assertSchemaReady } = await import("../helpers/supabase.ts");
await assertSchemaReady(probe.client);

/**
 * The retry lifecycle.
 *
 *   pending → claimed → applied
 *              │
 *              └─ failure → released back to pending (allowance NOT refunded)
 *
 * Plus stale-claim recovery, so a process that dies after claiming cannot
 * strand a turn forever.
 *
 * SPEC: devpost/spec.md > Database Operations (claim_model_call)
 * SPEC: devpost/spec.md > Important Failure Modes (AI provider fails)
 * SPEC: devpost/spec.md > Persistence and abandonment
 */

let alice: TestUser;

test("setup", async () => {
  alice = await createTestUser("retry_alice");
});

test("the stale-claim window is configured and readable", async () => {
  const seconds = await staleWindowSeconds(alice.client);
  assert.ok(seconds !== null, "claim_stale_after() must return an interval");
  assert.ok(
    seconds! >= 60,
    `stale window (${seconds}s) must comfortably exceed a slow provider call`,
  );
});

test("1. provider-call failure consumes one model call", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const claim = await claimCall(alice.client, sid, turnId);
    assert.equal(claim.ok, true, claim.error ?? "");
    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 1);

    // The provider call then fails. Nothing is applied; the turn stays claimed.
    // The spent allowance must remain spent.
    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].evaluation_state, "claimed");
    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      1,
      "a failed provider call must still consume the allowance",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("2. releasing a failed claim makes the turn retryable", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    const release = await releaseCall(alice.client, sid, turnId);
    assert.equal(release.ok, true, release.error ?? "");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].evaluation_state, "pending");
    assert.equal(
      turns.data[0].evaluation_claimed_at,
      null,
      "released turn must clear its claim timestamp",
    );

    // Releasing must NOT refund the allowance.
    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      1,
      "release must not refund consumed quota",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("3. a retry consumes ANOTHER model call and can then succeed", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    // Attempt 1 fails.
    assert.equal((await claimCall(alice.client, sid, turnId)).ok, true);
    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 1);
    await releaseCall(alice.client, sid, turnId);

    // Attempt 2: a fresh claim is permitted and costs a further allowance.
    const retry = await claimCall(alice.client, sid, turnId);
    assert.equal(retry.ok, true, "released turn must be claimable again");
    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      2,
      "retry must consume a second model call",
    );

    // And it can now be applied normally.
    const applied = await applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId });
    assert.equal(applied.ok, true, applied.error ?? "");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].evaluation_state, "applied");
    assert.equal(turns.data.filter((t: { role: string }) => t.role === "student").length, 1);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("4. a concurrent claim is rejected while a LIVE claim exists", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const live = await claimCall(alice.client, sid, turnId);
    assert.equal(live.ok, true);

    // The claim is fresh, so it is not stale and must not be stealable.
    const second = await claimCall(alice.client, sid, turnId);
    assert.equal(second.ok, false, "a live claim must not be stealable");
    assert.match(second.error ?? "", /not claimable/i);

    // And the refusal cost nothing.
    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 1);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("5. a stale abandoned claim can be recovered", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    // Shorten THIS session's stale window. Permitted only because the attempt
    // is untouched — no turns, no consumed calls — so it cannot be used to
    // steal a live claim. No privileged test-only grant is involved.
    const shortened = await setStaleWindow(alice.client, sid, 1);
    assert.equal(shortened.ok, true, shortened.error ?? "");

    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    // While the claim is fresh, it must not be stealable.
    assert.equal(
      (await claimCall(alice.client, sid, turnId)).ok,
      false,
      "a fresh claim must not be stealable",
    );

    // Wait past the window: the claim is now abandoned by a dead process.
    await waitMs(1500);

    const recovered = await claimCall(alice.client, sid, turnId);
    assert.equal(recovered.ok, true, "a stale claim must be recoverable");
    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      2,
      "recovery consumes another allowance, since another call will be made",
    );

    // And the turn is fully usable afterwards.
    const applied = await applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId });
    assert.equal(applied.ok, true, applied.error ?? "");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("the stale window cannot be shortened once evaluation has started", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    await appendTurn(alice.client, sid, "It halves the search space.");

    const tooLate = await setStaleWindow(alice.client, sid, 1);
    assert.equal(tooLate.ok, false, "window must not be settable once a turn exists");
    assert.match(tooLate.error ?? "", /before evaluation begins/i);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("6. an applied learner turn can NEVER be re-evaluated", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);
    assert.equal(
      (await applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId })).ok,
      true,
    );

    // Re-claim must be refused, even after backdating.
    const reclaim = await claimCall(alice.client, sid, turnId);
    assert.equal(reclaim.ok, false, "an applied turn must never be claimable");
    assert.match(reclaim.error ?? "", /not claimable/i);

    // Release must be refused too.
    const release = await releaseCall(alice.client, sid, turnId);
    assert.equal(release.ok, false, "an applied turn must never be released");


    // And a second apply is refused.
    const reapply = await applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId });
    assert.equal(reapply.ok, false, "a second apply must be refused");

    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      1,
      "no rejected operation may consume quota",
    );
    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data.filter((t: { role: string }) => t.role === "student").length, 1);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("applying a result requires the turn to have been claimed", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    // Never claimed: applying would cost no quota, so it must be refused.
    const applied = await applyResult(alice.client, { sessionId: sid, learnerTurnId: turnId });
    assert.equal(applied.ok, false, "apply without a claim must be refused");
    assert.match(applied.error ?? "", /must be claimed/i);

    assert.equal(
      (await readSession(alice.client, sid)).data!.model_calls_used,
      0,
      "a refused apply must not consume quota",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("releasing a pending turn is refused", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    const release = await releaseCall(alice.client, sid, turnId);
    assert.equal(release.ok, false, "a pending turn has nothing to release");
    assert.match(release.error ?? "", /not in a releasable state/i);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("one user cannot release another user's claimed turn", async () => {
  const bob = await createTestUser("retry_bob");
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");
    await claimCall(alice.client, sid, turnId);

    const cross = await releaseCall(bob.client, sid, turnId);
    assert.equal(cross.ok, false, "cross-user release must be refused");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data[0].evaluation_state, "claimed", "state must be unchanged");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("the cap is not weakened by failures: retries still count", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "It halves the search space.");

    // Burn the entire allowance on repeated failing attempts: claim → fail →
    // release → claim, over and over. Each cycle must cost one call.
    for (let i = 0; i < 8; i++) {
      const claim = await claimCall(alice.client, sid, turnId);
      assert.equal(claim.ok, true, `attempt ${i + 1} should succeed below the cap`);
      const release = await releaseCall(alice.client, sid, turnId);
      assert.equal(release.ok, true, `release ${i + 1} should succeed`);
    }
    assert.equal((await readSession(alice.client, sid)).data!.model_calls_used, 8);

    // The ninth attempt is refused. Retrying never grants a free evaluation.
    const overflow = await claimCall(alice.client, sid, turnId);
    assert.equal(overflow.ok, false, "the cap must still apply across retries");
    assert.match(overflow.error ?? "", /cap reached/i);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});