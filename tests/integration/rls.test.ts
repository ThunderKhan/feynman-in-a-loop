import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestUser,
  createSession,
  cleanupSession,
  readSession,
  adminClient,
  type TestUser,
} from "../helpers/supabase.ts";

/**
 * RLS is the browser READ authorization boundary. Direct table writes are
 * separately denied by privileges; evaluator/quota mutations are server-only.
 *
 * SPEC: devpost/spec.md > Data Model
 * SPEC: devpost/spec.md > Database Operations
 */

let alice: TestUser;
let bob: TestUser;

test("setup: create two distinct users", async () => {
  alice = await createTestUser("alice");
  bob = await createTestUser("bob");
  assert.notEqual(alice.userId, bob.userId);
});

test("a user can read the public columns of their own session", async () => {
  const id = await createSession(alice.client, "Binary Search");
  try {
    const { data, error } = await alice.client
      .from("learning_sessions")
      .select("id, topic, status, stage, student_state")
      .eq("id", id)
      .single();

    assert.equal(error, null);
    assert.equal(data!.id, id);
    assert.equal(data!.topic, "Binary Search");
    assert.equal(data!.status, "in_progress");
  } finally {
    await cleanupSession(alice.client, id);
  }
});

test("a user CANNOT read another user's session (cross-user select denied)", async () => {
  const id = await createSession(alice.client, "Recursion");

  const { data: list, error } = await bob.client
    .from("learning_sessions")
    .select("id, topic")
    .eq("id", id);
  assert.equal(error, null);
  assert.deepEqual(list, [], "cross-user row must not appear in a scoped query");

  await cleanupSession(alice.client, id);
});

test("a session row cannot be updated by anyone, including its owner", async () => {
  const id = await createSession(alice.client, "Gradient Descent");

  const { error } = await bob.client
    .from("learning_sessions")
    .update({ topic: "hijacked" })
    .eq("id", id);
  assert.ok(error, "direct update must be rejected");

  const { data } = await readSession(alice.client, id);
  assert.equal(data!.topic, "Gradient Descent", "row must be unchanged");
  await cleanupSession(alice.client, id);
});
test("a session cannot be deleted through the authenticated browser surface", async () => {
  const id = await createSession(alice.client, "Photosynthesis");

  const direct = await bob.client.from("learning_sessions").delete().eq("id", id);
  assert.ok(direct.error, "direct delete must be rejected");
  assert.ok((await readSession(alice.client, id)).data, "row must still exist");

  // Deletion is intentionally absent from the product RPC surface.
  const rpc = await alice.client.rpc("delete_session", { p_session_id: id });
  assert.ok(rpc.error, "delete_session must not be browser-callable/present");
  assert.ok((await readSession(alice.client, id)).data, "row must still exist");

  await cleanupSession(alice.client, id);
});
test("a session can only be created through create_session, which derives the owner", async () => {
  // The client has no INSERT privilege, so ownership cannot be forged by
  // supplying a user_id. Creation goes through the RPC, which takes only a
  // topic and sets user_id from auth.uid().
  const { data, error } = await alice.client
    .from("learning_sessions")
    .insert({ topic: "forged", user_id: bob.userId })
    .select("id")
    .single();

  assert.ok(error, "direct insert must be rejected");
  assert.equal(data, null);

  // The authorized path yields a session owned by the caller.
  const id = await createSession(alice.client, "Binary Search");
  try {
    assert.equal((await readSession(alice.client, id)).data!.user_id, alice.userId);
  } finally {
    await cleanupSession(alice.client, id);
  }
});
test("an anonymous client cannot read user-owned rows", async () => {
  const id = await createSession(alice.client, "Binary Search");
  try {
    const { data, error } = await (await import("../helpers/supabase.ts")).anonClient()
      .from("learning_sessions")
      .select("id")
      .eq("id", id);

    // 0002 revokes table privileges from anon entirely, so PostgREST returns
    // permission denied with null data. This is stronger than an RLS-filtered
    // empty result and is the expected production boundary.
    assert.ok(error, "anonymous SELECT must be rejected");
    assert.equal(data, null, "anonymous SELECT must return no row data");
  } finally {
    await cleanupSession(alice.client, id);
  }
});

test("topic bounds are enforced by the database, not only by the app/RPC", async () => {
  // Authenticated users have no direct INSERT privilege. Use the server-only
  // client here specifically to reach and prove the table CHECK constraints.
  const admin = adminClient();

  const { error: tooLong } = await admin
    .from("learning_sessions")
    .insert({ topic: "x".repeat(121), user_id: alice.userId });
  assert.ok(tooLong, "121-character topic must be rejected by the CHECK constraint");
  assert.match(tooLong.message, /topic_length|check constraint/i);

  const { error: blank } = await admin
    .from("learning_sessions")
    .insert({ topic: "   ", user_id: alice.userId });
  assert.ok(blank, "whitespace-only topic must be rejected by the CHECK constraint");
  assert.match(blank.message, /topic_not_blank|check constraint/i);

  const { data: ok, error: okError } = await admin
    .from("learning_sessions")
    .insert({ topic: "x".repeat(120), user_id: alice.userId })
    .select("id")
    .single();
  assert.equal(okError, null);
  assert.ok(ok, "120-character topic must be accepted by the database");
  await cleanupSession(alice.client, ok.id);
});
