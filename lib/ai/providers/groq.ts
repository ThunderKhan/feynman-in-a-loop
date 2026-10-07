import type { AIProvider } from "../provider.ts";
import { AIProviderError } from "../errors.ts";
import { buildTurnUserMessage } from "../prompts/turn.ts";
import { TURN_OUTPUT_JSON_SCHEMA } from "../schemas/turn.ts";
import type { TurnInput, TurnOutput } from "../types.ts";

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
  error?: {
    message?: string;
    failed_generation?: string;
  };
};

export class GroqProvider implements AIProvider {
  async completeTurn(input: TurnInput): Promise<TurnOutput> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new AIProviderError(
        "GROQ_API_KEY is not configured.",
        "provider_not_configured",
      );
    }

    const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
    let response: Response;

    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          // Groq's GPT-OSS reasoning guidance recommends putting all control
          // instructions in one user message rather than a separate system
          // prompt. Keeping the trusted rules and delimited learner data in a
          // single message also avoids the schema failures we saw in the first
          // 20B/120B benchmark.
          messages: [{ role: "user", content: buildTurnUserMessage(input) }],
          reasoning_effort: "medium",
          reasoning_format: "hidden",
          max_completion_tokens: 1800,
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "feynman_turn",
              strict: true,
              schema: TURN_OUTPUT_JSON_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      throw new AIProviderError(
        error instanceof Error ? error.message : "Groq request failed.",
        "provider_unavailable",
      );
    }

    const body = (await response.json().catch(() => ({}))) as GroqResponse;

    if (!response.ok) {
      const failedGeneration = body.error?.failed_generation
        ?.replace(/\s+/g, " ")
        .slice(0, 500);
      const detail = failedGeneration
        ? ` Failed generation: ${failedGeneration}`
        : "";

      throw new AIProviderError(
        (body.error?.message ?? `Groq returned HTTP ${response.status}`) + detail,
        "provider_rejected",
        response.status,
      );
    }

    const message = body.choices?.[0]?.message;
    if (message?.refusal) {
      throw new AIProviderError(
        "The model refused the structured turn.",
        "provider_rejected",
      );
    }

    if (!message?.content) {
      throw new AIProviderError(
        "Groq returned no structured content.",
        "invalid_provider_response",
      );
    }

    try {
      return JSON.parse(message.content) as TurnOutput;
    } catch {
      throw new AIProviderError(
        "Groq returned malformed JSON.",
        "invalid_provider_response",
      );
    }
  }
}
