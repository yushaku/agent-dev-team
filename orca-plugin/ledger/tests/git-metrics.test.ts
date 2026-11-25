import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { projections, PARSER_VERSION } from '../derived.ts';
import { GitMetrics } from '../git-metrics.ts';
import { Store } from '../store.ts';

test('Git warmup serves stale history, deduplicates new heads and retries expired failures', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ledger-git-'));
  const repo = join(root, 'checkout'),
    bin = join(root, 'bin');
  mkdirSync(repo);
  mkdirSync(bin);
  const store = new Store(join(root, 'ledger'));
  projections(store);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'git@example.test');
  git('commit', '--allow-empty', '-m', 'initial');
  const binary = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const shim = join(bin, 'git');
  writeFileSync(
    shim,
    `#!/bin/sh
if [ "$3" = log ] && [ "$4" = --first-parent ]; then
  echo log >> "$2/calls"
  while [ -f "$2/hold" ]; do sleep 0.02; done
  if [ -f "$2/fail" ]; then exit 1; fi
fi
exec "${binary}" "$@"
`,
  );
  chmodSync(shim, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = bin + ':' + oldPath;
  let service = new GitMetrics(store.db);
  t.after(() => {
    service.close();
    process.env.PATH = oldPath;
    store.db.close();
    rmSync(root, { recursive: true, force: true });
  });
  function restart() {
    service.close();
    service = new GitMetrics(store.db);
  }
  const check = () => service.lookup(repo).metrics;
  const wait = (assertion: () => void) => t.waitFor(assertion, { timeout: 5000, interval: 20 });
  const calls = () => (existsSync(join(repo, 'calls')) ? readFileSync(join(repo, 'calls'), 'utf8').trim().split('\n').length : 0);
  const hold = join(repo, 'hold'),
    fail = join(repo, 'fail');
  writeFileSync(hold, '');
  store.db.prepare('INSERT INTO dashboard_sessions VALUES(?,?,?,?,?)').run(PARSER_VERSION, 1, 1, 's', JSON.stringify({ cwd: repo, branch: 'feat/demo' }));
  service.warm();
  await wait(() => assert.equal(calls(), 1));
  assert.deepEqual([check().stale, check().loading], [false, true]);
  rmSync(hold);
  await wait(() => assert.equal(check().loading, false));
  assert.equal(check().error, null);
  assert.ok(check().analysis_ms >= 0);
  const revision = service.revision;
  check();
  assert.equal(service.revision, revision);

  writeFileSync(join(repo, 'file'), 'fixed');
  git('add', 'file');
  git('commit', '-m', 'fix: a second commit');
  writeFileSync(hold, '');
  const offsetNow = Date.now.bind(Date);
  t.mock.method(Date, 'now', () => offsetNow() + 31000);
  check();
  await wait(() => assert.equal(calls(), 2));
  assert.deepEqual([check().stale, check().loading], [true, true]);
  for (let i = 0; i < 5; i++) assert.equal(check().loading, true);
  rmSync(hold);
  await wait(() => assert.equal(check().stale, false));
  assert.equal(check().unattributed_fix_commits.length, 1);
  restart();
  await wait(() => assert.equal(check().loading, false));
  assert.equal(calls(), 2);

  git('commit', '--allow-empty', '-m', 'third');
  writeFileSync(fail, '');
  restart();
  await wait(() => assert.equal(check().error, 'git_history_unavailable'));
  assert.deepEqual([check().stale, check().loading], [true, false]);
  assert.equal(check().unattributed_fix_commits.length, 1);
  assert.equal(calls(), 3);
  restart();
  await wait(() => assert.equal(check().error, 'git_history_unavailable'));
  assert.equal(calls(), 3);
  rmSync(fail);
  store.db.exec('UPDATE dashboard_git_attempts SET checked_at=0 WHERE error IS NOT NULL');
  restart();
  await wait(() => assert.equal(check().stale, false));
  assert.equal(check().error, null);
  assert.equal(calls(), 4);
});
