import type { TurnInput, TurnOutput } from "@/lib/ai/types";
import { GroqProvider } from "@/lib/ai/providers/groq";
import { OllamaProvider } from "@/lib/ai/providers/ollama";

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "provider_unavailable"
      | "provider_rejected"
      | "invalid_provider_response"
      | "provider_not_configured",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AIProvider {
  completeTurn(input: TurnInput): Promise<TurnOutput>;
}

export function getAIProvider(): AIProvider {
  const selected = (process.env.AI_PROVIDER ?? "groq").toLowerCase();

  if (selected === "groq") return new GroqProvider();
  if (selected === "ollama") return new OllamaProvider();

  throw new AIProviderError(
    `Unsupported AI_PROVIDER: ${selected}`,
    "provider_not_configured",
  );
}
