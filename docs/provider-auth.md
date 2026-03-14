# Provider Auth And Smoke Checks

## Principles

- CI should use deterministic offline tests.
- Live auth stays manual.
- The CLI and TUI must run in `--mock` mode without credentials.

## Codex

`CodexAuth` uses the OpenAI device flow and stores tokens through the configured
`KeyValueStore`.

What is covered offline:

- token persistence
- refresh behavior
- JWT account extraction
- auth-aware client header injection

What stays manual:

- real browser/device approval flow
- real Codex endpoint requests

## Copilot

`GithubCopilotAuth` uses the GitHub device flow and stores tokens through the
configured `KeyValueStore`.

What is covered offline:

- token persistence
- concurrency serialization
- metadata/header injection

What stays manual:

- real GitHub device approval flow
- real Copilot endpoint requests

## Smoke checklist

### Offline CLI

```bash
bun run example:cli -- "list the workspace"
```

### Offline TUI

```bash
bun run example:tui -- "inspect the repo"
```

### Live Codex

```bash
bun run examples/cli.ts --live "inspect the workspace"
```

### Live Copilot

```bash
bun run examples/cli.ts --live --copilot "inspect the workspace"
```

Expected live behavior:

- device auth prompts are displayed
- tokens are persisted in the configured storage layer
- subsequent runs reuse cached credentials until refresh is needed
