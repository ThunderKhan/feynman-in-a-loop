import type { TurnInput, TurnOutput } from "./types.ts";
import { GroqProvider } from "./providers/groq.ts";
import { OllamaProvider } from "./providers/ollama.ts";

import { AIProviderError } from "./errors.ts";

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
