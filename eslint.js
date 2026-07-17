import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsParser from '@typescript-eslint/parser';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

// Shared ESLint flat-config base for jabrown93 TypeScript projects. Import
// this array and append repo-specific entries -- historically the only thing
// that's ever differed across the fleet is `ignores`:
//
//   import base from '@jabrown93/dev-config/eslint';
//   export default [...base, { ignores: ['**/homebridge-ui', '**/dist', 'package-lock.json', 'package.json'] }];
//
// Note: `compat.extends()` resolves plugin packages (e.g.
// @typescript-eslint/eslint-plugin) via Node module resolution starting at
// this file's own directory, which after install is inside the consumer's
// node_modules/@jabrown93/dev-config -- resolution walks up to the
// consumer's top-level node_modules, so this depends on npm hoisting
// @typescript-eslint/eslint-plugin from this package's own `dependencies`.
// That's the standard shareable-eslint-config pattern; verify with
// `npx eslint --print-config <file>` after adopting if something doesn't
// resolve.
export default [
  ...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended'
  ),
  {
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2018,
      sourceType: 'module',
      // The fleet's original config never set `globals`, so flat config
      // assumed no runtime environment -- `no-undef` would flag bare
      // `console`/`process` as undefined. This never surfaced because no
      // fleet src/*.ts file happened to reference either through the actual
      // matched lint glob; it's a real gap for Node-targeted TS, not
      // intentional. Fixed here rather than carried forward.
      globals: { ...globals.node },
    },

    rules: {
      // avoidEscape: prettier picks whichever quote style needs fewer
      // escapes for a given string (e.g. a shell one-liner containing
      // single quotes gets double-quoted); without avoidEscape, this rule
      // and prettier fight over any string like that forever. The fleet's
      // original config lacked this option -- never surfaced because no
      // fleet string needed it, until this package's own release.js did.
      quotes: ['warn', 'single', { avoidEscape: true }],

      indent: [
        'warn',
        2,
        {
          SwitchCase: 1,
        },
      ],

      semi: ['off'],
      'comma-dangle': ['warn', 'only-multiline'],
      'dot-notation': 'off',
      eqeqeq: 'warn',
      curly: ['warn', 'all'],
      'brace-style': ['warn'],
      'prefer-arrow-callback': ['warn'],
      'max-len': ['warn', 140],
      'no-console': ['warn'],
      'comma-spacing': ['error'],

      'no-multi-spaces': [
        'warn',
        {
          ignoreEOLComments: true,
        },
      ],

      'no-trailing-spaces': ['warn'],

      'lines-between-class-members': [
        'warn',
        'always',
        {
          exceptAfterSingleLine: true,
        },
      ],

      // The fleet's original config also listed a core `no-non-null-assertion`
      // rule -- there is no such core ESLint rule (only the
      // @typescript-eslint-prefixed one below exists), so it was a no-op.
      // Dropped here rather than carried forward.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
];
