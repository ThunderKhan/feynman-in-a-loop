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
