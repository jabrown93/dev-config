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
        // `preset` is not a semantic-release core option -- there is no
        // top-level fallback; each plugin reads it only from its own tuple's
        // options (verified against @semantic-release/commit-analyzer's and
        // release-notes-generator's own loaders, and semantic-release core
        // itself has zero references to "preset" anywhere). A top-level
        // `preset` key here would be silently ignored, and both plugins
        // would fall back to the Angular preset instead -- the fleet's
        // original per-repo configs all had exactly that silent bug.
        preset: 'conventionalcommits',
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
        preset: 'conventionalcommits',
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
      '@semantic-release/git',
      {
        // `chore(release): ... [skip ci]` -- 3 of the 4 fleet repos used
        // `ci(release): ...` with no `[skip ci]`. GitHub Actions natively
        // skips ALL workflows (build.yml + release.yml) for a push whose
        // HEAD commit message contains `[skip ci]`, so omitting it means the
        // version-bump commit this plugin creates re-triggers a full
        // lint/build/test matrix and a whole redundant semantic-release run
        // for nothing (semantic-release itself no-ops since there's nothing
        // new to release, but the CI run still executes). Standardized on
        // the more efficient form (already used by philips-hue-sync-box).
        message:
          'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};
