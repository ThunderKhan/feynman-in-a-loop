import type { LearningSession, MasteryDimensions } from "../types";
import {
  EMPTY_MASTERY,
  normalizeDimensionState,
  type ContextTurn,
  type EvidenceLedger,
  type TurnContext,
} from "./types";
import { normalizeLedger } from "./evidence";

export type StoredTurn = {
  id: string;
  sequence: number;
  role: "learner" | "student";
  interaction_type: string;
  content: string;
};

function normalizeMastery(value: unknown): MasteryDimensions {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    coreIdea: normalizeDimensionState(
      source.coreIdea ?? EMPTY_MASTERY.coreIdea,
    ),
    mechanism: normalizeDimensionState(
      source.mechanism ?? EMPTY_MASTERY.mechanism,
    ),
    misconceptionRepair: normalizeDimensionState(
      source.misconceptionRepair ?? EMPTY_MASTERY.misconceptionRepair,
    ),
    transfer: normalizeDimensionState(
      source.transfer ?? EMPTY_MASTERY.transfer,
    ),
  };
}

function toContextTurn(turn: StoredTurn): ContextTurn {
  return {
    id: turn.id,
    sequence: turn.sequence,
    role: turn.role,
    interactionType: turn.interaction_type,
    content: turn.content,
  };
}

function evidenceTurnIds(ledger: EvidenceLedger) {
  return new Set(
    Object.values(ledger).flatMap((items) => items.map((item) => item.turnId)),
  );
}

/**
 * Evidence-aware bounded context.
 *
 * The transcript is tiny in the PoC, but this selector deliberately does not
 * send it wholesale: the first learner explanation is permanent, active
 * evidence sources stay available, the latest student question stays visible,
 * and only the latest two learner turns are carried otherwise.
 */
export function selectTurnContext(
  session: LearningSession & {
    evidence_ledger?: unknown;
    active_target_gap?: string | null;
  },
  storedTurns: StoredTurn[],
): TurnContext {
  const ordered = [...storedTurns].sort((a, b) => a.sequence - b.sequence);
  const ledger = normalizeLedger(session.evidence_ledger);
  const keep = new Set<string>();

  const learnerTurns = ordered.filter((turn) => turn.role === "learner");
  const studentTurns = ordered.filter((turn) => turn.role === "student");

  const anchor = learnerTurns[0];
  if (anchor) keep.add(anchor.id);

  for (const turn of learnerTurns.slice(-2)) keep.add(turn.id);

  const lastStudent = studentTurns.at(-1);
  if (lastStudent) keep.add(lastStudent.id);

  const groundedIds = evidenceTurnIds(ledger);
  for (const id of groundedIds) keep.add(id);

  // Keep the learner turn immediately preceding the latest student question;
  // it is usually the turn that created the active diagnostic gap.
  if (lastStudent) {
    const priorLearner = [...learnerTurns]
      .reverse()
      .find((turn) => turn.sequence < lastStudent.sequence);
    if (priorLearner) keep.add(priorLearner.id);
  }

  const selected = ordered
    .filter((turn) => keep.has(turn.id))
    .map(toContextTurn);

  return {
    topic: session.topic,
    currentStage: session.stage,
    mastery: normalizeMastery(session.mastery),
    targetGap: session.active_target_gap ?? null,
    turns: selected,
    evidenceLedger: ledger,
  };
}
