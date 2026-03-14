# clanka Session, Thread, Handoff, and TUI Specification

## Summary

`clanka` should treat sessions, threads, handoff, and the operator UI as core
product concepts, not as incidental TUI features.

The system should combine:

- **Amp** style short-thread handoff and thread-map thinking
- **OpenCode** style session entity + server/client separation
- **Pi** style append-only JSONL tree storage and explicit branching
- **Crush** style per-session metadata, file tracking, and busy/queue semantics
- **Gemini CLI** style project-scoped auto-save, resume, checkpoints, and hooks
- **Codex CLI** style clear auth/runtime separation

## Shared Standards Across Incumbents

The following standards show up repeatedly across high-quality coding harnesses:

1. Sessions are **project-scoped**.
2. Sessions are **persisted automatically**.
3. There are **multiple sessions per project**, not one giant transcript.
4. Resume is a first-class operation:
   - continue recent
   - browse/select
   - open by explicit ID/path
5. Threads/branches are first-class:
   - fork
   - branch
   - continue from an earlier point
   - summarize abandoned work
6. Handoff is better than blind compaction:
   - move relevant context into a fresh thread
   - keep source history intact
7. History is **append-only**, with durable IDs.
8. Metadata is tracked alongside messages:
   - title
   - model/provider
   - usage/cost
   - file touches
   - status
9. Busy/queue state is explicit per session.
10. Sessions are queryable and exportable.
11. TUI/CLI surface should separate:
   - conversation
   - process/activity
   - deep trace
12. Start/end/compaction events are hookable.

## Incumbent Contributions

### Amp

- Prefer many short threads over one long thread.
- Handoff should create a **new thread** with only the relevant context.
- Threads should be referenceable by ID/URL and readable by the agent.
- Thread relationships matter: mentions, handoff, forks.
- A thread map should visualize:
  - hub-and-spoke work
  - chain/sequential work

### OpenCode

- Sessions are a top-level domain entity.
- Session state should support:
  - child/next sessions
  - busy/idle state
  - revert/diff state
  - compaction
- Plugins/hooks should receive session-aware events.
- TUI is one client; the backend/session model must not be TUI-specific.

### Pi

- Sessions should be stored as append-only JSONL.
- Entries should form a tree via `id` / `parentId`.
- A tree view should allow in-place branch navigation.
- Forking should create a new session from a branch point.
- Branch summaries should capture what was learned on abandoned paths.
- Resume should support:
  - continue recent
  - picker
  - explicit session file / ID

### Crush

- Sessions should track:
  - title
  - usage
  - cost
  - summary message ID
  - todos
  - parent session ID
- File history and file tracking should be keyed by session.
- Busy and queued prompts should be explicit session-level state.
- Agent tool sub-sessions should be representable.

### Gemini CLI

- Auto-save all conversations by default.
- Project-scoped session browsing is required.
- Checkpoints, rewind, retention, and cleanup should exist.
- Session start / end / pre-compression hooks are useful extension points.
- Shell history and ephemeral state should also be project-scoped.

### Codex CLI

- Auth/runtime separation must stay clean.
- Local app state and persisted auth should not be conflated with session data.
- Terminal, app, and remote/cloud experiences may differ, but the session model
  should remain coherent across clients.

## clanka Core Model

### Project

A project is the stable root scope for persistence and UI continuity.

Suggested identity:

- canonical cwd
- optional explicit project id later

### Session

A session is a durable work container inside one project.

Each session must have:

- `sessionId`
- `title`
- `createdAt`
- `updatedAt`
- `status`
- `currentThreadId`
- optional `parentSessionId`
- optional aggregate usage / cost

### Thread

A thread is a branch of work inside a session.

Each thread must have:

- `threadId`
- `sessionId`
- optional `parentThreadId`
- optional `branchPointEntryId`
- `createdAt`
- `updatedAt`
- `status`

### Entry

Entries are append-only.

Each entry must have:

