# Clanka Fork Audit And Roadmap

## Status

- State: draft
- Started: 2026-03-14
- Repository: `/Users/af/darkfactory/clanka`

## Objective

Produce a verified fork dossier for `clanka` that:

1. reconstructs the project's architectural intent from the code and git history,
2. documents the current runtime and module boundaries,
3. runs and validates the project locally,
4. captures concrete defects or integration gaps,
5. proposes a pragmatic extension roadmap for a fork.

## Open Questions

- Which parts of the current library run successfully with a fresh install on this machine?
- Are provider-auth flows testable offline, or only unit-testable with fixtures?
- Is the current public surface centered on TypeBuilder, agent execution, or both?
- Which abandoned branches contain ideas worth reviving in the fork?

## Risks

- The repository is an early WIP with rapid architecture churn across one week of commits.
- README coverage is effectively absent, so source and history must be treated as the primary truth.
- The upstream repo contract referenced `.repos/effect/LLMS.md`, but the fork
  now uses `.repos/effect-smol` as the local Effect v4 reference checkout.
- Auth- and provider-dependent code may require credentials or network behavior that is not reproducible in offline tests.

## Priorities

1. Establish current runtime/build/test status.
2. Create durable architecture documentation from verified evidence.
3. Identify breakpoints and low-risk fork seams.
4. Propose a staged roadmap for extension work.

## Implementation Phases

### Phase 1: Inventory

- Confirm repo state, branches, tags, specs, and module layout.
- Summarize subsystem chronology from git history.
- Map code ownership by module and purpose.

### Phase 2: Execution And QA

- Install dependencies.
- Run `bun run validate`.
- Run the example CLI or a minimal executable path if possible.
- Capture failures, missing prerequisites, or runtime regressions.

### Phase 3: Documentation

- Expand the root README into a real project guide.
- Add a dedicated architecture or audit document covering modules and execution flow.
- Record confirmed constraints, failure modes, and extension seams.

### Phase 4: Roadmap

- Convert findings into a concrete fork plan.
- Separate immediate stabilization work from medium-term feature expansion.
- Note candidate branch ideas to revive or ignore.

## Affected Files

- `/Users/af/darkfactory/clanka/README.md`
- `/Users/af/darkfactory/clanka/package.json`
- `/Users/af/darkfactory/clanka/examples/cli.ts`
- `/Users/af/darkfactory/clanka/src/*.ts`
- `/Users/af/darkfactory/clanka/.specs/*.md`
- `/Users/af/darkfactory/clanka/specs/drafts/clanka-fork-audit-and-roadmap.md`

## Existing Issues Or PRs

- No local issue tracker references were found in the checkout.
- Git history shows many short-lived topic branches and release PRs.

## Definition Of Done

- The repo has a written audit describing current architecture and history.
- Local validation commands have been run and their status recorded.
- Concrete defects or missing prerequisites are documented.
- The fork roadmap identifies what to keep, change, and defer.
