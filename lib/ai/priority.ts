import type { Stage } from "../types.ts";
import type { PriorityRule, TurnEvaluation } from "./types.ts";

const SORTED_SIGNAL =
  /\b(sort(?:ed|ing)?|order(?:ed|ing)?|monotonic|ascending|descending|alphabetic(?:al|ally)?)\b/i;

const SOUND_ELIMINATION_SIGNAL =
  /\b(discard|eliminat(?:e|ed|ion)|throw away|rule out|remaining|remain|safe(?:ly)?|guarantee)\b/i;

const SEARCH_PARTITION_SIGNAL =
  /\b(half|side|range|interval|portion|search space|left|right)\b/i;

export function derivePriorityRule(args: {
  topic: string;
  currentStage: Stage;
  learnerContent: string;
}): PriorityRule | null {
  const topic = args.topic.trim().toLowerCase();

  if (topic !== "binary search") return null;
  if (args.currentStage !== "orient" && args.currentStage !== "explain") {
    return null;
  }

  // The deterministic demo contract only activates while the learner has not
  // yet stated the prerequisite that makes binary-search elimination sound.
  // Once sorted/order evidence is present, the general evaluator is free to
  // choose the next most important gap.
  if (SORTED_SIGNAL.test(args.learnerContent)) return null;

  return {
    id: "binary-search-sorted-invariant",
    instruction:
      "Highest-priority unresolved prerequisite: verify that the learner knows the searchable sequence must be sorted/ordered, and why that ordering makes discarding one side sound. Probe this before termination, index arithmetic, complexity, duplicates, syntax, or other edge cases.",
  };
}

export function priorityRuleMatchesEvaluation(
  rule: PriorityRule,
  evaluation: TurnEvaluation,
) {
  if (rule.id !== "binary-search-sorted-invariant") return true;

  const target = evaluation.targetGap ?? "";
  const targetHasSortedSignal = SORTED_SIGNAL.test(target);
  const targetExplainsSoundElimination =
    SOUND_ELIMINATION_SIGNAL.test(target) &&
    SEARCH_PARTITION_SIGNAL.test(target);

  return targetHasSortedSignal || targetExplainsSoundElimination;
}
