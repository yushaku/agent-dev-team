// The dashboard's frontend tests use node:vm modules, which need --experimental-vm-modules; this wrapper
// gives them that flag so `orca plugin test` (a plain `node --test`) runs them too. The tests live in frontend.impl.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

test('the dashboard frontend tests pass (tests/frontend.impl.mjs)', () => {
  const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', join(import.meta.dirname, 'frontend.impl.mjs')], { encoding: 'utf8' })
  assert.equal(
    run.status,
    0,
    run.stdout
      .split('\n')
      .filter((l) => /^(✖|\s+(Assertion|Error)|not ok)/.test(l) || /^\s+at /.test(l))
      .slice(0, 40)
      .join('\n') || run.stdout + run.stderr,
  )
})
