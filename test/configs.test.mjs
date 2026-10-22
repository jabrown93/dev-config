import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
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
const lintStagedRunner = path.join(
  rootDir,
  'test',
  'helpers',
  'run-lint-staged.mjs'
);
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
const releaseConfigPath = fileURLToPath(
  import.meta.resolve('@jabrown93/dev-config/release')
);

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
 * Create environment that cannot inherit caller Git state.
 *
 * @param {string} cwd Temporary repository directory.
 * @param {Record<string, string>} [extra] Explicit Git variables for a test.
 * @returns {Promise<Record<string, string>>} Sanitized environment.
 */
async function gitEnvironment(cwd, extra = {}) {
  const configPath = path.join(cwd, 'gitconfig');
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))
  );

  await writeFile(
    configPath,
    '[user]\n\tname = Config Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n'
  );

  return {
    ...env,
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_AUTHOR_NAME: 'Config Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Config Test',
    GIT_CONFIG_GLOBAL: configPath,
    GIT_CONFIG_NOSYSTEM: '1',
    ...extra,
  };
}

/**
 * Run Git in temporary repository with isolated configuration.
 *
 * @param {string} cwd Repository directory.
 * @param {string[]} args Git arguments.
 * @param {Record<string, string>} env Sanitized environment.
 * @returns {Promise<void>} Completes when Git command succeeds.
 */
async function git(cwd, args, env) {
  await execFileAsync('git', args, { cwd, env });
}

/**
 * Read Git output from temporary repository with isolated configuration.
 *
 * @param {string} cwd Repository directory.
 * @param {string[]} args Git arguments.
 * @param {Record<string, string>} env Sanitized environment.
 * @returns {Promise<string>} Git standard output.
 */
async function gitOutput(cwd, args, env) {
  const { stdout } = await execFileAsync('git', args, { cwd, env });

  return stdout;
}

/**
 * Run lint-staged in child process so its Git subprocesses inherit only test state.
 *
 * @param {string} cwd Repository directory.
 * @param {Record<string, string>} env Sanitized environment.
 * @returns {Promise<{messages: string[]; success: boolean}>} lint-staged result.
 */
async function runLintStaged(cwd, env) {
  const childEnv = Object.fromEntries(
    Object.entries(env).filter(([name]) => !name.startsWith('GIT_'))
  );
  const { stdout } = await execFileAsync(
    process.execPath,
    [lintStagedRunner, cwd, lintStagedConfigPath, env.GIT_CONFIG_GLOBAL],
    { cwd, env: childEnv }
  );

  return JSON.parse(stdout);
}

/**
 * Load release analyzer options with dependency-release mode explicitly set.
 *
 * @param {boolean} releaseDeps Whether dependency commits release patches.
 * @returns {Promise<object>} Commit-analyzer options.
 */
async function releaseAnalyzerOptions(releaseDeps) {
  const env = { ...process.env };

  if (releaseDeps) {
    env.RELEASE_DEPS = 'true';
  } else {
    delete env.RELEASE_DEPS;
  }

  const command =
    `import config from ${JSON.stringify(pathToFileURL(releaseConfigPath).href)};` +
    ' process.stdout.write(JSON.stringify(config.plugins[0][1]));';
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', command],
    { cwd: rootDir, env }
  );

  return JSON.parse(stdout);
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
  assert.equal(bad.errorCount, 0);
  assert.equal(bad.warningCount, 1);
  assert.ok(bad.messages.some(message => message.ruleId === 'no-console'));
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
  const env = await gitEnvironment(cwd);

  try {
    await writeFile(
      configPath,
      `import config from '${pathToFileURL(eslintConfigPath).href}';\nexport default config;\n`
    );
    await copyFile(fixture('eslint', 'clean.ts'), target);
    await git(cwd, ['init', '--initial-branch=main'], env);
    await git(cwd, ['add', '.'], env);
    await git(cwd, ['commit', '-m', 'test: add fixture'], env);

    await writeFile(target, 'export const count: number = 2');
    await git(cwd, ['add', 'fixture.ts'], env);
    assert.equal((await runLintStaged(cwd, env)).success, true);
    assert.match(
      await gitOutput(cwd, ['diff', '--cached', '--', 'fixture.ts'], env),
      /\+export const count: number = 2;/
    );

    await copyFile(fixture('eslint', 'bad.txt'), target);
    await git(cwd, ['add', 'fixture.ts'], env);
    const result = await runLintStaged(cwd, env);

    assert.equal(result.success, false);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test(
  'git-touching tests do not mutate inherited Git repository state',
  { skip: process.env.DEV_CONFIG_GIT_ENV_REGRESSION === '1' },
  async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'dev-config-git-env-'));
    const decoy = path.join(cwd, 'decoy');

    try {
      await mkdir(decoy);
      const env = await gitEnvironment(decoy);
      await git(decoy, ['init', '--initial-branch=main'], env);
      await writeFile(path.join(decoy, 'fixture.txt'), 'decoy\n');
      await git(decoy, ['add', 'fixture.txt'], env);
      await git(decoy, ['commit', '-m', 'test: decoy'], env);
      const refsBefore = await gitOutput(
        decoy,
        ['for-each-ref', '--format=%(refname) %(objectname)'],
        env
      );
      const indexBefore = await readFile(path.join(decoy, '.git', 'index'));
      const childEnv = await gitEnvironment(decoy, {
        DEV_CONFIG_GIT_ENV_REGRESSION: '1',
        GIT_DIR: path.join(decoy, '.git'),
        GIT_INDEX_FILE: path.join(decoy, '.git', 'index'),
        GIT_WORK_TREE: decoy,
      });

      await execFileAsync(
        process.execPath,
        ['--test', 'test/configs.test.mjs'],
        {
          cwd: rootDir,
          env: childEnv,
        }
      );

      assert.equal(
        await gitOutput(
          decoy,
          ['for-each-ref', '--format=%(refname) %(objectname)'],
          env
        ),
        refsBefore
      );
      assert.deepEqual(
        await readFile(path.join(decoy, '.git', 'index')),
        indexBefore
      );
    } finally {
      await rm(cwd, { force: true, recursive: true });
    }
  }
);

test('release config analyzes dependency commits in both release modes', async () => {
  const clean = await readFile(fixture('release', 'clean.txt'), 'utf8');
  const dependency = await readFile(fixture('release', 'bad.txt'), 'utf8');
  const logger = { log() {} };

  for (const [releaseDeps, dependencyRelease] of [
    [false, null],
    [true, 'patch'],
  ]) {
    const analyzer = await releaseAnalyzerOptions(releaseDeps);

    assert.equal(
      await analyzeCommits(analyzer, {
        commits: [{ message: clean.trim() }],
        logger,
      }),
      'patch'
    );
    assert.equal(
      await analyzeCommits(analyzer, {
        commits: [{ message: dependency.trim() }],
        logger,
      }),
      dependencyRelease
    );
  }
});
