import type {
  ModelCompletion,
  ModelProvider,
  ModelRequest,
} from "./model-provider.js";
import { ModelConfigurationError, ModelProviderError } from "./model-provider.js";

const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
}

interface GeminiResponse {
  status?: string;
  model?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_tokens?: number;
  };
}

function extractOutputText(body: GeminiResponse): string {
  return (body.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => content.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}

export class GeminiModelProvider implements ModelProvider {
  readonly provider = "gemini";
  readonly model: string;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async complete(request: ModelRequest): Promise<ModelCompletion> {
    if (!this.apiKey) {
      throw new ModelConfigurationError(
        "Gemini is not configured. Add GEMINI_API_KEY to the local .env file.",
      );
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(GEMINI_INTERACTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: this.model,
          store: false,
          system_instruction: request.systemInstruction,
          input: request.prompt,
          generation_config: {
            max_output_tokens: 800,
            thinking_level: "minimal",
            thinking_summaries: "none",
          },
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: request.responseSchema,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown network error";
      throw new ModelProviderError(`Gemini request failed before completion: ${detail}`);
    }

    if (!response.ok) {
      throw new ModelProviderError(
        `Gemini returned HTTP ${response.status} ${response.statusText}`,
      );
    }

    let body: GeminiResponse;
    try {
      body = (await response.json()) as GeminiResponse;
    } catch {
      throw new ModelProviderError("Gemini returned a response that was not valid JSON.");
    }

    const rawText = extractOutputText(body);
    if (body.status !== "completed" || !rawText) {
      throw new ModelProviderError("Gemini did not return a completed text response.");
    }

    return {
      rawText,
      provider: this.provider,
      model: body.model || this.model,
      usage: {
        inputTokens: body.usage?.total_input_tokens,
        outputTokens: body.usage?.total_output_tokens,
        totalTokens: body.usage?.total_tokens,
      },
    };
  }
}
