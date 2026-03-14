import { describe, expect, it } from "vitest"
import * as Prompt from "effect/unstable/ai/Prompt"
import {
  AgentStart,
  ScriptDelta,
  ScriptEnd,
  ScriptOutput,
  ScriptStart,
} from "./Agent.ts"
import { makeState, render, update } from "./Tui.ts"

describe("Tui", () => {
  it("renders the timeline and details panels from typed agent events", () => {
    let state = makeState({
      title: "test tui",
      cwd: "/tmp/demo",
    })

    state = update(state, {
      _tag: "System",
      message: "booted",
    })
    state = update(state, {
      _tag: "Output",
      runId: 1,
      output: new AgentStart({
        id: 1,
        prompt: Prompt.make("inspect the repo"),
        provider: "mock",
        model: "scripted-agent",
      }),
    })
    state = update(state, {
      _tag: "Output",
      runId: 1,
      output: new ScriptStart(),
    })
    state = update(state, {
      _tag: "Output",
      runId: 1,
      output: new ScriptDelta({
        delta: 'console.log("hello from script")',
      }),
    })
    state = update(state, {
      _tag: "Output",
      runId: 1,
      output: new ScriptEnd(),
    })
    state = update(state, {
      _tag: "Output",
      runId: 1,
      output: new ScriptOutput({
        output: "hello from script",
      }),
    })
    state = update(state, {
      _tag: "RunComplete",
      runId: 1,
      summary: "Completed a mock run.",
    })

    const frame = render(state, {
      columns: 100,
      rows: 24,
    })

    expect(frame).toContain("Activity")
    expect(frame).toContain("Agent")
    expect(frame).toContain("Agent #1 starting")
    expect(frame).toContain("OUTPUT Script output")
    expect(frame).toContain("Completed a mock run.")
  })
})
