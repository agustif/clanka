# Roadmap

## Phase 1: Runtime hardening

- Keep the agent/executor/tool split canonical.
- Promote sessions into a core storage service instead of a TUI-local helper.
- Keep live provider auth working under Bun-native Effect runtime layers.
- Ensure all public entrypoints behave correctly in both live and mock modes.
- Preserve mock mode only as a deterministic validation path, not as the
  product’s primary story.

## Phase 2: Conversational TUI

- Make the main pane a conversation between user and agent.
- Add a live current-task summary at the top of the screen.
- Treat the activity rail as support context only.
- Render auth/login as first-class interruption cards.
- Move deep trace toward a secondary view or expansion model.
- Persist sessions continuously and resume from the last saved project session.
- Expose session/thread state and basic thread operations directly in the TUI.
- Status: landed for the first slice. Grouped-turn rendering still pending.

## Phase 3: Operator trust

- Summarize files read, files changed, tests run, and commands executed per run.
- Distinguish facts, evidence, and inference in the UI.
- Improve failure recovery so non-JavaScript model output is fed back into the
  loop instead of collapsing the run.
- Add replay and richer run history derived from the session event log.

## Phase 4: Production feel

- Improve visual rhythm, spacing, hierarchy, and card grammar.
- Add visual test coverage for the TUI using PTY/screenshot-based observation.
- Explore OpenTUI-like composition patterns while keeping the runtime
  Effect-native.
- Add a deeper component model for feed cards, sidebars, overlays, and
  approvals.

## Phase 5: Threads and handoff

- Add first-class thread navigation in the UI.
- Add in-session branching and explicit handoff flows.
- Add branch summaries and handoff summaries using a shared summarization
  service.
- Add a tree view over thread and branch structure, informed by Pi and Amp
  patterns.
- Status: storage layer and basic TUI commands landed; tree view and handoff
  review UX still pending.

## Cross-incumbent standards

- Track a living `SPEC.md` that codifies shared harness invariants:
  project-scoped sessions, append-only history, resume, branching, handoff,
  file tracking, and operator-visible state transitions.

## Deferred

- Extracting `TypeBuilder` into a separate package.
- Replacing the current event protocol.
- Reviving abandoned upstream search branches unless a concrete product need
  appears.
