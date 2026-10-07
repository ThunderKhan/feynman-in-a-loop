import type {
  ContextTurn,
  Dimension,
  EvidenceItem,
  EvidenceLedger,
} from "./types";
import { EMPTY_LEDGER } from "./types";

const DIMENSIONS: Dimension[] = [
  "coreIdea",
  "mechanism",
  "misconceptionRepair",
  "transfer",
];

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeLedger(value: unknown): EvidenceLedger {
  const source =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const out: EvidenceLedger = {
    coreIdea: [],
    mechanism: [],
    misconceptionRepair: [],
    transfer: [],
  };

  for (const dimension of DIMENSIONS) {
    const entries = source[dimension];
    if (!Array.isArray(entries)) continue;

    out[dimension] = entries
      .filter(
        (item): item is EvidenceItem =>
          !!item &&
          typeof item === "object" &&
          (item as EvidenceItem).dimension === dimension &&
          typeof (item as EvidenceItem).turnId === "string" &&
          typeof (item as EvidenceItem).summary === "string",
      )
      .map((item) => ({
        ...item,
        quote: typeof item.quote === "string" ? item.quote : null,
      }));
  }

  return out;
}

export function validateEvidenceItems(
  evidence: EvidenceItem[],
  contextTurns: ContextTurn[],
) {
  const byId = new Map(contextTurns.map((turn) => [turn.id, turn]));

  for (const item of evidence) {
    const source = byId.get(item.turnId);
    if (!source) {
      throw new Error(
        `Evidence references turn ${item.turnId}, which was not in model context.`,
      );
    }

    if (source.role !== "learner") {
      throw new Error("Mastery evidence must be grounded in a learner turn.");
    }

    if (item.quote) {
      const quote = normalizeWhitespace(item.quote);
      const content = normalizeWhitespace(source.content);
      if (!quote || !content.includes(quote)) {
        throw new Error(
          `Evidence quote does not match learner turn ${item.turnId}.`,
        );
      }
    }
  }
}

export function mergeEvidenceLedger(
  existing: EvidenceLedger,
  incoming: EvidenceItem[],
): EvidenceLedger {
  const merged: EvidenceLedger = {
    coreIdea: [...(existing.coreIdea ?? EMPTY_LEDGER.coreIdea)],
    mechanism: [...(existing.mechanism ?? EMPTY_LEDGER.mechanism)],
    misconceptionRepair: [
      ...(existing.misconceptionRepair ?? EMPTY_LEDGER.misconceptionRepair),
    ],
    transfer: [...(existing.transfer ?? EMPTY_LEDGER.transfer)],
  };

  for (const item of incoming) {
    const bucket = merged[item.dimension];
    const duplicate = bucket.some(
      (old) =>
        old.turnId === item.turnId &&
        old.type === item.type &&
        old.summary === item.summary,
    );
    if (!duplicate) bucket.push(item);
  }

  return merged;
}

export function ledgerHasType(
  ledger: EvidenceLedger,
  type: EvidenceItem["type"],
) {
  return Object.values(ledger).some((items) =>
    items.some((item) => item.type === type),
  );
}

export function ledgerHasEvidenceForEveryDimension(ledger: EvidenceLedger) {
  return DIMENSIONS.every((dimension) => ledger[dimension].length > 0);
}
