/**
 * Ensures deck-publish's native deps (puppeteer + pptxgenjs) are installed
 * before any other require() in the entrypoint scripts runs.
 *
 * Self-executing: the very act of requiring this module is the trigger.
 * Synchronous so the dependent require()s below the bootstrap line in
 * each entrypoint just work without async coordination.
 *
 * Idempotent: when both deps are present, this is a couple of fs.existsSync
 * calls — effectively free on every invocation after the first.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const skillRoot = path.resolve(__dirname, '..', '..');

function hasDep(name) {
  return fs.existsSync(path.join(skillRoot, 'node_modules', name, 'package.json'));
}

if (!hasDep('puppeteer') || !hasDep('pptxgenjs')) {
  process.stderr.write(
    'deck-publish: first-time setup — installing native deps ' +
    '(~200MB Chromium download, ~30–60s)...\n'
  );
  try {
    execSync('npm install --no-audit --no-fund', {
      cwd: skillRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    process.stderr.write(
      `deck-publish: npm install failed: ${err.message}\n` +
      `Run manually: cd ${skillRoot} && npm install\n`
    );
    process.exit(1);
  }
  process.stderr.write('deck-publish: setup complete.\n');
}
