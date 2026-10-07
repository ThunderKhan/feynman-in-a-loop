import { config as loadEnv } from "dotenv";
import { GroqProvider } from "../lib/ai/providers/groq.ts";
import { validateTurnOutput } from "../lib/ai/validate.ts";
import { benchmarkCases } from "../tests/corpus/benchmark-cases.ts";

loadEnv({ path: ".env.local" });

if (!process.env.GROQ_API_KEY) {
  throw new Error(
    "GROQ_API_KEY is missing. Add it to .env.local before running the benchmark.",
  );
}

const models = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] as const;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CaseResult = {
  caseId: string;
  valid: boolean;
  checks: Record<string, boolean>;
  error: string | null;
  latencyMs: number;
};

const report: Record<string, { score: number; total: number; cases: CaseResult[] }> = {};

for (const model of models) {
  process.env.GROQ_MODEL = model;
  const provider = new GroqProvider();
  const caseResults: CaseResult[] = [];

  for (let index = 0; index < benchmarkCases.length; index++) {
    const benchmark = benchmarkCases[index];
    const started = performance.now();

    try {
      const raw = await provider.completeTurn(benchmark.input);
      const validated = validateTurnOutput(raw, benchmark.validation);
      const checks = {
        schemaAndBoundary: true,
        ...benchmark.score(validated.output),
      };

      caseResults.push({
        caseId: benchmark.id,
        valid: Object.values(checks).every(Boolean),
        checks,
        error: null,
        latencyMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      caseResults.push({
        caseId: benchmark.id,
        valid: false,
        checks: { schemaAndBoundary: false },
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Math.round(performance.now() - started),
      });
    }

    // Free-plan GPT-OSS is currently 8K TPM. Keep the same small corpus for
    // both models and deliberately pace requests so the benchmark itself does
    // not become a rate-limit test.
    if (index < benchmarkCases.length - 1 || model !== models.at(-1)) {
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

const twenty = report["openai/gpt-oss-20b"];
const oneTwenty = report["openai/gpt-oss-120b"];

if (twenty.score === twenty.total) {
  console.log("\nRecommendation: openai/gpt-oss-20b passed every automatic check; prefer it for lower latency.");
} else if (oneTwenty.score > twenty.score) {
  console.log("\nRecommendation: openai/gpt-oss-120b scored higher on this corpus.");
} else {
  console.log("\nRecommendation: neither model cleanly wins. Review failed cases before choosing.");
}
