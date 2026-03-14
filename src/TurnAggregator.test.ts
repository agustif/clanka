import { describe, expect, it } from "vitest"
import { aggregateTurns } from "./TurnAggregator.ts"
import type { SessionEvent } from "./Session.ts"

describe("TurnAggregator", () => {
  it("groups raw session events into higher-level conversational turns", () => {
    const events = [
      {
        savedAt: "2026-03-14T00:00:00.000Z",
        sessionId: "s1",
        threadId: "main",
        entryId: "e1",
        event: "Output",
        summary: {
          status: "running",
          activeRunId: 1,
          entries: 1,
          selectedEntry: 0,
          activeProvider: "mock",
          activeModel: "scripted-agent",
          footer: "",
        },
        payload: {
          _tag: "AgentStart",
          prompt: "inspect the repo",
          provider: "mock",
          model: "scripted-agent",
        },
      },
      {
        savedAt: "2026-03-14T00:00:01.000Z",
        sessionId: "s1",
        threadId: "main",
        entryId: "e2",
        event: "Output",
        summary: {
          status: "running",
          activeRunId: 1,
          entries: 2,
          selectedEntry: 1,
          activeProvider: "mock",
          activeModel: "scripted-agent",
          footer: "",
        },
        payload: {
          _tag: "ScriptOutput",
          output: "readFile: src/Tui.ts",
        },
      },
      {
        savedAt: "2026-03-14T00:00:02.000Z",
        sessionId: "s1",
        threadId: "main",
        entryId: "e3",
        event: "RunComplete",
        summary: {
          status: "complete",
          activeRunId: 1,
          entries: 3,
          selectedEntry: 2,
          activeProvider: "mock",
          activeModel: "scripted-agent",
          footer: "",
        },
        payload: {
          runId: 1,
          summary: "Finished the inspection.",
        },
      },
    ] satisfies ReadonlyArray<SessionEvent<unknown>>

    const turns = aggregateTurns(events)

    expect(turns.length).toBe(4)
    expect(turns[0]?.role).toBe("user")
    expect(turns[0]?.summary).toContain("inspect the repo")
    expect(turns[1]?.role).toBe("agent")
    expect(turns[2]?.role).toBe("result")
    expect(turns[3]?.title).toBe("Completed")
  })
})
