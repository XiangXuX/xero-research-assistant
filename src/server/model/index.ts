import { appConfig } from "../config.js";
import { GeminiModelProvider } from "./gemini-provider.js";
import type { ModelProvider } from "./model-provider.js";
import { ModelConfigurationError } from "./model-provider.js";

export function createConfiguredModelProvider(): ModelProvider {
  if (appConfig.model.provider !== "gemini") {
    throw new ModelConfigurationError(
      `Unsupported MODEL_PROVIDER: ${appConfig.model.provider}`,
    );
  }

  return new GeminiModelProvider({
    apiKey: appConfig.model.apiKey,
    model: appConfig.model.name,
    timeoutMs: appConfig.model.timeoutMs,
  });
}
