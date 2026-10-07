import test from "node:test";
import assert from "node:assert/strict";
import { selectTurnContext } from "../../lib/ai/context.ts";
import type { LearningSession } from "../../lib/types.ts";

const session: LearningSession = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  topic: "Binary Search",
  status: "in_progress",
  stage: "repair",
  student_state: "confused",
  model_calls_used: 2,
  mastery: {
    coreIdea: "mastered",
    mechanism: "partial",
    misconceptionRepair: "untested",
    transfer: "untested",
  },
  evidence_ledger: {
    coreIdea: [
      {
        dimension: "coreIdea",
        turnId: "11111111-1111-4111-8111-111111111111",
        type: "explanation",
        summary: "Explained midpoint search.",
        quote: null,
      },
    ],
  },
  active_target_gap: "sorted invariant",
  mastery_result: null,
  created_at: "2026-10-07T00:00:00Z",
  completed_at: null,
};

const turns = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    role: "learner" as const,
    interaction_type: "explanation",
    content: "We check the middle and halve the search space.",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    sequence: 2,
    role: "student" as const,
    interaction_type: "probe",
    content: "Why can we discard a half?",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    sequence: 3,
    role: "learner" as const,
    interaction_type: "explanation",
    content: "Because the values are ordered.",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    sequence: 4,
    role: "student" as const,
    interaction_type: "misconception",
    content: "So it also works if the values are shuffled?",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    sequence: 5,
    role: "learner" as const,
    interaction_type: "correction",
    content: "No. Sorted order is what makes the discarded half impossible.",
  },
];

test("context keeps the anchor, active evidence, latest student, and recent learner turns", () => {
  const selected = selectTurnContext(session, turns);
  const ids = new Set(selected.turns.map((turn) => turn.id));

  assert.ok(ids.has(turns[0].id), "first learner explanation is a permanent anchor");
  assert.ok(ids.has(turns[3].id), "latest student question stays visible");
  assert.ok(ids.has(turns[4].id), "latest learner correction stays visible");
  assert.equal(selected.targetGap, "sorted invariant");
  assert.equal(selected.mastery.mechanism, "partial");
});
