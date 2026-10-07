import type { AIProvider } from "@/lib/ai/provider";
import { AIProviderError } from "@/lib/ai/provider";
import { buildTurnUserMessage, TURN_SYSTEM_PROMPT } from "@/lib/ai/prompts/turn";
import { TURN_OUTPUT_JSON_SCHEMA } from "@/lib/ai/schemas/turn";
import type { TurnInput, TurnOutput } from "@/lib/ai/types";

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
  error?: {
    message?: string;
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
          messages: [
            { role: "system", content: TURN_SYSTEM_PROMPT },
            { role: "user", content: buildTurnUserMessage(input) },
          ],
          reasoning_effort: "low",
          max_completion_tokens: 1400,
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
      throw new AIProviderError(
        body.error?.message ?? `Groq returned HTTP ${response.status}`,
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
