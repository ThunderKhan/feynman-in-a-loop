import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestUser,
  createSession,
  cleanupSession,
  appendTurn,
  readTurns,
  claimCall,
  applyResult,
  type TestUser,
  assertSchemaReady,} from "../helpers/supabase.ts";

// Top-level so an unapplied migration fails this whole file rather than
// letting individual tests false-pass against a missing function.
const probe = await createTestUser('idempotency-probe');
await assertSchemaReady(probe.client);

/**
 * Idempotency and server-derived meaning.
 *
 * SPEC: devpost/spec.md > The Core Journey Through the System (step 5)
 * SPEC: devpost/spec.md > Data Model (client_turn_id, interaction_type)
 */

let alice: TestUser;
let bob: TestUser;

test("setup: create two users", async () => {
  alice = await createTestUser("idem-alice");
  bob = await createTestUser("idem-bob");
});

test("appending a learner turn persists exactly one row", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { turnId } = await appendTurn(alice.client, sid, "Binary search halves the search space.");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.error, null);
    assert.equal(turns.data.length, 1);
    assert.equal(turns.data[0].id, turnId);
    assert.equal(turns.data[0].role, "learner");
    assert.equal(turns.data[0].sequence, 1);
    assert.equal(turns.data[0].evaluation_state, "pending");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a repeated clientTurnId returns the same turn and inserts no duplicate", async () => {
  const sid = await createSession(alice.client, "Recursion");
  try {
    const id = crypto.randomUUID();

    const first = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: id,
      p_content: "Recursion is when a function calls itself.",
      p_source: "typed",
    });
    assert.equal(first.error, null);

    // Simulate a double-click or network retry.
    const second = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: id,
      p_content: "Recursion is when a function calls itself.",
      p_source: "typed",
    });
    assert.equal(second.error, null);
    assert.equal(second.data, first.data, "same clientTurnId must resolve to the same turn");

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data.length, 1, "retry must not create a second learner turn");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a completed final turn can be replayed with the same clientTurnId after a lost response", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  const clientId = crypto.randomUUID();
  const content = "Binary search repeatedly halves a sorted search space.";

  try {
    const first = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: clientId,
      p_content: content,
      p_source: "typed",
    });
    assert.equal(first.error, null);
    const turnId = first.data as string;

    assert.equal((await claimCall(alice.client, sid, turnId)).ok, true);
    const applied = await applyResult(alice.client, {
      sessionId: sid,
      learnerTurnId: turnId,
      stage: "completed",
      complete: true,
      studentState: "mastered",
      message: "I think I get it now.",
      interactionType: "assessment",
      mastery: {
        coreIdea: "mastered",
        mechanism: "mastered",
        misconceptionRepair: "mastered",
        transfer: "mastered",
      },
      evidenceLedger: {
        coreIdea: [{ dimension: "coreIdea", turnId, type: "explanation", summary: "Core idea.", quote: null }],
        mechanism: [{ dimension: "mechanism", turnId, type: "explanation", summary: "Mechanism.", quote: null }],
        misconceptionRepair: [{ dimension: "misconceptionRepair", turnId, type: "correction", summary: "Repair.", quote: null }],
        transfer: [{ dimension: "transfer", turnId, type: "transfer_answer", summary: "Transfer.", quote: null }],
      },
      masteryResult: { overall: "mastered" },
    });
    assert.equal(applied.ok, true, applied.error ?? "");

    // Simulate the browser losing that HTTP response and retrying the same
    // clientTurnId after the attempt is already completed.
    const replay = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: clientId,
      p_content: content,
      p_source: "typed",
    });
    assert.equal(replay.error, null);
    assert.equal(replay.data, turnId);

    const turns = await readTurns(alice.client, sid);
    assert.equal(
      turns.data.filter((turn: { role: string }) => turn.role === "learner").length,
      1,
      "replay after completion must not create new evidence",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("reusing a clientTurnId with different content is rejected", async () => {
  const sid = await createSession(alice.client, "Recursion");
  const clientId = crypto.randomUUID();

  try {
    const first = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: clientId,
      p_content: "A recursive function calls itself.",
      p_source: "typed",
    });
    assert.equal(first.error, null);

    const mismatch = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: clientId,
      p_content: "This is different content for the same id.",
      p_source: "typed",
    });
    assert.ok(mismatch.error, "idempotency keys must not be reusable for different evidence");
    assert.match(mismatch.error.message, /different learner content/i);

    const turns = await readTurns(alice.client, sid);
    assert.equal(turns.data.length, 1);
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("interaction_type is derived from the authoritative stage, not client input", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    // Session starts at orient, so the first learner turn is an explanation.
    const first = await appendTurn(alice.client, sid, "It checks the middle.");
    let turns = await readTurns(alice.client, sid);
    let learnerTurns = turns.data.filter((t: { role: string }) => t.role === "learner");
    assert.equal(learnerTurns[0].interaction_type, "explanation");

    // Advance stage only through the authorized evaluator path. Direct table
    // UPDATE is intentionally unavailable to authenticated clients.
    const { claimCall } = await import("../helpers/supabase.ts");
    assert.equal((await claimCall(alice.client, sid, first.turnId)).ok, true);
    const toRepair = await applyResult(alice.client, {
      sessionId: sid,
      learnerTurnId: first.turnId,
      stage: "repair",
    });
    assert.equal(toRepair.ok, true, toRepair.error ?? "");

    const correction = await appendTurn(
      alice.client,
      sid,
      "Ordering is what tells us which half cannot contain it.",
    );
    turns = await readTurns(alice.client, sid);
    learnerTurns = turns.data.filter((t: { role: string }) => t.role === "learner");
    assert.equal(
      learnerTurns[1].interaction_type,
      "correction",
      "stage 'repair' must yield 'correction'",
    );

    assert.equal((await claimCall(alice.client, sid, correction.turnId)).ok, true);
    const toTransfer = await applyResult(alice.client, {
      sessionId: sid,
      learnerTurnId: correction.turnId,
      stage: "transfer",
    });
    assert.equal(toTransfer.ok, true, toTransfer.error ?? "");

    await appendTurn(
      alice.client,
      sid,
      "Yes — the same ordering property is what matters.",
    );
    turns = await readTurns(alice.client, sid);
    learnerTurns = turns.data.filter((t: { role: string }) => t.role === "learner");
    assert.equal(
      learnerTurns[2].interaction_type,
      "transfer_answer",
      "stage 'transfer' must yield 'transfer_answer'",
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("a learner turn cannot be read by another user", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    await appendTurn(alice.client, sid, "It halves the search space each step.");

    const { data } = await bob.client
      .from("session_turns")
      .select("id, content")
      .eq("session_id", sid);
    assert.deepEqual(data, [], "transcript must not leak cross-user");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("appending to another user's session is denied", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const { error } = await bob.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: crypto.randomUUID(),
      p_content: "injected content",
      p_source: "typed",
    });
    assert.ok(error, "appending to another user's session must fail");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("empty and oversized learner turns are rejected", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    const blank = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: crypto.randomUUID(),
      p_content: "   ",
      p_source: "typed",
    });
    assert.ok(blank.error, "blank turn must be rejected");

    const huge = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: crypto.randomUUID(),
      p_content: "x".repeat(4001),
      p_source: "typed",
    });
    assert.ok(huge.error, "4001-character turn must be rejected");

    const badSource = await alice.client.rpc("append_learner_turn", {
      p_session_id: sid,
      p_client_turn_id: crypto.randomUUID(),
      p_content: "valid content",
      p_source: "telepathy",
    });
    assert.ok(badSource.error, "invalid source must be rejected");
  } finally {
    await cleanupSession(alice.client, sid);
  }
});

test("turn sequence increases monotonically", async () => {
  const sid = await createSession(alice.client, "Binary Search");
  try {
    await appendTurn(alice.client, sid, "First.");
    await appendTurn(alice.client, sid, "Second.");
    await appendTurn(alice.client, sid, "Third.");

    const turns = await readTurns(alice.client, sid);
    assert.deepEqual(
      turns.data.map((t: { sequence: number }) => t.sequence),
      [1, 2, 3],
    );
  } finally {
    await cleanupSession(alice.client, sid);
  }
});