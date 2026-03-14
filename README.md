# clanka

`clanka` is a Bun-first fork of an early Effect-native agent runtime. The
primary product surface is the agent/executor/tooling stack; `TypeBuilder`
remains in-package as a secondary utility for rendering Effect Schema types.

## What this fork is optimizing for

- A typed local-first agent runtime built on Effect services, layers, scopes,
  streams, and RPC boundaries.
- A real operator surface, including a full-screen TUI that consumes the native
  `Agent.Output` event stream.
- Production-first live provider runs, with mock mode kept only for test smoke
  paths.
- Documentation that explains the runtime, not just the auth helpers.

## Package surfaces

### Primary: agent runtime

- `Agent`: orchestrates prompts, history, streaming output, steering, and
  subagents.
- `AgentExecutor`: executes scripts locally or through an RPC boundary.
- `AgentTools`: typed tool surface for filesystem, shell, GitHub, patching,
  search, and web fetch.
- `Tui`: Effect-native terminal UI for driving and inspecting agent runs.
- `Codex` / `Copilot`: provider model layers and auth-aware clients.

### Secondary: schema utility

- `TypeBuilder`: render Effect Schema definitions into TypeScript type
  expressions.
- `ToolkitRenderer`: render the current tool surface into ambient TypeScript
  declarations for prompt injection and docs.

## Install

```bash
bun install
```

If your environment hits Bun tarball integrity failures for the TypeScript or
Linear dependencies, retry with:

```bash
bun install --no-verify
```

That is an environment workaround, not the intended steady-state contract.

## Validation

```bash
bun run lint
bun run typecheck
bun run test
bun run validate
```

Validation commands must not rewrite tracked files. Use `bun run lint:fix` only
when you explicitly want mutation.

## Quick start

### Full-screen TUI

```bash
bun run tui -- "inspect the repo"
```

Controls:

- `Enter`: start a run, or steer the currently running agent
- `Up` / `Down`: move through timeline entries
- `Esc`: clear the current input buffer
- `Ctrl-C`: quit

### Live provider runs

```bash
bun run example:cli -- "inspect the workspace"
```

Use `--copilot` to target the Copilot provider layer instead of Codex. Live
auth is manual by design and is documented in
[`docs/provider-auth.md`](./docs/provider-auth.md).

### Internal smoke paths

Mock mode is retained for deterministic tests and automated smoke coverage:

```bash
bun run smoke:cli -- "list the workspace"
bun run smoke:tui -- "list the workspace"
```

## Architecture at a glance

1. `Agent.send` streams typed runtime events such as `AgentStart`,
   `ReasoningDelta`, `ScriptDelta`, `ScriptOutput`, and `SubagentComplete`.
2. `AgentExecutor` receives executable script text and runs it inside a VM with
   the typed `AgentTools` surface.
3. `AgentTools` bridges local file I/O, patching, shell commands, web fetch,
   and search capabilities.
4. `OutputFormatter` and `Tui` are just renderers over the same event protocol.
5. `AgentExecutor.layerRpc` and `AgentExecutor.layerRpcServer` preserve the same
   executor contract across local and remote boundaries.

See:

- [`docs/architecture.md`](./docs/architecture.md)
- [`docs/provider-auth.md`](./docs/provider-auth.md)
- [`docs/fork-roadmap.md`](./docs/fork-roadmap.md)
- [`.specs/README.md`](./.specs/README.md)

## Status

What is proven locally in this fork:

- `vitest` unit tests pass
- non-mutating `oxlint` passes
- non-emitting TypeScript checks pass
- the CLI and TUI both have deterministic smoke paths for local validation

What is still deliberately manual:

- live Codex auth
- live Copilot auth
- Exa MCP connectivity

## License

This fork publishes its changes under GNU GPL v3. Upstream provenance remains
documented in git history, but the fork metadata and documentation now follow
the GPLv3 contract for newly produced work.
