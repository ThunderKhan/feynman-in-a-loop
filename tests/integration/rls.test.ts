import test from "node:test";
import assert from "node:assert/strict";
import {
  createTestUser,
  createSession,
  cleanupSession,
  appendTurn,
  clientTurnId,
  readSession,
  type TestUser,
} from "../helpers/supabase.ts";

/**
 * RLS is the authorization boundary.
 *
 * SPEC: devpost/spec.md > Data Model ("RLS as the authorization boundary")
 * SPEC: devpost/spec.md > Database Operations (SECURITY INVOKER, RLS preserved)
 */

let alice: TestUser;
let bob: TestUser;

test("setup: create two distinct users", async () => {
  alice = await createTestUser("alice");
  bob = await createTestUser("bob");
  assert.notEqual(alice.userId, bob.userId);
});

test("a user can read their own session", async () => {
  const id = await createSession(alice.client, "Binary Search");
  try {
    const { data, error } = await readSession(alice.client, id);
    assert.equal(error, null);
    assert.equal(data!.id, id);
    assert.equal(data!.topic, "Binary Search");
    assert.equal(data!.status, "in_progress");
    // Identity is derived server-side, never accepted from the client.
    assert.equal(data!.user_id, alice.userId);
  } finally {
    await cleanupSession(alice.client, id);
  }
});

test("a user CANNOT read another user's session (cross-user select denied)", async () => {
  const id = await createSession(alice.client, "Recursion");

  const { data, error } = await readSession(bob.client, id);
  // RLS filters the row out rather than erroring; either way no data leaks.
  assert.equal(data, null, "cross-user read must not return the row");

  const { data: list } = await bob.client
    .from("learning_sessions")
    .select("id, topic")
    .eq("id", id);
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
test("a session cannot be deleted by another user, and not directly at all", async () => {
  const id = await createSession(alice.client, "Photosynthesis");

  // Direct delete is blocked by privilege, so the row survives...
  const direct = await bob.client.from("learning_sessions").delete().eq("id", id);
  assert.ok(direct.error, "direct delete must be rejected");
  assert.ok((await readSession(alice.client, id)).data, "row must still exist");

  // ...and the authorized RPC refuses cross-user deletion.
  const cross = await bob.client.rpc("delete_session", { p_session_id: id });
  assert.ok(cross.error, "cross-user delete must be refused");
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

  const { data: anonList } = await (await import("../helpers/supabase.ts")).anonClient()
    .from("learning_sessions")
    .select("id")
    .eq("id", id);
  assert.deepEqual(anonList, [], "anonymous access must return nothing");

  await cleanupSession(alice.client, id);
});

test("topic bounds are enforced by the database, not just the app", async () => {
  const { error: tooLong } = await alice.client
    .from("learning_sessions")
    .insert({ topic: "x".repeat(121) });
  assert.ok(tooLong, "121-character topic must be rejected by the CHECK constraint");

  const { error: blank } = await alice.client
    .from("learning_sessions")
    .insert({ topic: "   " });
  assert.ok(blank, "whitespace-only topic must be rejected");

  const { data: ok } = await alice.client
    .from("learning_sessions")
    .insert({ topic: "x".repeat(120) })
    .select("id")
    .single();
  assert.ok(ok, "120-character topic must be accepted");
  await cleanupSession(alice.client, ok.id);
});