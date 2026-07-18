# @jabrown93/dev-config

Shared JS/TS dev-tooling config for `jabrown93` repos: TypeScript, ESLint, Prettier,
commitlint, lint-staged, and semantic-release. One published package instead of six
hand-copied config files per repo — bump this package's version and Renovate proposes the
same bump everywhere it's used, the same way runtime dependency bumps already flow.

This is the npm-package analog of [`jabrown93/.github`](https://github.com/jabrown93/.github),
which centralizes reusable GitHub Actions workflows the same way. That repo is deliberately
unpublished (`private: true`, consumed via `uses:`); this one is a real published package
because its configs are consumed at author/commit time via `devDependency` + `extends`, not
by Actions.

## Usage

Add the package:

```sh
npm install --save-dev @jabrown93/dev-config
```

### TypeScript

Requires `typescript` **5.7+** — `target`/`lib: ES2024` isn't recognized before that (declared
as a `peerDependencies` floor; npm will warn on install if the consumer's `typescript` is older).

```json
// tsconfig.json
{
  "extends": "@jabrown93/dev-config/tsconfig",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`rootDir`/`outDir` must stay in the **consumer's own** `tsconfig.json`, not the shared base:
TypeScript resolves an extended config's relative paths against _that config file's own
location_, so a `rootDir`/`outDir` baked into this package would resolve to paths inside
`node_modules/@jabrown93/dev-config/`, not the consumer's own `src`/`dist` — breaking every
consumer with a `TS6059` "not under rootDir" error.

### ESLint (flat config)

```js
// eslint.config.mjs
import base from '@jabrown93/dev-config/eslint';

export default [...base, { ignores: ['**/dist'] }];
```

The only thing that's ever differed across the fleet is `ignores` — add repo-specific entries
after the shared base.

### Prettier

```json
// package.json
{
  "prettier": "@jabrown93/dev-config/prettier"
}
```

Delete any local `.prettierrc.json` — Prettier uses one config source, not both.

### commitlint

```js
// commitlint.config.js
export default { extends: ['@jabrown93/dev-config/commitlint'] };
```

### lint-staged

```js
// .lintstagedrc.js
export { default } from '@jabrown93/dev-config/lint-staged';
```

Delete any local `.lintstagedrc.json` or an inline `lint-staged` key in `package.json` — only
one lint-staged config source should exist per repo.

### semantic-release

```json
// .releaserc.json
{ "extends": "@jabrown93/dev-config/release" }
```

`extends` is a resolver string, not code — this works from a `.releaserc.json` even though the
referenced module runs code at load time.

This config suppresses routine `fix(deps)` commits on ordinary pushes and promotes them into a
single weekly patch release when the caller's workflow sets `RELEASE_DEPS=true` (see
`jabrown93/.github`'s README, "Weekly dependency releases"). **A consumer's `release.yml` must
add a `schedule` (and ideally `workflow_dispatch`) trigger for this to ever fire** — without
one, `fix(deps)` commits are suppressed forever, not just batched. See this repo's own
`.github/workflows/release.yml`, or `homebridge-smartrent`'s, for the trigger shape to copy.

### What stays per-repo

No npm-`extends` mechanism exists for `.prettierignore` or `.nvmrc` — those stay hand-maintained
per repo.

## What's exported

| Subpath                             | Contents                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@jabrown93/dev-config/tsconfig`    | Shared `compilerOptions` (target/module/strict/etc.) — no `rootDir`/`outDir`/`include`/`exclude`, those must stay in the consumer's own tsconfig (see above)         |
| `@jabrown93/dev-config/eslint`      | Flat-config array (parser, `eslint:recommended` + `@typescript-eslint/recommended`, the fleet's stylistic rules)                                                     |
| `@jabrown93/dev-config/prettier`    | The 5 shared Prettier options                                                                                                                                        |
| `@jabrown93/dev-config/commitlint`  | `@commitlint/config-conventional` + 4 rule overrides                                                                                                                 |
| `@jabrown93/dev-config/lint-staged` | `eslint --fix` on staged js/mjs/ts + `prettier --write` on staged js/mjs/ts/json/md/yml                                                                              |
| `@jabrown93/dev-config/release`     | semantic-release config: branches `main`/`next`/`beta`/`alpha`, conventionalcommits preset, CHANGELOG trim, CycloneDX SBOM release asset, `fix(deps)` weekly roll-up |

## Dependency split

Tools whose **bin** a consumer invokes directly (`eslint`, `prettier`, `typescript`, `husky`,
`lint-staged`, `semantic-release`, `@commitlint/cli`, plus each repo's own test runner) stay as
**direct devDependencies in the consumer**. Packages this config resolves internally at
runtime and a consumer never invokes directly (`@typescript-eslint/*`, `@eslint/js`,
`@eslint/eslintrc`, `@commitlint/config-conventional`, every `@semantic-release/*` plugin,
`conventional-changelog-conventionalcommits`) are `dependencies` **of this package** — they
arrive in a consumer's tree via normal npm hoisting when this package installs, and a version
bump here is the only place those need touching.

## Versioning

Released automatically by semantic-release from Conventional Commits on `main` — see
`.releaserc.js` (a relative re-export of `release.js`; this repo can't `extends` its own
published package). Don't hand-edit `package.json`'s version.
