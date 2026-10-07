import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTransition,
  MachineTransitionError,
} from "../../lib/ai/machine.ts";
import { EMPTY_LEDGER } from "../../lib/ai/types.ts";

function evaluation(stage: "diagnose" | "repair" | "transfer" | "assess") {
  return {
    stage,
    studentState: "confused" as const,
    dimensions: {
      coreIdea: "untested" as const,
      mechanism: "untested" as const,
      misconceptionRepair: "untested" as const,
      transfer: "untested" as const,
    },
    targetGap: "sorted invariant",
    nextAction: "probe" as const,
    shouldComplete: false,
    evidence: [],
  };
}

test("the first learner explanation consumes orient -> explain and may propose diagnose", () => {
  const result = validateTransition({
    currentStage: "orient",
    proposal: evaluation("diagnose"),
    mergedLedger: EMPTY_LEDGER,
    contextTurns: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        sequence: 1,
        role: "learner",
        interactionType: "explanation",
        content: "Binary search checks the middle.",
      },
    ],
  });

  assert.equal(result.persistedStage, "diagnose");
  assert.equal(result.complete, false);
});

test("repair cannot advance to transfer without correction evidence", () => {
  assert.throws(
    () =>
      validateTransition({
        currentStage: "repair",
        proposal: evaluation("transfer"),
        mergedLedger: EMPTY_LEDGER,
        contextTurns: [],
      }),
    MachineTransitionError,
  );
});

test("transfer assessment completes only with evidence in all dimensions", () => {
  const ledger = {
    coreIdea: [
      {
        dimension: "coreIdea" as const,
        turnId: "11111111-1111-4111-8111-111111111111",
        type: "explanation" as const,
        summary: "Core idea.",
        quote: null,
      },
    ],
    mechanism: [
      {
        dimension: "mechanism" as const,
        turnId: "11111111-1111-4111-8111-111111111111",
        type: "explanation" as const,
        summary: "Mechanism.",
        quote: null,
      },
    ],
    misconceptionRepair: [
      {
        dimension: "misconceptionRepair" as const,
        turnId: "22222222-2222-4222-8222-222222222222",
        type: "correction" as const,
        summary: "Repaired misconception.",
        quote: null,
      },
    ],
    transfer: [
      {
        dimension: "transfer" as const,
        turnId: "33333333-3333-4333-8333-333333333333",
        type: "transfer_answer" as const,
        summary: "Transferred concept.",
        quote: null,
      },
    ],
  };

  const proposal = {
    ...evaluation("assess"),
    studentState: "understanding" as const,
    nextAction: "assess" as const,
    shouldComplete: true,
    dimensions: {
      coreIdea: "mastered" as const,
      mechanism: "mastered" as const,
      misconceptionRepair: "mastered" as const,
      transfer: "partial" as const,
    },
  };

  const result = validateTransition({
    currentStage: "transfer",
    proposal,
    mergedLedger: ledger,
    contextTurns: [],
  });

  assert.equal(result.persistedStage, "completed");
  assert.equal(result.complete, true);
});
