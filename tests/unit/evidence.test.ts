import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeEvidenceLedger,
  validateEvidenceItems,
} from "../../lib/ai/evidence.ts";
import { EMPTY_LEDGER } from "../../lib/ai/types.ts";

const turn = {
  id: "11111111-1111-4111-8111-111111111111",
  sequence: 1,
  role: "learner" as const,
  interactionType: "explanation",
  content: "Binary search needs sorted data so one half can be discarded.",
};

test("evidence quotes must be grounded in a learner turn from model context", () => {
  assert.doesNotThrow(() =>
    validateEvidenceItems(
      [
        {
          dimension: "mechanism",
          turnId: turn.id,
          type: "explanation",
          summary: "Explained why a half can be discarded.",
          quote: "one half can be discarded",
        },
      ],
      [turn],
    ),
  );

  assert.throws(
    () =>
      validateEvidenceItems(
        [
          {
            dimension: "mechanism",
            turnId: turn.id,
            type: "explanation",
            summary: "Unsupported quote.",
            quote: "hash table",
          },
        ],
        [turn],
      ),
    /does not match/i,
  );
});

test("the model cannot relabel an explanation as correction or transfer evidence", () => {
  assert.throws(
    () =>
      validateEvidenceItems(
        [
          {
            dimension: "misconceptionRepair",
            turnId: turn.id,
            type: "correction",
            summary: "Pretended this was a correction.",
            quote: null,
          },
        ],
        [turn],
      ),
    /does not match authoritative learner-turn type/i,
  );
});

test("ledger merge is append-only and deduplicates identical evidence", () => {
  const item = {
    dimension: "coreIdea" as const,
    turnId: turn.id,
    type: "explanation" as const,
    summary: "Explained midpoint search.",
    quote: null,
  };

  const once = mergeEvidenceLedger(EMPTY_LEDGER, [item]);
  const twice = mergeEvidenceLedger(once, [item]);

  assert.equal(twice.coreIdea.length, 1);
  assert.deepEqual(twice.coreIdea[0], item);
});
