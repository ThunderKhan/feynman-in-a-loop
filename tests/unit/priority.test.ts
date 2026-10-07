import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePriorityRule,
  priorityRuleMatchesEvaluation,
} from "../../lib/ai/priority.ts";
import type { TurnEvaluation } from "../../lib/ai/types.ts";

test("Binary Search initial explanation gets a sorted-invariant priority when ordering is missing", () => {
  const rule = derivePriorityRule({
    topic: "Binary Search",
    currentStage: "orient",
    learnerContent:
      "Check the middle item, then go left or right and keep cutting the search space in half.",
  });

  assert.equal(rule?.id, "binary-search-sorted-invariant");
});

test("priority rule turns off once the learner states the sorted prerequisite", () => {
  const rule = derivePriorityRule({
    topic: "Binary Search",
    currentStage: "orient",
    learnerContent:
      "Binary search requires sorted data. Compare the middle item and discard the impossible half.",
  });

  assert.equal(rule, null);
});

test("the demo priority contract rejects lower-severity termination gaps", () => {
  const rule = derivePriorityRule({
    topic: "Binary Search",
    currentStage: "orient",
    learnerContent:
      "Check the middle item, then go left or right and halve the search space.",
  });
  assert.ok(rule);

  const evaluation: TurnEvaluation = {
    stage: "diagnose",
    studentState: "confused",
    dimensions: {
      coreIdea: "partial",
      mechanism: "partial",
      misconceptionRepair: "untested",
      transfer: "untested",
    },
    targetGap: "What condition guarantees binary search will eventually stop?",
    nextAction: "probe",
    shouldComplete: false,
    evidence: [],
  };

  assert.equal(priorityRuleMatchesEvaluation(rule, evaluation), false);

  evaluation.targetGap =
    "Why does sorted order make discarding one half safe?";
  assert.equal(priorityRuleMatchesEvaluation(rule, evaluation), true);
});
