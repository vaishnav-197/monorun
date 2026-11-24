# monorun

Run package scripts across an npm workspaces monorepo in dependency order, for every project or
only for the ones a change affects.

- Finds the projects from the `workspaces` field of the root `package.json`.
- Builds the dependency graph from `dependencies`, `devDependencies`, `peerDependencies` and
  `optionalDependencies`, and rejects cycles.
- Runs a script in each project after the tasks it depends on, as set in `monorun.json`
  (`"dependsOn": ["^build"]`).
- Works out which projects a set of changed files affects, so CI only runs what a pull request
  touched.
- Prefixes every output line with its task, stops at the first failure (or keeps going with
  `--continue`), and prints a summary.
- No runtime dependencies. Node.js built-ins only.

```
$ monorun run build --projects @shop/web
@shop/tokens#build $ node ../../tools/build.mjs
@shop/tokens#build | built @shop/tokens (1 file)
@shop/ui#build $ node ../../tools/build.mjs
@shop/ui#build | built @shop/ui (2 files)
@shop/utils#build $ node ../../tools/build.mjs
@shop/utils#build | built @shop/utils (1 file)
@shop/web#build $ node ../../tools/build.mjs
@shop/web#build | built @shop/web (1 file)

Summary
  @shop/tokens#build  passed  70ms
  @shop/ui#build      passed  87ms
  @shop/utils#build   passed  59ms
  @shop/web#build     passed  62ms

4 passed, 0 failed, 0 skipped in 281ms
```

That is `fixtures/workspaces/shop`: `@shop/web` needs `@shop/ui` and `@shop/utils`, and
`@shop/ui` needs `@shop/tokens` through `@shop/theme`, which has nothing to build.

## Install

Requires Node.js 22.12 or later, and a POSIX shell (`sh`): Linux or macOS.

monorun is not published to npm. Build it from source and link it:

```sh
git clone https://github.com/vaishnav-197/monorun.git
cd monorun
npm ci
npm run build
npm link
```

## Commands

```
monorun run <task> [options]
monorun affected --changed <path>... [options]
monorun graph [options]
```

| Command | What it does |
| --- | --- |
| `run <task>` | Runs the script `<task>` in every selected project, after the tasks it depends on. |
| `affected` | Lists the projects affected by a set of changed files, and why. |
| `graph` | Lists the projects, their directories, scripts and workspace dependencies. |

| Option | Meaning |
| --- | --- |
| `-p, --projects <list>` | Comma-separated project names or patterns, such as `@shop/web,@shop/u*`. Default: every project. A name or pattern that matches nothing is an error. |
| `--changed <path>` | A changed file, relative to the workspace root. Repeatable. With `run`, only affected projects are selected. |
| `--changed-file <path>` | A file with one changed path per line, such as the output of `git diff --name-only main`. |
| `--continue` | Keep running the tasks that do not depend on a failed task. |
| `--dry-run` | Print the plan without running anything (`run` only). |
| `--json` | Print JSON (`affected` and `graph` only). |
| `--cwd <dir>` | Look for the workspace from this directory instead of the current one. |

monorun looks for the workspace root from the current directory upwards: the nearest
`package.json` with a `workspaces` field.

## The workspace

The root `package.json` lists the project directories:

```json
{
  "private": true,
  "workspaces": ["packages/*", "apps/*", "!packages/legacy"]
}
```

- `*` matches one directory level, `**` any number. Patterns starting with `!` exclude
  directories. The Yarn 1 form `{ "packages": [...] }` works too.
- A matching directory is a project when it has a `package.json`. `node_modules` and hidden
  directories are never searched.
- Every project needs a `name`, and names must be unique.
- A project depends on another when any of its four dependency fields names it. The version spec
  is not checked: `"*"`, `"^1.2.0"` and `"workspace:*"` all point at the local project.

## monorun.json

Optional, next to the root `package.json`:

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["build"] }
  },
  "globalFiles": ["package.json", "package-lock.json", "monorun.json", "tsconfig.base.json"]
}
```

- `"^build"` runs `build` in the projects this project depends on first. When one of them has
  no `build` script, monorun looks through it to the projects it depends on, so a source-only
  package does not cut its dependencies out of the order.
- `"build"` without the caret runs the same project's `build` first. It is skipped for projects
  that have no `build` script.
- A task that is not listed has no dependencies.
- A cycle between tasks (`build` needs `test`, `test` needs `build`) is an error.
- `globalFiles` are patterns, relative to the root, for files outside the projects whose change
  affects every project. The default is `package.json`, `package-lock.json` and `monorun.json`.

## Affected projects

Each changed file belongs to the project whose directory holds it (the deepest one, when
projects are nested). A changed project affects every project that depends on it, directly or
through others. A changed global file affects every project. Other files outside the projects,
such as a root `README.md`, affect nothing.

`monorun run build --changed <file>` selects the affected projects. Their dependencies' builds
still run when `dependsOn` asks for them, so an affected app is never built against a missing
library.

```
$ monorun affected --changed packages/theme/src/index.js --changed README.md
Changed files (2)
  README.md                    (not in a project)
  packages/theme/src/index.js  @shop/theme

Affected projects (4)
  @shop/admin  depends on @shop/theme
  @shop/theme  changed
  @shop/ui     depends on @shop/theme
  @shop/web    depends on @shop/theme
```

## How tasks run

- One at a time, in dependency order. Among tasks that are ready together, the one whose id sorts
  first goes first, so the order is the same on every machine.
- Each script runs with `sh -c` in its project directory, the way `npm run` runs it. The
  project's and the root's `node_modules/.bin` come first on `PATH`, and `MONORUN_ROOT`,
  `MONORUN_PROJECT` and `MONORUN_TASK` are set.
- Every output line is prefixed with the task id, `<project>#<task>`. stderr lines go to stderr.
- By default the run stops at the first failure and skips the rest. With `--continue` it only
  skips the tasks that depend on a failed one.
- Every run runs every selected task again.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Every task passed, or nothing needed to run. |
| 1 | A task failed. |
| 2 | Usage, workspace or config error, such as a dependency cycle or an unknown project. |

## Development

```sh
npm ci
npm run build       # the CLI tests run dist/cli.js, so build before testing
npm test
npm run typecheck
```

Conventions in this repo:

- No runtime dependencies. Use Node.js built-ins.
- Problems with arguments are `UsageError`; problems with the workspace or `monorun.json` are
  `InputError`. Both exit with 2, and messages name the file and field
  (`packages/ui/package.json: scripts.build: expected a string`).
- Output is sorted, never in file-system order.
- Tests use vitest. Tests that build copy a fixture workspace to a temporary directory first,
  so nothing is ever written into `fixtures/`.

## License

MIT
