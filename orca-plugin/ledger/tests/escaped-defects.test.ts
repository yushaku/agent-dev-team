import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyzeDefects } from '../git-defects.ts';

// Contracts of the removed Python test_escaped.py, on temporary Git repositories with fixed commit dates.
class Repo {
  dir = mkdtempSync(join(tmpdir(), 'escaped-defects-'));
  day = 1;
  constructor(t: import('node:test').TestContext) {
    t.after(() => rmSync(this.dir, { recursive: true, force: true }));
    this.git('init', '-b', 'main');
    this.git('config', 'user.name', 'Test');
    this.git('config', 'user.email', 'test@example.com');
    this.write('original\n');
    this.commit('initial');
    this.git('checkout', '-b', 'feat/example');
    this.write('original\nbug\n');
    this.commit('feat: example');
    this.git('checkout', 'main');
    this.merge('feat/example');
  }
  at(day: number, month = 1) {
    const when = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`;
    return { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when };
  }
  git(...args: string[]) {
    return execFileSync('git', ['-C', this.dir, ...args], { encoding: 'utf8', env: { ...process.env, ...this.at(this.day) }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }
  write(text: string, name = 'file.txt') {
    writeFileSync(join(this.dir, name), text);
    this.git('add', '.');
  }
  commit(message: string) {
    this.git('commit', '--allow-empty', '-m', message);
    this.day++;
  }
  merge(branch: string, message = `Merge branch '${branch}'`) {
    this.git('merge', '--no-ff', branch, '-m', message);
    this.day++;
  }
  result() {
    return analyzeDefects(this.dir, this.git('rev-parse', 'HEAD'));
  }
}

test('a fix is blamed on the feature that wrote the line; add-only and whitespace fixes are not; a trailer is', (t) => {
  const repo = new Repo(t);
  repo.write('original\ncorrect\n');
  repo.commit('fix(parser): correct example');
  const first = repo.result().features['feat/example'];
  assert.equal(first.escaped_defects, 1);
  assert.equal(first.median_days_to_surface, 1);
  repo.write('new\n', 'added.txt');
  repo.commit('fix: add missing file');
  repo.write('original\n   correct\n');
  repo.commit('fix: whitespace');
  repo.commit('maintenance\n\nFixes-feature: example');
  const result = repo.result();
  const feature = result.features['feat/example'];
  assert.equal(feature.escaped_defects, 2);
  assert.deepEqual(feature.fix_commits.map((f) => f.source), ['szz', 'trailer']);
  assert.deepEqual(new Set(result.unattributed_fix_commits.map((f) => f.subject)), new Set(['fix: add missing file']));
});

test('a renamed file is followed, a deleted branch still counts, and a pull-request merge names its branch', (t) => {
  const repo = new Repo(t);
  repo.git('mv', 'file.txt', 'renamed file.txt');
  repo.commit('refactor: rename');
  repo.write('original\ncorrect\n', 'renamed file.txt');
  repo.commit('fix!: correct renamed file');
  repo.git('branch', '-D', 'feat/example');
  assert.equal(repo.result().features['feat/example'].escaped_defects, 1);

  repo.git('checkout', '-b', 'feat/nested');
  repo.write('nested\n', 'nested.txt');
  repo.commit('feat: nested');
  repo.git('checkout', 'main');
  repo.merge('feat/nested', 'Merge pull request #12 from owner/feat/nested');
  assert.ok('feat/nested' in repo.result().features, 'the branch name comes after the owner in a pull-request merge');
});

test('a trailer overrides blame and a fix landing outside the 30-day window does not count', (t) => {
  const repo = new Repo(t);
  repo.git('checkout', '-b', 'feat/other');
  repo.write('other\n', 'other.txt');
  repo.commit('feat: other');
  repo.git('checkout', 'main');
  repo.merge('feat/other');
  repo.write('original\ncorrect\n');
  repo.commit('fix: override\n\nFixes-feature: feat/other');
  const features = repo.result().features;
  assert.equal(features['feat/example'].escaped_defects, 0, 'the blamed feature gets nothing when a trailer names another');
  assert.equal(features['feat/other'].escaped_defects, 1);
  assert.equal(features['feat/other'].fix_commits[0].source, 'trailer');

  const late = new Repo(t);
  late.day = 20; // the feature merged on Jan 20; this trailer fix lands on 1 March, far beyond 30 days
  late.git('checkout', '-b', 'feat/other');
  late.write('other\n', 'other.txt');
  late.commit('feat: other');
  late.git('checkout', 'main');
  late.merge('feat/other');
  late.day = 1;
  const env = { ...process.env, ...late.at(1, 3) };
  late.write('original\ncorrect\n');
  execFileSync('git', ['-C', late.dir, 'commit', '-m', 'fix: later\n\nFixes-feature: feat/other'], { env, stdio: 'ignore' });
  assert.equal(late.result().features['feat/other'].escaped_defects, 0);
});

test('a fix in the same second as the merge uses ancestry order, not timestamps', (t) => {
  const repo = new Repo(t);
  repo.day--; // the fix commit gets the merge's own date
  repo.write('original\ncorrect\n');
  repo.commit('fix: immediate correction');
  const feature = repo.result().features['feat/example'];
  assert.equal(feature.escaped_defects, 1);
  assert.equal(feature.median_days_to_surface, 0);
});

test('a fix counts when it was merged, not when it was authored', (t) => {
  const repo = new Repo(t);
  repo.git('checkout', '-b', 'fix/later');
  repo.write('original\ncorrect\n');
  repo.commit('fix: delayed integration');
  repo.git('checkout', 'main');
  // Authored in January, merged on 1 March: outside the window of the feature that merged on January 3.
  execFileSync('git', ['-C', repo.dir, 'merge', '--no-ff', 'fix/later', '-m', "Merge branch 'fix/later'"], { env: { ...process.env, ...repo.at(1, 3) }, stdio: 'ignore' });
  const result = repo.result();
  assert.equal(result.features['feat/example'].escaped_defects, 0);
  assert.deepEqual(result.unattributed_fix_commits, []);
});

test('an unreadable repository is unknown, not zero', () => {
  const missing = join(tmpdir(), 'escaped-defects-missing-' + process.pid);
  const result = analyzeDefects(missing, 'missing');
  assert.notEqual(result.error, null);
  assert.deepEqual(result.features, {});
});

void renameSync;
