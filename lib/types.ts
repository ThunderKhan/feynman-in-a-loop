export type SessionStatus = "in_progress" | "completed";

export type Stage =
  | "orient"
  | "explain"
  | "diagnose"
  | "repair"
  | "transfer"
  | "assess"
  | "completed";

export type StudentState =
  | "ready"
  | "listening"
  | "thinking"
  | "confused"
  | "corrected"
  | "testing"
  | "understanding"
  | "mastered"
  | "error";

export type DimensionState = "untested" | "weak" | "partial" | "mastered";

export type MasteryDimensions = {
  coreIdea: DimensionState;
  mechanism: DimensionState;
  misconceptionRepair: DimensionState;
  transfer: DimensionState;
};

export type LearningSession = {
  id: string;
  topic: string;
  status: SessionStatus;
  stage: Stage;
  student_state: StudentState | null;
  model_calls_used: number;
  mastery: MasteryDimensions | null;
  mastery_result: unknown;
  created_at: string;
  completed_at: string | null;
};