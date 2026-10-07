import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTurnOutput,
  TurnValidationError,
} from "../../lib/ai/validate.ts";
import { EMPTY_LEDGER } from "../../lib/ai/types.ts";

const turnId = "11111111-1111-4111-8111-111111111111";
const context = {
  sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  contextTurns: [
    {
      id: turnId,
      sequence: 1,
      role: "learner" as const,
      interactionType: "explanation",
      content: "Binary search needs sorted data because ordering tells us which half is impossible.",
    },
  ],
  existingLedger: EMPTY_LEDGER,
};

function validOutput() {
  return {
    evaluation: {
      stage: "diagnose",
      studentState: "confused",
      dimensions: {
        coreIdea: "partial",
        mechanism: "untested",
        misconceptionRepair: "untested",
        transfer: "untested",
      },
      targetGap: "why ordering matters",
      nextAction: "probe",
      shouldComplete: false,
      evidence: [
        {
          dimension: "coreIdea",
          turnId,
          type: "explanation",
          summary: "Learner described the sorted-data requirement.",
          quote: "needs sorted data",
        },
      ],
    },
    student: {
      state: "confused",
      message: "Why does ordering let us safely throw one side away?",
    },
  };
}

test("valid structured output passes all three validation gates", () => {
  const result = validateTurnOutput(validOutput(), context);
  assert.equal(result.output.evaluation.stage, "diagnose");
  assert.equal(result.mergedLedger.coreIdea.length, 1);
});

test("evidence referencing a turn outside model context fails meaning validation", () => {
  const output = validOutput();
  output.evaluation.evidence[0].turnId =
    "22222222-2222-4222-8222-222222222222";

  assert.throws(
    () => validateTurnOutput(output, context),
    (error) =>
      error instanceof TurnValidationError && error.gate === "meaning",
  );
});

test("a diagnostic question may mention the concept without leaking evaluator metadata", () => {
  const output = validOutput();
  output.evaluation.targetGap = "why sorted order makes discarding a half sound";
  output.student.message = "Why does sorted order let us safely discard one half?";

  assert.doesNotThrow(() => validateTurnOutput(output, context));
});

test("public student text cannot reveal evaluator meta-diagnosis", () => {
  const output = validOutput();
  output.evaluation.targetGap = "sorted invariant";
  output.student.message = "Your current gap is the sorted invariant.";

  assert.throws(
    () => validateTurnOutput(output, context),
    (error) =>
      error instanceof TurnValidationError && error.gate === "boundary",
  );
});
