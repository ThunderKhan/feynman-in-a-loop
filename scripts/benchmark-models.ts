import { config as loadEnv } from "dotenv";
import { GroqProvider } from "../lib/ai/providers/groq.ts";
import {
  TurnValidationError,
  validateTurnOutput,
} from "../lib/ai/validate.ts";
import { isRetryableStructuredOutputError } from "../lib/ai/errors.ts";
import { derivePriorityRule } from "../lib/ai/priority.ts";
import { benchmarkCases } from "../tests/corpus/benchmark-cases.ts";

loadEnv({ path: ".env.local" });

if (!process.env.GROQ_API_KEY) {
  throw new Error(
    "GROQ_API_KEY is missing. Add it to .env.local before running the benchmark.",
  );
}

const ALL_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] as const;
type ModelName = (typeof ALL_MODELS)[number];

function arg(name: string) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const requestedModel = arg("model");
const requestedCase = arg("case");
const repeat = Number.parseInt(arg("repeat") ?? "1", 10);

if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5) {
  throw new Error("--repeat must be an integer from 1 to 5.");
}

if (
  requestedModel &&
  !ALL_MODELS.includes(requestedModel as ModelName)
) {
  throw new Error(
    `Unknown model "${requestedModel}". Use one of: ${ALL_MODELS.join(", ")}`,
  );
}

const models: readonly ModelName[] = requestedModel
  ? [requestedModel as ModelName]
  : ALL_MODELS;

const selectedCasesBase = requestedCase
  ? benchmarkCases.filter((item) => item.id === requestedCase)
  : benchmarkCases;

const selectedCases = Array.from({ length: repeat }, () => selectedCasesBase).flat();

if (requestedCase && selectedCasesBase.length === 0) {
  throw new Error(
    `Unknown benchmark case "${requestedCase}". Use one of: ${benchmarkCases
      .map((item) => item.id)
      .join(", ")}`,
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CaseResult = {
  caseId: string;
  valid: boolean;
  checks: Record<string, boolean>;
  observed: {
    stage: string;
    targetGap: string | null;
    nextAction: string;
    studentMessage: string;
  } | null;
  error: string | null;
  attempts: number;
  firstFailure: string | null;
  latencyMs: number;
};

const report: Record<string, { score: number; total: number; cases: CaseResult[] }> = {};

for (const model of models) {
  process.env.GROQ_MODEL = model;
  const provider = new GroqProvider();
  const caseResults: CaseResult[] = [];

  for (let index = 0; index < selectedCases.length; index++) {
    const benchmark = selectedCases[index];
    const started = performance.now();

    let attempts = 0;
    let firstFailure: string | null = null;
    const priorityRule = derivePriorityRule({
      topic: benchmark.input.topic,
      currentStage: benchmark.input.currentStage,
      learnerContent: benchmark.input.learnerContent,
    });
    const validationContext = {
      ...benchmark.validation,
      priorityRule,
    };

    try {
      let validated: ReturnType<typeof validateTurnOutput> | null = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        attempts = attempt;
        const input =
          attempt === 1
            ? { ...benchmark.input, priorityRule }
            : {
                ...benchmark.input,
                priorityRule,
                mode: "retry" as const,
                retryReason: firstFailure,
              };

        try {
          const raw = await provider.completeTurn(input);
          validated = validateTurnOutput(raw, validationContext);
          break;
        } catch (error) {
          const retryable =
            attempt === 1 &&
            (isRetryableStructuredOutputError(error) ||
              error instanceof TurnValidationError);

          if (!retryable) throw error;

          firstFailure =
            error instanceof Error ? error.message : String(error);

          // Match the production policy: one extra model invocation is
          // permitted for a failed structured/semantic result, and that call
          // would consume quota. Pace it here so the benchmark itself does not
          // trip the free-plan TPM limit.
          await delay(15_000);
        }
      }

      if (!validated) {
        throw new Error("Benchmark exhausted its one allowed retry.");
      }

      const checks = {
        schemaAndBoundary: true,
        ...benchmark.score(validated.output),
      };

      caseResults.push({
        caseId:
          repeat === 1
            ? benchmark.id
            : `${benchmark.id}#${Math.floor(index / selectedCasesBase.length) + 1}`,
        valid: Object.values(checks).every(Boolean),
        checks,
        observed: {
          stage: validated.output.evaluation.stage,
          targetGap: validated.output.evaluation.targetGap,
          nextAction: validated.output.evaluation.nextAction,
          studentMessage: validated.output.student.message,
        },
        error: null,
        attempts,
        firstFailure,
        latencyMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      const checks = Object.fromEntries(
        benchmark.criteria.map((criterion) => [criterion, false]),
      );

      caseResults.push({
        caseId:
          repeat === 1
            ? benchmark.id
            : `${benchmark.id}#${Math.floor(index / selectedCasesBase.length) + 1}`,
        valid: false,
        checks,
        observed: null,
        error: error instanceof Error ? error.message : String(error),
        attempts,
        firstFailure,
        latencyMs: Math.round(performance.now() - started),
      });
    }

    // Free-plan GPT-OSS is currently 8K TPM. Keep the same small corpus for
    // both models and deliberately pace requests so the benchmark itself does
    // not become a rate-limit test.
    if (index < selectedCases.length - 1 || model !== models.at(-1)) {
      await delay(15_000);
    }
  }

  const checks = caseResults.flatMap((result) => Object.values(result.checks));
  report[model] = {
    score: checks.filter(Boolean).length,
    total: checks.length,
    cases: caseResults,
  };
}

console.log(JSON.stringify(report, null, 2));

if (models.length === 2 && !requestedCase) {
  const twenty = report["openai/gpt-oss-20b"];
  const oneTwenty = report["openai/gpt-oss-120b"];

  if (twenty.score === twenty.total) {
    console.log(
      "\nRecommendation: openai/gpt-oss-20b passed every automatic check; prefer it for lower latency.",
    );
  } else if (oneTwenty.score === oneTwenty.total) {
    console.log(
      "\nRecommendation: openai/gpt-oss-120b passed every check while 20B did not.",
    );
  } else if (oneTwenty.score > twenty.score) {
    console.log(
      "\nRecommendation: 120B leads, but inspect the remaining failed criteria before locking it.",
    );
  } else {
    console.log(
      "\nRecommendation: neither model cleanly wins. Review failed cases before choosing.",
    );
  }
}
