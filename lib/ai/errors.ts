export class AIProviderError extends Error {
  readonly code:
    | "provider_unavailable"
    | "provider_rejected"
    | "invalid_provider_response"
    | "provider_not_configured";
  readonly status?: number;

  constructor(
    message: string,
    code:
      | "provider_unavailable"
      | "provider_rejected"
      | "invalid_provider_response"
      | "structured_output_failure"
      | "provider_not_configured",
    status?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.status = status;
  }
}

export function isRetryableStructuredOutputError(error: unknown) {
  return (
    error instanceof AIProviderError &&
    error.code === "structured_output_failure"
  );
}
