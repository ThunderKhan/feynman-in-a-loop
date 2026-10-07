import test from "node:test";
import assert from "node:assert/strict";
import { groqResponseFormatFor } from "../../lib/ai/providers/groq.ts";
import type { TurnInput } from "../../lib/ai/types.ts";
import { EMPTY_LEDGER, EMPTY_MASTERY } from "../../lib/ai/types.ts";

function input(mode: TurnInput["mode"]): TurnInput {
  return {
    topic: "Binary Search",
    currentStage: "explain",
    mastery: EMPTY_MASTERY,
    targetGap: null,
    turns: [],
    evidenceLedger: EMPTY_LEDGER,
    learnerTurnId: "11111111-1111-4111-8111-111111111111",
    learnerContent: "Binary search halves the search space.",
    mode,
    retryReason: null,
    fixedEvaluation: null,
    priorityRule: null,
  };
}

test("normal Groq turns use strict JSON Schema mode", () => {
  const format = groqResponseFormatFor(input("normal"));
  assert.equal(format.type, "json_schema");
  assert.equal("json_schema" in format && format.json_schema.strict, true);
});

test("full retries use JSON Object Mode before application validation", () => {
  const format = groqResponseFormatFor(input("retry"));
  assert.deepEqual(format, { type: "json_object" });
});

test("student-only repair also uses JSON Object Mode", () => {
  const format = groqResponseFormatFor(input("student_repair"));
  assert.deepEqual(format, { type: "json_object" });
});
