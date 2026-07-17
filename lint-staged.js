// Shared lint-staged configuration for jabrown93 repos.
//
//   export { default } from '@jabrown93/dev-config/lint-staged';
//
// Fixes vs. the fleet's prior per-repo copies:
//   - eslint is scoped to the actually-staged js/mjs/ts files (lint-staged
//     appends staged filenames as arguments) instead of a hardcoded
//     `src/**.ts` glob that ran regardless of what was staged.
//   - No `bash -c` wrapper -- that swallowed the staged filenames lint-staged
//     appends (they became unreferenced bash positional args), so eslint
//     fell back to linting the whole repo instead of just staged files.
//   - eslint and prettier are ordered commands under the SAME glob key for
//     js/mjs/ts, not two separate keys that both match those files: distinct
//     glob-key groups run concurrently by default, so two separate keys both
//     matching the same file let eslint and prettier read/write it at the
//     same time -- e.g. prettier can clobber an eslint-only fix while both
//     processes still exit 0, staging code that passes the hook but would
//     fail a real lint run. json/md/yml don't overlap with the first key at
//     all (eslint has no parser configured for them anyway), so they're a
//     second, disjoint key rather than sharing one with js/mjs/ts.
export default {
  '*.{js,mjs,ts}': [
    'eslint --fix --max-warnings=0 --no-warn-ignored',
    'prettier --write',
  ],
  '*.{json,md,yml}': 'prettier --write',
};
