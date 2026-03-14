/**
 * @since 1.0.0
 */
import type { SessionEvent } from "./Session.ts"

/**
 * @since 1.0.0
 * @category Models
 */
export interface ConversationTurn {
  readonly id: string
  readonly runId: number
  readonly role: "user" | "agent" | "auth" | "system" | "result"
  readonly title: string
  readonly summary: string
  readonly evidence: ReadonlyArray<string>
}

type EventPayload =
  | {
      readonly _tag: "AgentStart"
      readonly prompt: string
      readonly provider: string
      readonly model: string
    }
  | {
      readonly _tag: "ReasoningDelta"
      readonly delta: string
    }
  | {
      readonly _tag: "ScriptDelta"
      readonly delta: string
    }
  | {
      readonly _tag: "ScriptOutput"
      readonly output: string
    }
  | {
      readonly _tag: string
    }

const isAgentStart = (
  payload: EventPayload,
): payload is Extract<EventPayload, { readonly _tag: "AgentStart" }> =>
  payload._tag === "AgentStart"

const isReasoningDelta = (
  payload: EventPayload,
): payload is Extract<EventPayload, { readonly _tag: "ReasoningDelta" }> =>
  payload._tag === "ReasoningDelta"

const isScriptDelta = (
  payload: EventPayload,
): payload is Extract<EventPayload, { readonly _tag: "ScriptDelta" }> =>
  payload._tag === "ScriptDelta"

const isScriptOutput = (
  payload: EventPayload,
): payload is Extract<EventPayload, { readonly _tag: "ScriptOutput" }> =>
  payload._tag === "ScriptOutput"

const takeSummary = (text: string, max = 160) => {
  const single = text.replaceAll(/\s+/g, " ").trim()
  if (single.length <= max) return single
  return `${single.slice(0, max - 1)}…`
}

/**
 * Build higher-level conversational turns from raw session events.
 *
 * This intentionally keeps the first implementation simple: it groups known
 * event shapes into user, agent, auth, and result turns without mutating or
 * discarding the underlying append-only event history.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const aggregateTurns = (
  events: ReadonlyArray<SessionEvent<unknown>>,
): ReadonlyArray<ConversationTurn> => {
  const turns = [] as Array<ConversationTurn>

  for (const event of events) {
    switch (event.event) {
      case "Output": {
        const payload = event.payload as EventPayload | undefined
        if (payload === undefined) break
        if (isAgentStart(payload)) {
          turns.push({
            id: event.entryId,
            runId: event.summary.activeRunId,
            role: "user",
            title: "Prompt",
            summary: takeSummary(payload.prompt),
            evidence: [],
          })
          turns.push({
            id: `${event.entryId}-agent`,
            runId: event.summary.activeRunId,
            role: "agent",
            title: "Clanka started",
            summary: `${payload.provider}/${payload.model}`,
            evidence: [],
          })
        } else if (isReasoningDelta(payload) && payload.delta.trim().length > 0) {
          turns.push({
            id: event.entryId,
            runId: event.summary.activeRunId,
            role: "agent",
            title: "Reasoning",
            summary: takeSummary(payload.delta),
            evidence: [],
          })
        } else if (isScriptDelta(payload) && payload.delta.trim().length > 0) {
          turns.push({
            id: event.entryId,
            runId: event.summary.activeRunId,
            role: "agent",
            title: "Action",
            summary: takeSummary(payload.delta),
            evidence: [],
          })
        } else if (isScriptOutput(payload) && payload.output.trim().length > 0) {
          turns.push({
            id: event.entryId,
            runId: event.summary.activeRunId,
            role: "result",
            title: "Evidence",
            summary: takeSummary(payload.output),
            evidence: [payload.output],
          })
        }
        break
      }
      case "AuthPrompt": {
        const payload = event.payload as
          | { readonly provider: string; readonly url: string; readonly code: string }
          | undefined
        if (payload === undefined) break
        turns.push({
          id: event.entryId,
          runId: event.summary.activeRunId,
          role: "auth",
          title: "Login required",
          summary: `${payload.provider}: ${payload.code}`,
          evidence: [payload.url],
        })
        break
      }
      case "RunComplete": {
        const payload = event.payload as
          | { readonly summary: string; readonly runId: number }
          | undefined
        if (payload === undefined) break
        turns.push({
          id: event.entryId,
          runId: payload.runId,
          role: "result",
          title: "Completed",
          summary: takeSummary(payload.summary),
          evidence: [payload.summary],
        })
        break
      }
      case "RunError": {
        const payload = event.payload as
          | { readonly message: string; readonly runId: number }
          | undefined
        if (payload === undefined) break
        turns.push({
          id: event.entryId,
          runId: payload.runId,
          role: "system",
          title: "Run error",
          summary: takeSummary(payload.message),
          evidence: [payload.message],
        })
        break
      }
      case "System": {
        const payload = event.payload as
          | { readonly message: string }
          | undefined
        if (payload === undefined) break
        turns.push({
          id: event.entryId,
          runId: event.summary.activeRunId,
          role: "system",
          title: "System",
          summary: takeSummary(payload.message),
          evidence: [],
        })
        break
      }
    }
  }

  return turns
}
