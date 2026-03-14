# Roadmap

## Phase 1: Runtime hardening

- Keep the agent/executor/tool split canonical.
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

## Deferred

- Extracting `TypeBuilder` into a separate package.
- Replacing the current event protocol.
- Reviving abandoned upstream search branches unless a concrete product need
  appears.
