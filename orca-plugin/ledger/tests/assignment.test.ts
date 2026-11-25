import './team-env.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionAssignment } from '../assignment.ts';

test('recognizes assigned roles from requests without promoting incidental mentions', () => {
  for (const role of ['orchestrator', 'designer', 'builder', 'reviewer']) {
    assert.deepEqual(sessionAssignment({ preview: 'You are an independent ' + role + '. Follow the task.' }), [role, 'prompt']);
    assert.deepEqual(sessionAssignment({ preview: '/team-' + role + ' do this' }), [role, 'prompt']);
  }
  assert.deepEqual(sessionAssignment({ preview: '$design-taste-frontend enhance UI' }), ['designer', 'prompt']);
  assert.deepEqual(sessionAssignment({ preview: 'Fix TypeScript errors in these files only' }), ['builder', 'prompt']);
  assert.equal(sessionAssignment({ preview: 'Why did the orchestrator load team-builder and team-reviewer?' }), null);
  assert.equal(sessionAssignment({ preview: 'Review the plan' }), null);
});

test('reads only the assigned .team brief; missing files and escaped links stay unknown', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'assignment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.team/feature'), { recursive: true });
  const brief = join(root, '.team/feature/brief.md');
  const read = () => sessionAssignment({ preview: 'Read ' + brief + ' and do it.' });
  assert.equal(read(), null);
  writeFileSync(brief, '# Brief: slice 1\n\n## Build\nImplement the panel.\nLoad orchestrator docs for reference.');
  assert.deepEqual(read(), ['builder', 'brief']);
  writeFileSync(brief, '# Brief: review slice 1\n\nYou are an independent reviewer. Read Builder evidence.');
  assert.deepEqual(read(), ['reviewer', 'brief']);
  writeFileSync(brief, '# Brief: ledger\n\n## Goal\nStop losing history. Build a daemon.');
  assert.deepEqual(read(), ['builder', 'brief']);
  const outside = join(root, 'outside.md');
  writeFileSync(outside, 'Role: designer');
  const link = join(root, '.team/feature/link.md');
  symlinkSync(outside, link);
  assert.equal(sessionAssignment({ preview: 'Read ' + link + ' and do it.' }), null);
});
