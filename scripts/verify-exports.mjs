/* eslint-disable no-console -- this is a CLI script; console output is its entire job. */
// Smoke test: every entry in package.json's "exports" map must exist on disk
// and, for JS modules, must import cleanly and have the expected shape. This
// is dev-config's `build`/`test` step -- there's no compile step for a
// plain-JS/JSON config package, but a typo'd export path or a module that
// throws on import would otherwise only be caught by a consumer's install.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(
  readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);

const expectedShape = {
  './tsconfig': 'object',
  './eslint': 'array',
  './prettier': 'object',
  './commitlint': 'object',
  './lint-staged': 'object',
  './release': 'object',
};

let failed = false;

for (const [subpath, relTarget] of Object.entries(pkg.exports)) {
  const absTarget = path.join(rootDir, relTarget);
  if (!existsSync(absTarget)) {
    console.error(`FAIL ${subpath} -> ${relTarget} (file does not exist)`);
    failed = true;
    continue;
  }

  const expected = expectedShape[subpath];
  if (!expected) {
    console.error(
      `FAIL ${subpath} has no expected-shape entry in this script -- add one`
    );
    failed = true;
    continue;
  }

  try {
    const mod = absTarget.endsWith('.json')
      ? JSON.parse(readFileSync(absTarget, 'utf8'))
      : (await import(absTarget)).default;

    const actual = Array.isArray(mod) ? 'array' : typeof mod;
    if (actual !== expected) {
      console.error(`FAIL ${subpath} -> expected ${expected}, got ${actual}`);
      failed = true;
      continue;
    }

    console.log(`OK   ${subpath} -> ${relTarget} (${actual})`);
  } catch (error) {
    console.error(
      `FAIL ${subpath} -> ${relTarget} threw on import: ${error.message}`
    );
    failed = true;
  }
}

if (failed) {
  console.error('\nverify-exports: one or more exports are broken.');
  process.exit(1);
}

console.log(
  '\nverify-exports: all exports resolve and match their expected shape.'
);
