import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ['bin/cache-invariants.mjs', ...args], { cwd: root, encoding: 'utf8' });

test('lint exits 1 on the bad examples and names each rule', () => {
  const r = cli('lint', 'examples');
  assert.equal(r.status, 1);
  for (const id of ['nondeterministic-system-prompt', 'tool-list-mutation', 'history-rewrite', 'system-prompt-append']) assert.match(r.stdout, new RegExp(id));
});

test('lint exits 0 on the source itself', () => {
  assert.equal(cli('lint', 'src', 'bin').status, 0);
});

test('lint --json is parseable', () => {
  const out = JSON.parse(cli('lint', 'examples', '--json').stdout);
  assert.equal(out.files, 2);
  assert.ok(out.errors >= 3);
});

test('unknown command exits 2', () => {
  assert.equal(cli('nope').status, 2);
});

test('test files are skipped unless --include-tests', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'ci-'));
  mkdirSync(join(dir, '__tests__'));
  writeFileSync(join(dir, '__tests__', 'a.test.ts'), 'messages.splice(0, 1);\n');
  writeFileSync(join(dir, 'b.spec.js'), 'messages.splice(0, 1);\n');
  assert.equal(cli('lint', dir).status, 0);
  assert.equal(cli('lint', dir, '--include-tests').status, 1);
  assert.equal(cli('lint', join(dir, 'b.spec.js')).status, 1);
});

test('a missing path is a usage error', () => {
  assert.equal(cli('lint', 'does-not-exist').status, 2);
});
