// Python's output for the existing fixtures, frozen as committed JSON in tests/golden/. The Python
// dashboard produced these once, against the team fixture in tests/fixtures/team and reproducible git
// commits; its sources and the recorders are in git history (the commit that adds this directory, and its
// parent). Placeholders: $ROOT and $REALROOT stand for the scratch directory, $FIXTURES for tests/fixtures
// written the way the dashboard prints a path under the home directory (with a leading ~).
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const fixtures = join(import.meta.dirname, 'fixtures');
const tilde = (path: string) => (path.startsWith(homedir() + '/') ? '~' + path.slice(homedir().length) : path);

export function golden(label: string, root: string): any {
  const text = readFileSync(join(import.meta.dirname, 'golden', label + '.json'), 'utf8');
  return JSON.parse(
    text.split('$FIXTURES').join(tilde(fixtures)).split('$REALROOT').join(realpathSync(root)).split('$ROOT').join(root),
  );
}
