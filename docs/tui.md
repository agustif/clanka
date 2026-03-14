# TUI Guide

## What it is

The TUI is the first-class operator surface for the fork. It is not a separate
AI client layered on top of logs; it renders the native `Agent.Output` event
stream.

That means the TUI and CLI share the same runtime truth:

- prompt submission
- reasoning deltas
- script text
- script output
- subagent lifecycle
- task completion

## Run it

### Directly from the repo

```bash
bun run tui -- "inspect the repo"
```

### Direct binary invocation

```bash
bun run bin/clanka "inspect the repo"
```

### One-shot smoke mode

```bash
bun run bin/clanka --mock --once "list the workspace"
```

This starts the TUI, auto-submits the prompt, renders a real frame, and exits
after completion. It is the easiest internal smoke path.

## Install `clanka` on your PATH

From the repository root:

```bash
bun link
```

Then start the TUI anywhere:

```bash
clanka "inspect the repo"
```

Other useful commands:

```bash
clanka --once "list the workspace"
clanka --cli --mock "list the workspace"
clanka "inspect the workspace"
clanka --copilot "inspect the workspace"
```

To remove the linked binary later:

```bash
bun unlink
```

## Controls

- `Enter`: start a run or steer the currently running agent
- `Up` / `Down`: move through timeline entries
- `Esc`: clear the input buffer
- `Ctrl-C`: quit

## Modes

### live mode

- default mode
- uses real provider layers
- device auth remains manual
- pair with `--copilot` to target Copilot instead of Codex

### `--mock`

- reserved for deterministic tests and smoke runs
- still exercises the real agent/executor/tools path
- not the primary operator story for the fork

### `--cli`

- bypasses the full-screen UI
- uses the same agent runtime with the linear pretty formatter

## Design direction

The current TUI is intentionally simple:

- left panel: timeline
- right panel: details
- bottom input: prompt or steer

The next UI iterations should add:

- run history / replay
- tool-call inspection
- auth and provider status
- multi-run orchestration
