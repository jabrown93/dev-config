import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ESLint } from 'eslint';
import commitlint from '@commitlint/lint';
import loadCommitlint from '@commitlint/load';
import prettier from 'prettier';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import ts from 'typescript';

const execFileAsync = promisify(execFile);
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureDir = path.join(rootDir, 'test', 'fixtures');
const eslintConfigPath = fileURLToPath(
  import.meta.resolve('@jabrown93/dev-config/eslint')
);
const prettierConfigPath = fileURLToPath(
  import.meta.resolve('@jabrown93/dev-config/prettier')
);
const commitlintConfigPath = fileURLToPath(
  import.meta.resolve('@jabrown93/dev-config/commitlint')
);
const tsconfigPath = fileURLToPath(
  import.meta.resolve('@jabrown93/dev-config/tsconfig')
);
const lintStagedConfigPath = fileURLToPath(
  import.meta.resolve('@jabrown93/dev-config/lint-staged')
);
const releaseConfig = (await import('@jabrown93/dev-config/release')).default;
const lintStaged = (await import('lint-staged')).default;

/**
 * Get fixture path by config and expected result.
 *
 * @param {string} config Config fixture directory.
 * @param {string} name Fixture filename.
 * @returns {string} Absolute fixture path.
 */
function fixture(config, name) {
  return path.join(fixtureDir, config, name);
}

/**
 * Run Git without inheriting test runner's current directory.
 *
 * @param {string} cwd Repository directory.
 * @param {string[]} args Git arguments.
 * @returns {Promise<void>} Completes when Git command succeeds.
 */
async function git(cwd, args) {
  const env = { ...process.env };

  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  await execFileAsync('git', args, { cwd, env });
}

test('ESLint config loads and reports configured TypeScript rule', async () => {
  const eslint = new ESLint({ overrideConfigFile: eslintConfigPath });
  const [clean] = await eslint.lintFiles([fixture('eslint', 'clean.ts')]);
  const [bad] = await eslint.lintText(
    await readFile(fixture('eslint', 'bad.txt'), 'utf8'),
    {
      filePath: 'bad.ts',
    }
  );

  assert.equal(clean.errorCount, 0);
  assert.equal(clean.warningCount, 0);
  assert.ok(
    bad.messages.some(
      message => message.ruleId === '@typescript-eslint/no-explicit-any'
    )
  );
});

test('Prettier config formats clean fixture and rejects bad fixture', async () => {
  const cleanPath = fixture('prettier', 'clean.js');
  const badPath = fixture('prettier', 'bad.js');
  const config = await prettier.resolveConfig(cleanPath, {
    config: prettierConfigPath,
  });
  const clean = await readFile(cleanPath, 'utf8');
  const bad = await readFile(badPath, 'utf8');

  assert.ok(config);
  assert.equal(
    await prettier.check(clean, { ...config, filepath: cleanPath }),
    true
  );
  assert.equal(
    await prettier.check(bad, { ...config, filepath: badPath }),
    false
  );
});

test('commitlint config accepts conventional commits and rejects missing types', async () => {
  const config = await loadCommitlint({}, { file: commitlintConfigPath });
  const clean = await readFile(fixture('commitlint', 'clean.txt'), 'utf8');
  const bad = await readFile(fixture('commitlint', 'bad.txt'), 'utf8');
  const valid = await commitlint(
    clean.trim(),
    config.rules,
    config.parserPreset
  );
  const invalid = await commitlint(
    bad.trim(),
    config.rules,
    config.parserPreset
  );

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(error => error.name === 'type-empty'));
});

test('tsconfig compiles clean fixture and reports type mismatch', () => {
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfigPath, {}, ts.sys);
  assert.ok(parsed);

  const compile = file =>
    ts.getPreEmitDiagnostics(
      ts.createProgram({
        rootNames: [fixture('tsconfig', file)],
        options: parsed.options,
      })
    );
  const cleanDiagnostics = compile('clean.ts');
  const badDiagnostics = compile('bad.ts');

  assert.equal(cleanDiagnostics.length, 0);
  assert.ok(badDiagnostics.some(diagnostic => diagnostic.code === 2322));
});

test('lint-staged config runs clean staged fixture and rejects lint warning', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'dev-config-lint-staged-'));
  const configPath = path.join(cwd, 'eslint.config.mjs');
  const target = path.join(cwd, 'fixture.ts');
  const gitEnvironment = Object.fromEntries(
    ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'].map(name => [
      name,
      process.env[name],
    ])
  );
  const messages = [];
  const logger = {
    error: message => messages.push(message),
    log: message => messages.push(message),
    warn: message => messages.push(message),
  };

  for (const name of Object.keys(gitEnvironment)) {
    delete process.env[name];
  }

  try {
    await writeFile(
      configPath,
      `import config from '${pathToFileURL(eslintConfigPath).href}';\nexport default config;\n`
    );
    await copyFile(fixture('eslint', 'clean.ts'), target);
    await git(cwd, ['init', '--initial-branch=main']);
    await git(cwd, ['config', 'user.email', 'test@example.com']);
    await git(cwd, ['config', 'user.name', 'Config Test']);
    await git(cwd, ['add', '.']);
    await git(cwd, ['commit', '-m', 'test: add fixture']);

    await writeFile(target, await readFile(fixture('eslint', 'clean.ts')));
    await git(cwd, ['add', 'fixture.ts']);
    assert.equal(
      await lintStaged(
        { cwd, configPath: lintStagedConfigPath, quiet: true, stash: false },
        logger
      ),
      true
    );

    await copyFile(fixture('eslint', 'bad.txt'), target);
    await git(cwd, ['add', 'fixture.ts']);
    assert.equal(
      await lintStaged(
        { cwd, configPath: lintStagedConfigPath, quiet: true, stash: false },
        logger
      ),
      false
    );
    assert.ok(
      messages.some(message =>
        message.includes('@typescript-eslint/no-explicit-any')
      )
    );
  } finally {
    for (const [name, value] of Object.entries(gitEnvironment)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    await rm(cwd, { force: true, recursive: true });
  }
});

test('release config analyzes release and ignored dependency commits', async () => {
  const analyzer = releaseConfig.plugins[0];
  const clean = await readFile(fixture('release', 'clean.txt'), 'utf8');
  const bad = await readFile(fixture('release', 'bad.txt'), 'utf8');
  const logger = { log() {} };

  assert.equal(
    await analyzeCommits(analyzer[1], {
      commits: [{ message: clean.trim() }],
      logger,
    }),
    'patch'
  );
  assert.equal(
    await analyzeCommits(analyzer[1], {
      commits: [{ message: bad.trim() }],
      logger,
    }),
    null
  );
});
