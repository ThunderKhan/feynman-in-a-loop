import { TurnOutputSchema } from "./schemas/turn.ts";
import type {
  Dimension,
  EvidenceLedger,
  TurnOutput,
  ValidationContext,
  ValidationResult,
} from "./types.ts";
import {
  ledgerHasEvidenceForEveryDimension,
  ledgerHasType,
  mergeEvidenceLedger,
  validateEvidenceItems,
} from "./evidence.ts";

export class TurnValidationError extends Error {
  readonly gate: "shape" | "meaning" | "boundary";

  constructor(
    message: string,
    gate: "shape" | "meaning" | "boundary",
  ) {
    super(message);
    this.name = "TurnValidationError";
    this.gate = gate;
  }
}

const DIMENSIONS: Dimension[] = [
  "coreIdea",
  "mechanism",
  "misconceptionRepair",
  "transfer",
];

function normalizeForLeakCheck(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateStudentBoundary(output: TurnOutput) {
  if (output.student.state !== output.evaluation.studentState) {
    throw new TurnValidationError(
      "Student state contradicts evaluator state.",
      "meaning",
    );
  }

  // A good diagnostic question will naturally use some of the same concept
  // words as the private target gap. That is not a leak. What must remain
  // hidden is the evaluator's *meta-diagnosis* ("your gap is...", "I'm
  // testing whether...", mastery/scoring language, etc.).
  const forbidden = [
    /^(?:great|nice|perfect|exactly|excellent|good job)\b/i,
    /\bmaster(?:y|ed)?\b/i,
    /\b(?:weak|partial)\b/i,
    /\b(?:score|scoring|confidence)\b/i,
    /i(?:'| a)?m testing whether/i,
    /let me check if you understand/i,
    /to assess your/i,
    /your understanding is/i,
    /your (?:main |current )?(?:gap|weakness|missing piece) is/i,
    /you (?:haven't|have not) (?:shown|demonstrated|proved)/i,
    /i noticed (?:that )?you (?:missed|didn't|did not|haven't|have not)/i,
    /evaluator/i,
    /system prompt/i,
    /target gap/i,
  ];

  if (forbidden.some((pattern) => pattern.test(output.student.message))) {
    throw new TurnValidationError(
      "Public student response leaks evaluation framing or uses disallowed praise.",
      "boundary",
    );
  }

  if (
    output.evaluation.shouldComplete &&
    output.student.message.includes("?")
  ) {
    throw new TurnValidationError(
      "A completed attempt must not ask the learner another question.",
      "boundary",
    );
  }
}

function validateMeaning(
  output: TurnOutput,
  context: ValidationContext,
): EvidenceLedger {
  try {
    validateEvidenceItems(output.evaluation.evidence, context.contextTurns);
  } catch (error) {
    throw new TurnValidationError(
      error instanceof Error ? error.message : "Invalid evidence.",
      "meaning",
    );
  }

  const merged = mergeEvidenceLedger(
    context.existingLedger,
    output.evaluation.evidence,
  );

  const stage = output.evaluation.stage;
  if (
    (stage === "diagnose" || stage === "repair") &&
    !output.evaluation.targetGap
  ) {
    throw new TurnValidationError(
      "Diagnostic and repair stages require a private target gap.",
      "meaning",
    );
  }
  if (
    (stage === "transfer" || stage === "assess" || stage === "completed") &&
    output.evaluation.targetGap
  ) {
    throw new TurnValidationError(
      "Target gap must be cleared after repair.",
      "meaning",
    );
  }

  const allowedActions: Record<TurnOutput["evaluation"]["stage"], Array<TurnOutput["evaluation"]["nextAction"]>> = {
    orient: ["clarify"],
    explain: ["clarify", "probe"],
    diagnose: ["clarify", "probe"],
    repair: ["clarify", "probe", "misconception"],
    transfer: ["clarify", "transfer"],
    assess: ["assess", "complete"],
    completed: ["complete"],
  };

  if (!allowedActions[stage].includes(output.evaluation.nextAction)) {
    throw new TurnValidationError(
      `nextAction ${output.evaluation.nextAction} is inconsistent with stage ${stage}.`,
      "meaning",
    );
  }

  for (const dimension of DIMENSIONS) {
    const state = output.evaluation.dimensions[dimension];
    if (state !== "untested" && merged[dimension].length === 0) {
      throw new TurnValidationError(
        `${dimension} cannot be credited without grounded evidence.`,
        "meaning",
      );
    }
  }

  if (
    output.evaluation.dimensions.misconceptionRepair !== "untested" &&
    !merged.misconceptionRepair.some((item) => item.type === "correction")
  ) {
    throw new TurnValidationError(
      "Misconception-repair credit requires correction evidence.",
      "meaning",
    );
  }

  if (
    output.evaluation.dimensions.transfer !== "untested" &&
    !merged.transfer.some((item) => item.type === "transfer_answer")
  ) {
    throw new TurnValidationError(
      "Transfer credit requires transfer-answer evidence.",
      "meaning",
    );
  }

  if (output.evaluation.shouldComplete) {
    if (!ledgerHasEvidenceForEveryDimension(merged)) {
      throw new TurnValidationError(
        "Completion requires evidence for all four dimensions.",
        "meaning",
      );
    }
    if (!ledgerHasType(merged, "correction")) {
      throw new TurnValidationError(
        "Completion requires misconception-repair evidence.",
        "meaning",
      );
    }
    if (!ledgerHasType(merged, "transfer_answer")) {
      throw new TurnValidationError(
        "Completion requires transfer evidence.",
        "meaning",
      );
    }
  }

  return merged;
}

export function validateTurnOutput(
  raw: unknown,
  context: ValidationContext,
): ValidationResult {
  const parsed = TurnOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TurnValidationError(
      parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
      "shape",
    );
  }

  const output = parsed.data as TurnOutput;
  const mergedLedger = validateMeaning(output, context);
  validateStudentBoundary(output);

  return { output, mergedLedger };
}
