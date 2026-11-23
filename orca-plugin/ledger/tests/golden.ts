// Python's output for the existing fixtures, frozen as committed JSON in tests/golden/. The Python
// dashboard produced these once (GOLDEN_RECORD=1, while it still existed); the tests now compare the
// TypeScript output with the files. Paths under the scratch directory are stored as $ROOT / $REALROOT.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, 'golden');
export function golden(label: string, root: string, record?: () => unknown): any {
  const file = join(dir, label + '.json');
  const real = realpathSync(root);
  if (process.env.GOLDEN_RECORD === '1') {
    if (!record) throw new Error('no recorder for ' + label);
    mkdirSync(dir, { recursive: true });
    const text = JSON.stringify(record(), null, 1).split(real).join('$REALROOT').split(root).join('$ROOT');
    writeFileSync(file, text + '\n');
  }
  return JSON.parse(readFileSync(file, 'utf8').split('$REALROOT').join(real).split('$ROOT').join(root));
}
