import type { MasteryDimensions } from "@/lib/types";
import type { EvidenceLedger } from "@/lib/ai/types";

const LABELS: Record<keyof MasteryDimensions, string> = {
  coreIdea: "Core idea",
  mechanism: "Mechanism",
  misconceptionRepair: "Misconception repair",
  transfer: "Transfer",
};

export function buildMasteryResult(
  dimensions: MasteryDimensions,
  ledger: EvidenceLedger,
) {
  const states = Object.values(dimensions);
  const mastered = states.filter((state) => state === "mastered").length;
  const weak = states.filter((state) => state === "weak").length;

  const overall =
    mastered === 4
      ? "mastered"
      : mastered >= 2 && weak === 0
        ? "almost_there"
        : "revisit";

  const evidence = Object.values(ledger)
    .flat()
    .slice(-6)
    .map((item) => item.summary);

  const remainingGaps = (
    Object.entries(dimensions) as Array<
      [keyof MasteryDimensions, MasteryDimensions[keyof MasteryDimensions]]
    >
  )
    .filter(([, state]) => state !== "mastered")
    .map(([dimension, state]) => ({
      dimension,
      label: LABELS[dimension],
      state,
    }));

  return {
    overall,
    dimensions,
    evidence,
    remainingGaps,
  };
}
