# Fixtures

## `workspaces/shop`

A small npm workspaces monorepo:

| Project | Directory | Scripts | Depends on |
| --- | --- | --- | --- |
| `@shop/tokens` | `packages/tokens` | build | |
| `@shop/theme` | `packages/theme` | none (source only) | `@shop/tokens` |
| `@shop/ui` | `packages/ui` | build, test | `@shop/theme` (and `react` as a peer, which is not in the workspace) |
| `@shop/utils` | `packages/utils` | build, test | |
| `@shop/web` | `apps/web` | build, test, start | `@shop/ui`, `@shop/utils` |
| `@shop/admin` | `apps/admin` | build | `@shop/ui` (as a devDependency) |
| `@shop/api` | `apps/api` | build, test, start | `@shop/utils` |

`monorun.json` makes `build` depend on `^build` and `test` on `build`, and adds
`tsconfig.base.json` to the global files.

The scripts call two stand-ins in `tools/`:

- `build.mjs` checks that every file in `src/` parses (`node --check`), then copies `src/` to
  `dist/` and writes `dist/build-info.json`. The same input always gives the same output. A file
  that does not parse makes it exit with 1.
- `test.mjs` fails when `dist/build-info.json` is missing, so a test that runs before its build
  fails.

Tests that run scripts copy this directory to a temporary directory first, so no `dist/` is ever
written here.

## `workspaces/cycle`

Two projects that depend on each other (`@cycle/a` through `dependencies`, `@cycle/b` through
`devDependencies`), for the cycle error.
