/**
 * @since 1.0.0
 */
import { OpenAiClient } from "@effect/ai-openai-compat"
import { Layer } from "effect"
import { API_URL, GithubCopilotAuth } from "./GithubCopilotAuth.ts"

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = OpenAiClient.layer({
  apiUrl: API_URL,
}).pipe(Layer.provide(GithubCopilotAuth.layerClient))
