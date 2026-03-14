# Implementation Plan

## Current slice

This slice focuses on the first TUI-facing features on top of the new
`SessionStore` core service.

### Goals

1. Show session and thread state in the TUI.
2. Add first-class TUI commands for thread-aware workflows.
3. Add a handoff creation path backed by durable session storage.
4. Keep the already running live TUI process untouched while future runs use
   the new flow.

### Scope

- show `sessionId`, `threadId`, `threadTitle`, and `threadCount` in the TUI
- add composer commands:
  - `/thread list`
  - `/thread branch <title>`
  - `/thread switch <thread-id>`
  - `/handoff <summary>`
- wire those commands to `SessionStore`
- keep the behavior honest:
  - branching starts a fresh in-memory view for the new thread
  - handoff creates a durable thread record and a visible system notice

### Not in this slice

- tree navigation UI
- replaying historical thread state into the current screen
- grouped conversational turn aggregation
- compaction summaries

## Acceptance criteria

- thread metadata is visible in the TUI sidebar
- branch and handoff commands mutate `SessionStore` correctly
- tests cover thread creation and switching
- `bun run lint`, `bunx tsc --noEmit`, and `bun run test` pass

## Status

- Landed:
  - session/thread metadata in the TUI
  - `/thread list`
  - `/thread branch <title>`
  - `/thread switch <thread-id>`
  - `/handoff <summary>`
  - thread-aware `SessionStore`
- Deferred to next slice:
  - tree navigation UI
  - replaying existing thread state into the current screen
  - grouped turn aggregation
