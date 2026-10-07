import type { AIProvider } from "../provider";
import { AIProviderError } from "../errors";
import { buildTurnUserMessage, TURN_SYSTEM_PROMPT } from "../prompts/turn";
import { TURN_OUTPUT_JSON_SCHEMA } from "../schemas/turn";
import type { TurnInput, TurnOutput } from "../types";

type OllamaResponse = {
  message?: {
    content?: string;
  };
  error?: string;
};

export class OllamaProvider implements AIProvider {
  async completeTurn(input: TurnInput): Promise<TurnOutput> {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    const model = process.env.OLLAMA_MODEL ?? "qwen3:0.6b";

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: TURN_OUTPUT_JSON_SCHEMA,
          messages: [
            { role: "system", content: TURN_SYSTEM_PROMPT },
            { role: "user", content: buildTurnUserMessage(input) },
          ],
          options: {
            temperature: 0.2,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new AIProviderError(
        error instanceof Error ? error.message : "Ollama request failed.",
        "provider_unavailable",
      );
    }

    const body = (await response.json().catch(() => ({}))) as OllamaResponse;

    if (!response.ok) {
      throw new AIProviderError(
        body.error ?? `Ollama returned HTTP ${response.status}`,
        "provider_rejected",
        response.status,
      );
    }

    if (!body.message?.content) {
      throw new AIProviderError(
        "Ollama returned no content.",
        "invalid_provider_response",
      );
    }

    try {
      return JSON.parse(body.message.content) as TurnOutput;
    } catch {
      throw new AIProviderError(
        "Ollama returned malformed JSON.",
        "invalid_provider_response",
      );
    }
  }
}
