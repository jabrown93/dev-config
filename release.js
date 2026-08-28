import { fileURLToPath } from 'node:url';

// Shared semantic-release configuration for jabrown93 npm packages.
//
// Consumers reference this with a one-line `.releaserc.json` (or `.js`):
//   { "extends": "@jabrown93/dev-config/release" }
// "extends" is just a resolver string -- semantic-release/cosmiconfig loads
// and executes this module regardless of the local file's own extension, so
// a plain JSON local file works fine even though this module runs code.
//
// Versioning is automated from Conventional Commits:
//   * push to `main`/`next` -> stable release (feat -> minor, fix/perf -> patch, ! -> major)
//   * push to `beta`/`alpha` -> prerelease (vX.Y.Z-beta.N / -alpha.N)
//
// Routine runtime dependency bumps (fix(deps), from Renovate via the shared
// preset in jabrown93/.github) do NOT cut a release on ordinary pushes --
// they would otherwise publish a new npm version per merged Renovate PR. A
// weekly scheduled run (see jabrown93/.github's README, "Weekly dependency
// releases") sets RELEASE_DEPS=true, which promotes the accumulated bumps
// into one patch release. Vulnerability fixes are typed fix(security) by the
// preset, not fix(deps), so they are unaffected by the suppression and still
// release immediately.
//
// IMPORTANT for adopters: a consumer's release.yml caller must add a
// `schedule` (and ideally `workflow_dispatch`) trigger for RELEASE_DEPS to
// ever become true -- without it, fix(deps) commits are suppressed forever,
// not just batched. See jabrown93/homebridge-smartrent's release.yml for the
// trigger shape to copy.
const releaseDeps = process.env.RELEASE_DEPS === 'true';

const depReleaseRules = [
  // Required: commit-analyzer evaluates every matching custom rule and keeps
  // the highest release type, so without this a breaking fix(deps)! would
  // match ONLY the suppression rule below and never release. Listed first so
  // the analyzer short-circuits on major.
  { type: 'fix', scope: 'deps', breaking: true, release: 'major' },
  releaseDeps
    ? { type: 'fix', scope: 'deps', release: 'patch' }
    : { type: 'fix', scope: 'deps', release: false },
];

const noteKeywords = ['BREAKING CHANGE', 'BREAKING CHANGES', 'BREAKING'];

// Both plugins resolve a bare `preset: 'conventionalcommits'` string from
// their OWN directory first, which walks up to the consumer's hoisted root
// copy -- not this package's pinned one. A consumer that also has
// @commitlint/config-conventional@21 hoists conventionalcommits@10 there,
// and v10 hard-refuses the conventional-changelog-writer@8 that
// @semantic-release/release-notes-generator@14 still ships, aborting the
// release with `Missing helper: "conventional-changelog-conventionalcommits
// requires conventional-changelog-writer@9 or newer"`. Passing an absolute
// path as `config` (import-from-esm treats a leading `/` as a file module)
// pins every consumer to the version resolved here.
const conventionalcommits = fileURLToPath(
  import.meta.resolve('conventional-changelog-conventionalcommits')
);

export default {
  // NOTE: `branches` (plural) -- this is the key semantic-release actually
  // reads. Two of the fleet's original per-repo .releaserc.json files had
  // this as `"branch"` (singular), so that array was silently ignored and
  // semantic-release fell back to its own default (`main` + `next` +
  // `beta`/`alpha` prereleases, close to but not verified identical to what
  // was intended) -- fixed by centralizing.
  branches: [
    'main',
    'next',
    { name: 'beta', prerelease: true },
    { name: 'alpha', prerelease: true },
  ],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        // `config`/`preset` is not a semantic-release core option -- there
        // is no top-level fallback; each plugin reads it only from its own
        // tuple's options (verified against @semantic-release/commit-analyzer's
        // and release-notes-generator's own loaders, and semantic-release core
        // itself has zero references to "preset" anywhere). A top-level key
        // here would be silently ignored, and both plugins would fall back to
        // the Angular preset instead -- the fleet's original per-repo configs
        // all had exactly that silent bug.
        config: conventionalcommits,
        parserOpts: { noteKeywords },
        releaseRules: depReleaseRules,
      },
    ],
    [
      '@semantic-release/exec',
      {
        // Trims a duplicate leading "Unreleased"-style CHANGELOG heading on
        // release branches. Present in 3 of the 4 fleet repos; the 4th
        // (philips-hue-sync-box) was missing it -- restored here.
        //
        // Guarded on the file existing: this step runs before
        // @semantic-release/changelog's own `prepare` hook (the one that
        // creates CHANGELOG.md), so on a repo's very first-ever release --
        // this package's own included -- there's no file yet and a bare
        // `sed -i` would exit nonzero and abort the release.
        prepareCmd:
          "test ${branch.type} != release || test ! -f CHANGELOG.md || sed -i '/^## \\[/h;x;/^[^]]*-/{x;d};x' CHANGELOG.md",
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        config: conventionalcommits,
        parserOpts: { noteKeywords },
        writerOpts: { commitsSort: ['subject', 'scope'] },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogTitle:
          '# Changelog\n\nAll notable changes to this project will be documented ' +
          'in this file. See\n[Conventional Commits](https://conventionalcommits.org) ' +
          'for commit guidelines.',
      },
    ],
    ['@semantic-release/npm', { tarballDir: 'dist' }],
    [
      '@semantic-release/exec',
      {
        prepareCmd:
          'npx --yes @cyclonedx/cyclonedx-npm@4.2.1 --ignore-npm-errors --output-format JSON --output-file sbom.cdx.json',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'sbom.cdx.json', label: 'CycloneDX SBOM (sbom.cdx.json)' },
        ],
      },
    ],
    [
      '@semantic-release/exec',
      {
        // Version-bump commit via GitHub's GraphQL createCommitOnBranch
        // instead of @semantic-release/git: API commits are signed by GitHub
        // and show as Verified, which a local git commit from a CI bot never
        // can be. RELEASE_COMMIT_SCRIPT is exported by the
        // jabrown93/ci/actions/release-commit step in npm-release.yml
        // (workflows-v1.1.0+), so a consumer's release.yml pin must be at
        // least that. It is written WITHOUT braces because exec runs this
        // command through a Lodash template that would evaluate ${...} as
        // JS -- the bare form is left for the shell. The script skips
        // unchanged or absent paths (npm-shrinkwrap.json is listed for
        // parity with @semantic-release/git's defaults) and hard-resets the
        // checkout so the release tag points at the API commit.
        //
        // `[skip ci]` kept: GitHub Actions natively skips ALL workflows for
        // a push whose HEAD commit message contains it, and the app-token
        // API commit would otherwise re-trigger a full lint/build/test
        // matrix plus a redundant semantic-release run. Trade-off vs the git
        // plugin: the API takes a headline only, so the release notes no
        // longer ride in the commit body -- they remain in CHANGELOG.md and
        // the GitHub Release.
        prepareCmd:
          'node $RELEASE_COMMIT_SCRIPT --branch ${branch.name}' +
          " --message 'chore(release): ${nextRelease.version} [skip ci]' --" +
          ' CHANGELOG.md package.json package-lock.json npm-shrinkwrap.json',
      },
    ],
  ],
};
