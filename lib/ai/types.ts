import type {
  DimensionState,
  MasteryDimensions,
  Stage,
  StudentState,
} from "../types";

export type Dimension =
  | "coreIdea"
  | "mechanism"
  | "misconceptionRepair"
  | "transfer";

export type EvidenceType =
  | "explanation"
  | "probe"
  | "correction"
  | "transfer_answer";

export type EvidenceItem = {
  dimension: Dimension;
  turnId: string;
  type: EvidenceType;
  summary: string;
  quote: string | null;
};

export type EvidenceLedger = Record<Dimension, EvidenceItem[]>;

export type ContextTurn = {
  id: string;
  sequence: number;
  role: "learner" | "student";
  interactionType: string;
  content: string;
};

export type TurnContext = {
  topic: string;
  currentStage: Stage;
  mastery: MasteryDimensions;
  targetGap: string | null;
  turns: ContextTurn[];
  evidenceLedger: EvidenceLedger;
};

export type TurnEvaluation = {
  stage: Stage;
  studentState: StudentState;
  dimensions: MasteryDimensions;
  targetGap: string | null;
  nextAction:
    | "clarify"
    | "probe"
    | "misconception"
    | "transfer"
    | "assess"
    | "complete";
  shouldComplete: boolean;
  evidence: EvidenceItem[];
};

export type TurnOutput = {
  evaluation: TurnEvaluation;
  student: {
    state: StudentState;
    message: string;
  };
};

export type TurnInput = TurnContext & {
  learnerTurnId: string;
  learnerContent: string;
  mode?: "normal" | "retry" | "student_repair";
  retryReason?: string | null;
  fixedEvaluation?: TurnEvaluation | null;
};

export type ValidationContext = {
  sessionId: string;
  contextTurns: ContextTurn[];
  existingLedger: EvidenceLedger;
};

export type ValidationResult = {
  output: TurnOutput;
  mergedLedger: EvidenceLedger;
};

export const EMPTY_MASTERY: MasteryDimensions = {
  coreIdea: "untested",
  mechanism: "untested",
  misconceptionRepair: "untested",
  transfer: "untested",
};

export const EMPTY_LEDGER: EvidenceLedger = {
  coreIdea: [],
  mechanism: [],
  misconceptionRepair: [],
  transfer: [],
};

export function normalizeDimensionState(value: unknown): DimensionState {
  return value === "weak" ||
    value === "partial" ||
    value === "mastered" ||
    value === "untested"
    ? value
    : "untested";
}
