/**
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpClient from "effect/unstable/http/HttpClient"

/**
 * A no-network HttpClient for deterministic smoke runs.
 *
 * @since 1.0.0
 * @category Layers
 */
export const layer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.die(
      new Error(
        `Mock mode does not allow outbound HTTP: ${request.method} ${request.url}`,
      ),
    ),
  ),
)
