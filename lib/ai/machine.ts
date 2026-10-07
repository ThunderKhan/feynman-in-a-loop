import type { Stage } from "../types.ts";
import type { ContextTurn, EvidenceLedger, TurnEvaluation } from "./types.ts";
import {
  ledgerHasEvidenceForEveryDimension,
  ledgerHasType,
} from "./evidence.ts";

export class MachineTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MachineTransitionError";
  }
}

function learnerTypeCount(turns: ContextTurn[], type: string) {
  return turns.filter(
    (turn) => turn.role === "learner" && turn.interactionType === type,
  ).length;
}

function studentTypeCount(turns: ContextTurn[], type: string) {
  return turns.filter(
    (turn) => turn.role === "student" && turn.interactionType === type,
  ).length;
}

export type TransitionResult = {
  proposedStage: Stage;
  persistedStage: Stage;
  complete: boolean;
};

/**
 * The learner's first submitted explanation is the event that consumes
 * ORIENT -> EXPLAIN. The evaluator therefore proposes from effective EXPLAIN
 * even though the persisted row is still ORIENT until this turn is applied.
 */
function effectiveCurrentStage(current: Stage, turns: ContextTurn[]): Stage {
  if (
    current === "orient" &&
    turns.some((turn) => turn.role === "learner")
  ) {
    return "explain";
  }
  return current;
}

export function validateTransition(args: {
  currentStage: Stage;
  proposal: TurnEvaluation;
  mergedLedger: EvidenceLedger;
  contextTurns: ContextTurn[];
}): TransitionResult {
  const { proposal, mergedLedger, contextTurns } = args;
  const current = effectiveCurrentStage(args.currentStage, contextTurns);
  const next = proposal.stage;

  if (current === "completed") {
    throw new MachineTransitionError("Completed sessions cannot transition.");
  }

  const allowed: Record<Stage, Stage[]> = {
    orient: ["explain"],
    explain: ["explain", "diagnose"],
    diagnose: ["diagnose", "repair"],
    repair: ["repair", "transfer"],
    transfer: ["transfer", "assess"],
    assess: ["completed"],
    completed: [],
  };

  if (!allowed[current].includes(next)) {
    throw new MachineTransitionError(
      `Illegal stage transition: ${current} -> ${next}.`,
    );
  }

  if (current === "diagnose" && next === "diagnose") {
    const priorDiagnosticQuestions = studentTypeCount(contextTurns, "probe");
    if (priorDiagnosticQuestions >= 2) {
      throw new MachineTransitionError(
        "Diagnostic follow-up allowance is exhausted.",
      );
    }
  }

  if (current === "repair" && next === "transfer") {
    if (!ledgerHasType(mergedLedger, "correction")) {
      throw new MachineTransitionError(
        "Repair -> transfer requires grounded correction evidence.",
      );
    }
  }

  if (current === "repair" && next === "repair") {
    const corrections = learnerTypeCount(contextTurns, "correction");
    if (corrections >= 2) {
      throw new MachineTransitionError(
        "Repair follow-up allowance is exhausted.",
      );
    }
  }

  if (current === "transfer" && next === "transfer") {
    const transferAnswers = learnerTypeCount(contextTurns, "transfer_answer");
    if (transferAnswers >= 2) {
      throw new MachineTransitionError(
        "Transfer follow-up allowance is exhausted.",
      );
    }
  }

  if (next === "assess") {
    if (!proposal.shouldComplete) {
      throw new MachineTransitionError(
        "ASSESS is terminal in the PoC and requires shouldComplete=true.",
      );
    }
    if (!ledgerHasEvidenceForEveryDimension(mergedLedger)) {
      throw new MachineTransitionError(
        "Assessment requires evidence for all four mastery dimensions.",
      );
    }
    if (!ledgerHasType(mergedLedger, "correction")) {
      throw new MachineTransitionError(
        "Assessment requires misconception-repair evidence.",
      );
    }
    if (!ledgerHasType(mergedLedger, "transfer_answer")) {
      throw new MachineTransitionError(
        "Assessment requires transfer evidence.",
      );
    }

    return {
      proposedStage: next,
      persistedStage: "completed",
      complete: true,
    };
  }

  if (proposal.shouldComplete) {
    throw new MachineTransitionError(
      "shouldComplete may only be true when proposing ASSESS.",
    );
  }

  return {
    proposedStage: next,
    persistedStage: next,
    complete: false,
  };
}
