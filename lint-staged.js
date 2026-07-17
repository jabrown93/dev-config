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
//   - json/md/yml only go through prettier (eslint has no JSON/Markdown/YAML
//     parser configured in the shared eslint config, so running it on those
//     was a no-op at best).
export default {
  '*.{js,mjs,ts}': 'eslint --fix --max-warnings=0 --no-warn-ignored',
  '*.{js,mjs,ts,json,md,yml}': 'prettier --write',
};
