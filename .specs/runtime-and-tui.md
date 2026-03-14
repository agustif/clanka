# Runtime And TUI Specification

## Summary

This fork treats `clanka` as an **agent-runtime library first** and a
`TypeBuilder` utility second.

The main runtime contract is:

```text
Prompt -> Agent -> AgentExecutor -> AgentTools -> Output events -> CLI/TUI
```

The TUI is not a separate system. It is a projection over the same typed output
stream already used by the CLI.

## Runtime Boundaries

### `Agent`

- owns prompt history
- streams typed output
- supports steering while a run is active
- can spawn subagents using the same output protocol

### `AgentExecutor`

- executes script text in a VM
- injects the typed tool surface
- supports both local and RPC-backed execution

### `AgentTools`

- local filesystem operations
- patch application
- shell / GitHub commands
- delegated search and subagent prompting
- web search and markdown fetch

### Presentation

- `OutputFormatter.pretty` is the linear log renderer
- `Tui.run` is the full-screen renderer
- both consume the same `Agent.Output` event stream

## Offline Mode

The fork includes a deterministic `MockModel` for:

- example CLI smoke tests
- TUI development
- runtime integration testing
- environments without Codex or Copilot auth

The mock model emits reasoning plus executable script text so the real
executor/tooling stack is exercised even in offline mode.

## TUI Goals

The TUI should be fully Effect-native in the following sense:

- input is read from `effect/Terminal`
- state is managed with `Ref` and pure update functions
- output is produced from typed runtime events
- fibers and scopes control run lifetime and cleanup
- terminal rendering is a pure projection of state

The first version intentionally optimizes for operator clarity over visual
complexity:

- prompt / steer input
- event timeline
- details pane
- status bar
- mock mode first

## Validation

- `bun run validate`
- `bun run example:cli -- "list the workspace"`
- `bun run example:tui -- "inspect the repo"`
