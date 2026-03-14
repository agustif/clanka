/**
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { pipe } from "effect/Function"
import * as LanguageModel from "effect/unstable/ai/LanguageModel"
import * as Model from "effect/unstable/ai/Model"
import type * as Prompt from "effect/unstable/ai/Prompt"
import * as Response from "effect/unstable/ai/Response"
import * as Stream from "effect/Stream"
import { AgentModelConfig } from "./Agent.ts"

/**
 * @since 1.0.0
 * @category Models
 */
export interface ScriptPlan {
  readonly reasoning: string
  readonly script: string
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface MockModelOptions {
  readonly modelName?: string | undefined
  readonly plan?: ((prompt: Prompt.Prompt) => ScriptPlan) | undefined
}

const defaultPlan = (prompt: Prompt.Prompt): ScriptPlan => {
  const input = promptToString(prompt)
  const trimmed = input.trim()
  const task = trimmed.length === 0 ? "inspect the current workspace" : trimmed
  const escapedPrompt = JSON.stringify(task)
  const inspectPackage = `const packageJson = await readFile({ path: "package.json" })
if (packageJson !== null) {
  const parsed = JSON.parse(packageJson)
  console.log(\`Package: \${parsed.name}@\${parsed.version}\`)
}`

  if (/\b(list|files|tree|workspace)\b/i.test(task)) {
    return {
      reasoning:
        "I should inspect the working directory with the built-in filesystem tools and then summarize what is present.",
      script: `${inspectPackage}
const entries = await ls(".")
console.log(entries.join("\\n"))
await taskComplete(\`Listed \${entries.length} top-level entries for ${escapedPrompt}.\`)`,
    }
  }

  return {
    reasoning:
      "I should demonstrate the local execution loop by reading package metadata and summarizing the current workspace state.",
    script: `${inspectPackage}
const entries = await ls(".")
console.log(\`Top-level entries: \${entries.join(", ")}\`)
await taskComplete(\`Completed an offline mock run for ${escapedPrompt}.\`)`,
  }
}

const makeUsage = () =>
  new Response.Usage({
    inputTokens: {
      uncached: 16,
      total: 16,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 48,
      text: 32,
      reasoning: 16,
    },
  })

const chunkText = (text: string, width = 80) => {
  if (text.length === 0) {
    return [""]
  }

  const chunks = [] as Array<string>
  for (let i = 0; i < text.length; i += width) {
    chunks.push(text.slice(i, i + width))
  }
  return chunks
}

const toStreamParts = (plan: ScriptPlan) => {
  const parts = [] as Array<Response.StreamPartEncoded>
  parts.push(Response.makePart("reasoning-start", { id: "reasoning-1" }))
  for (const delta of chunkText(plan.reasoning, 64)) {
    parts.push(
      Response.makePart("reasoning-delta", {
        id: "reasoning-1",
        delta,
      }),
    )
  }
  parts.push(Response.makePart("reasoning-end", { id: "reasoning-1" }))
  parts.push(Response.makePart("text-start", { id: "script-1" }))
  for (const delta of chunkText(plan.script, 96)) {
    parts.push(
      Response.makePart("text-delta", {
        id: "script-1",
        delta,
      }),
    )
  }
  parts.push(Response.makePart("text-end", { id: "script-1" }))
  parts.push(
    Response.makePart("finish", {
      reason: "stop",
      usage: makeUsage(),
      response: undefined,
    }),
  )
  return parts
}

const toResponseParts = (plan: ScriptPlan) =>
  [
    Response.makePart("reasoning", { text: plan.reasoning }),
    Response.makePart("text", { text: plan.script }),
    Response.makePart("finish", {
      reason: "stop",
      usage: makeUsage(),
      response: undefined,
    }),
  ] satisfies Array<Response.PartEncoded>

const promptToString = (prompt: Prompt.Prompt): string => {
  const chunks = [] as Array<string>
  for (const message of prompt.content) {
    if (message.role !== "user") continue
    for (const part of message.content) {
      if (part.type === "text") {
        chunks.push(part.text)
      }
    }
  }
  return chunks.join("\n")
}

/**
 * Create a deterministic offline model for demos, smoke tests, and TUI work.
 *
 * The model always emits reasoning plus executable script text, so it exercises
 * the same `Agent -> AgentExecutor -> AgentTools` flow as Codex-backed runs
 * without requiring network auth.
 *
 * @since 1.0.0
 * @category Layers
 */
export const model = (options?: MockModelOptions) =>
  Model.make(
    "mock",
    options?.modelName ?? "scripted-agent",
    Layer.merge(
      Layer.effect(
        LanguageModel.LanguageModel,
        LanguageModel.make({
          generateText: ({ prompt }) =>
            Effect.sync(() =>
              toResponseParts((options?.plan ?? defaultPlan)(prompt)),
            ),
          streamText: ({ prompt }) =>
            Stream.fromIterable(
              toStreamParts((options?.plan ?? defaultPlan)(prompt)),
            ),
        }),
      ),
      AgentModelConfig.layer({
        supportsAssistantPrefill: true,
        supportsNoTools: true,
      }),
    ),
  )

/**
 * @since 1.0.0
 * @category Models
 */
export const defaultPromptFromArgs = (args: ReadonlyArray<string>) =>
  pipe(
    args.join(" ").trim(),
    (prompt) => (prompt.length === 0 ? Option.none<string>() : Option.some(prompt)),
  )
