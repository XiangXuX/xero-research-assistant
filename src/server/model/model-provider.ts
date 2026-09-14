export interface ModelRequest {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ModelCompletion {
  rawText: string;
  provider: string;
  model: string;
  usage?: ModelUsage;
}

export interface ModelProvider {
  readonly provider: string;
  readonly model: string;
  complete(request: ModelRequest): Promise<ModelCompletion>;
}

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

export class ModelProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelProviderError";
  }
}
