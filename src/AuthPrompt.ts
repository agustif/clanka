/**
 * @since 1.0.0
 */
import type * as Effect from "effect/Effect"
import * as ServiceMap from "effect/ServiceMap"

/**
 * @since 1.0.0
 * @category Models
 */
export interface AuthPromptPayload {
  readonly provider: "codex" | "copilot"
  readonly url: string
  readonly code: string
}

/**
 * Optional UI/auth bridge for surfacing device-login prompts.
 *
 * @since 1.0.0
 * @category Services
 */
export class AuthPrompt extends ServiceMap.Service<
  AuthPrompt,
  (payload: AuthPromptPayload) => Effect.Effect<void>
>()("clanka/AuthPrompt") {}
