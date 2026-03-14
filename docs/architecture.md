# clanka Architecture

## Core shape

`clanka` is a layered Effect runtime for driving agent workflows through
executable scripts and typed tool services.

```text
Prompt
  -> Agent
  -> AgentExecutor
  -> AgentTools
  -> Output events
  -> CLI / TUI / future renderers
```

## Modules

### `src/Agent.ts`

- manages prompt history and system instructions
- handles output interleaving across agents and subagents
- supports steering while a run is active
- converts model text output into executable scripts when the model supports
  no-tool mode

### `src/AgentExecutor.ts`

- owns script execution
- creates a VM sandbox with the tool handlers wired in
- exposes both local and RPC-backed execution layers
- is the main future seam for remote runners and sandboxes

### `src/AgentTools.ts`

- filesystem: read, write, rename, remove, mkdir, ls, glob, rg
- execution: bash, gh
- orchestration: delegate, search, taskComplete
- internet: webSearch, fetchMarkdown
- editing: applyPatch

### `src/OutputFormatter.ts`

- converts typed output events into a linear terminal stream
- includes a `Muxer` for rendering multiple agents into one output stream

### `src/Tui.ts`

- renders the same event protocol in a full-screen terminal UI
- keeps state in pure data structures
- uses `effect/Terminal` for input and lifecycle

### Provider layers

- `src/Codex.ts` / `src/CodexAuth.ts`
- `src/Copilot.ts` / `src/CopilotAuth.ts`
- `src/MockModel.ts`

The provider layers are intentionally separate from the core agent/executor
loop. The runtime should remain testable with the mock model alone.

## Output protocol

The runtime emits strongly typed events:

- `AgentStart`
- `ReasoningStart` / `ReasoningDelta` / `ReasoningEnd`
- `ScriptStart` / `ScriptDelta` / `ScriptEnd`
- `ScriptOutput`
- `SubagentStart`
- `SubagentPart`
- `SubagentComplete`

This protocol is the stable presentation boundary. Renderers should consume it
rather than deriving state from log strings.

## Known constraints

- live provider auth is manual and not part of CI
- Exa MCP connectivity is lazy-initialized and remains a runtime dependency
- the current RPC executor boundary exists, but the operator UX is still local
  first
- TypeBuilder remains supported but is not the primary story of the fork
