// web/ is generated from dashboard/web; this fails when the two drift apart.
import { assert, test } from 'orca/testing'
// @ts-expect-error plain .mjs script, no declarations
import { drift } from '../scripts/sync-web.mjs'

test('web/ matches dashboard/web (run: node orca-plugin/scripts/sync-web.mjs)', () => {
  assert.deepEqual(drift(), [])
})
