# Information

- The base branch for this repository is `master`.
- The package manager used is `bun`.

# Validations

Run `bun run validate` after changing code.

# This project uses "effect"

Use `.repos/effect-smol` as the local Effect v4 reference checkout when working
on services, layers, terminal input, or RPC wiring. If the reference checkout
is missing, clone it before making non-trivial runtime changes.

# Changesets

Every pull request should include a changeset describing the changes made.
Changesets are added to the `.changeset/` directory.

There should one be ONE changeset per pull request.

# Specifications

To learn more about previous and current specifications for this project, see
the `.specs/README.md` file and the `specs/` working notes.
