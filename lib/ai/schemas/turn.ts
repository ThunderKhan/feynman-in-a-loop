import { z } from "zod";

export const DimensionStateSchema = z.enum([
  "untested",
  "weak",
  "partial",
  "mastered",
]);

export const DimensionSchema = z.enum([
  "coreIdea",
  "mechanism",
  "misconceptionRepair",
  "transfer",
]);

export const EvidenceTypeSchema = z.enum([
  "explanation",
  "probe",
  "correction",
  "transfer_answer",
]);

export const StageSchema = z.enum([
  "orient",
  "explain",
  "diagnose",
  "repair",
  "transfer",
  "assess",
  "completed",
]);

export const StudentStateSchema = z.enum([
  "ready",
  "listening",
  "thinking",
  "confused",
  "corrected",
  "testing",
  "understanding",
  "mastered",
  "error",
]);

export const EvidenceItemSchema = z
  .object({
    dimension: DimensionSchema,
    turnId: z.string().uuid(),
    type: EvidenceTypeSchema,
    summary: z.string().trim().min(1).max(280),
    quote: z.string().trim().min(1).max(160).nullable(),
  })
  .strict();

export const TurnEvaluationSchema = z
  .object({
    stage: StageSchema,
    studentState: StudentStateSchema,
    dimensions: z
      .object({
        coreIdea: DimensionStateSchema,
        mechanism: DimensionStateSchema,
        misconceptionRepair: DimensionStateSchema,
        transfer: DimensionStateSchema,
      })
      .strict(),
    targetGap: z.string().trim().min(1).max(160).nullable(),
    nextAction: z.enum([
      "clarify",
      "probe",
      "misconception",
      "transfer",
      "assess",
      "complete",
    ]),
    shouldComplete: z.boolean(),
    evidence: z.array(EvidenceItemSchema).max(8),
  })
  .strict();

export const TurnOutputSchema = z
  .object({
    evaluation: TurnEvaluationSchema,
    student: z
      .object({
        state: StudentStateSchema,
        message: z.string().trim().min(1).max(280),
      })
      .strict(),
  })
  .strict();

export type TurnOutputParsed = z.infer<typeof TurnOutputSchema>;

/**
 * Hand-authored JSON Schema matching TurnOutputSchema.
 *
 * Groq strict mode requires every property to be required and every object to
 * set additionalProperties=false. Nullable fields stay required and use a
 * union with null.
 */
export const TURN_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["evaluation", "student"],
  properties: {
    evaluation: {
      type: "object",
      additionalProperties: false,
      required: [
        "stage",
        "studentState",
        "dimensions",
        "targetGap",
        "nextAction",
        "shouldComplete",
        "evidence",
      ],
      properties: {
        stage: {
          type: "string",
          enum: [
            "orient",
            "explain",
            "diagnose",
            "repair",
            "transfer",
            "assess",
            "completed",
          ],
        },
        studentState: {
          type: "string",
          enum: [
            "ready",
            "listening",
            "thinking",
            "confused",
            "corrected",
            "testing",
            "understanding",
            "mastered",
            "error",
          ],
        },
        dimensions: {
          type: "object",
          additionalProperties: false,
          required: [
            "coreIdea",
            "mechanism",
            "misconceptionRepair",
            "transfer",
          ],
          properties: {
            coreIdea: {
              type: "string",
              enum: ["untested", "weak", "partial", "mastered"],
            },
            mechanism: {
              type: "string",
              enum: ["untested", "weak", "partial", "mastered"],
            },
            misconceptionRepair: {
              type: "string",
              enum: ["untested", "weak", "partial", "mastered"],
            },
            transfer: {
              type: "string",
              enum: ["untested", "weak", "partial", "mastered"],
            },
          },
        },
        targetGap: {
          anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }],
        },
        nextAction: {
          type: "string",
          enum: [
            "clarify",
            "probe",
            "misconception",
            "transfer",
            "assess",
            "complete",
          ],
        },
        shouldComplete: { type: "boolean" },
        evidence: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["dimension", "turnId", "type", "summary", "quote"],
            properties: {
              dimension: {
                type: "string",
                enum: [
                  "coreIdea",
                  "mechanism",
                  "misconceptionRepair",
                  "transfer",
                ],
              },
              turnId: { type: "string" },
              type: {
                type: "string",
                enum: [
                  "explanation",
                  "probe",
                  "correction",
                  "transfer_answer",
                ],
              },
              summary: { type: "string", maxLength: 280 },
              quote: {
                anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }],
              },
            },
          },
        },
      },
    },
    student: {
      type: "object",
      additionalProperties: false,
      required: ["state", "message"],
      properties: {
        state: {
          type: "string",
          enum: [
            "ready",
            "listening",
            "thinking",
            "confused",
            "corrected",
            "testing",
            "understanding",
            "mastered",
            "error",
          ],
        },
        message: { type: "string", maxLength: 280 },
      },
    },
  },
} as const;
