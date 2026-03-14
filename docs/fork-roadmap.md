# Fork Roadmap

## Immediate

- Bun-first scripts, examples, and CI
- full README and architecture docs
- offline mock model for demos and tests
- Effect-native TUI shell over the existing event stream
- integration coverage for the local agent/runtime path

## Near term

- RPC-backed executor integration tests
- richer TUI panes for tool calls, run history, and auth state
- replayable session logs
- remote runner control plane built on `AgentExecutor.layerRpcServer`

## Later

- persistent workspace/session state
- multiple concurrent runs in the TUI
- policy-aware tool gating
- remote executor pools and queueing

## Explicitly not reviving yet

- the abandoned DuckDuckGo search branch
- any re-coupling of `Agent` and `AgentExecutor`
- a TypeBuilder extraction before the runtime surface is fully documented and
  tested