- `entryId`
- `sessionId`
- `threadId`
- `parentEntryId` or equivalent branch linkage when relevant
- `timestamp`
- `event`
- `summary`
- optional `payload`

## Event Kinds

Minimum event kinds:

- lifecycle:
  - `startup`
  - `resume`
  - `auto-submit`
- user/input:
  - `Input`
  - `Steer`
- runtime:
  - `Output`
  - `RunComplete`
  - `RunError`
  - `System`
  - `AuthPrompt`
- future:
  - `Handoff`
  - `ThreadForked`
  - `ThreadBranched`
  - `ThreadCompacted`
  - `FilesRead`
  - `FilesChanged`
  - `ToolInvocation`
  - `ToolResult`

## Persistence Layout

Default project-local shape:

```text
session/
  index.json
  live-state.json
  live-session.jsonl
  sessions/
    <session-id>/
      state.json
      threads/
        main.jsonl
        <thread-id>.jsonl
```

Rules:

- `live-state.json` is a convenience snapshot, not the source of truth.
- Thread JSONL files are the durable source of truth.
- `live-session.jsonl` is a convenience merged tail for current tooling.
- Snapshots may be regenerated from event logs.

## Core Invariants

1. **Append-only history**
   - Never mutate prior event lines.
2. **Stable IDs**
   - Session, thread, and entry IDs must be durable.
3. **Project isolation**
   - One project’s sessions must not pollute another’s defaults.
4. **Resume safety**
   - Resuming a previously running session must recover gracefully without
     claiming the previous run completed successfully.
5. **Branch preservation**
   - Forking or handoff must not destroy the source thread history.
6. **UI/client independence**
   - Session persistence must work without the TUI.
7. **Trace preservation**
   - Reasoning, script, output, auth prompts, and system events must remain
     queryable even when the UI groups them into higher-level turns.
8. **Human-readable summaries**
   - Derived turn summaries are allowed, but raw event evidence must remain.
9. **Auth separation**
   - Auth persistence is not session persistence.
10. **Busy transparency**
   - The system must know whether a session is running, queued, idle, blocked,
     or waiting on auth/model/tooling.

## Handoff Model

Handoff is not compaction.

Handoff should:

- create a **new thread** or **new session**
- carry forward only relevant context
- explicitly record:
  - source session/thread
  - source entry or branch point
  - handoff summary
  - requested next task

Handoff invariants:

- source history remains intact
- handoff summary is explicit and reviewable
- the UI should show both source and destination linkage

## Branching and Tree View

Required operations:

- `new session`
- `continue recent`
- `resume picker`
- `fork session`
- `branch thread`
- `handoff`
- `tree view`

Tree view must allow:

- jumping to an earlier point
- continuing from there
- seeing branch relationships
- seeing summaries of abandoned branches

## TUI Contract

The TUI must consume the session model, not own it.

Main screen structure:

1. **Conversation**
   - user prompts
   - grouped agent turns
   - auth cards
   - completion / blocker cards
2. **Context rail**
   - current status
   - model/provider
   - files/tool activity
   - compact activity list
3. **Composer**
   - primary control surface
4. **Trace view**
   - secondary / expandable

The TUI must expose:

- current task
- next action
- waiting target
- last meaningful progress
- whether the run appears stalled

## Immediate Implementation Order

1. Finish the core `SessionStore` service and remove TUI-local persistence
   helpers.
2. Ensure `bin/clanka` and `examples/tui.ts` provide the session service.
3. Add tests for:
   - session index creation
   - snapshot save/load
   - append-only thread event log
   - resume of recent session
4. Update the TUI to derive grouped conversational turns from the raw event log.
5. Add explicit thread/session operations in the UI and CLI.
6. Add handoff and thread-map support.

## Known Gaps

- Full thread branching is not implemented yet.
- Handoff is not implemented yet.
- The TUI still renders a conversation derived from raw runtime entries rather
  than a proper grouped turn model.
- The current export helper is still convenience-only; it does not yet export
  the full session/thread graph.
