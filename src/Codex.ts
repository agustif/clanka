/**
 * @since 1.0.0
 */
import { OpenAiClient } from "@effect/ai-openai"
import { Layer } from "effect"
import { CodexAuth } from "./CodexAuth.ts"

/**
 * @since 1.0.0
 * @category Layers
 */
export const CodexAiClient = OpenAiClient.layer({
  apiUrl: "https://chatgpt.com/backend-api/codex",
}).pipe(Layer.provide(CodexAuth.layerClient))
