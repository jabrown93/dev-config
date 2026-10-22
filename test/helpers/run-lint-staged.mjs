import lintStaged from 'lint-staged';

const [cwd, configPath, gitConfigPath] = process.argv.slice(2);
const messages = [];
const logger = {
  error: message => messages.push(message),
  log: message => messages.push(message),
  warn: message => messages.push(message),
};

for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) {
    delete process.env[name];
  }
}

process.env.GIT_CONFIG_GLOBAL = gitConfigPath;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const success = await lintStaged(
  { cwd, configPath, quiet: true, stash: false },
  logger
);

process.stdout.write(JSON.stringify({ messages, success }));
