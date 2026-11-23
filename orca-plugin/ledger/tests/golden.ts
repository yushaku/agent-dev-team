// Python's output for the existing fixtures, frozen as committed JSON in tests/golden/. The Python
// dashboard produced these once, against the team fixture in tests/fixtures/team and reproducible git
// commits; its sources and the recorders are in git history (the commit that adds this directory, and its
// parent). Placeholders: $ROOT and $REALROOT stand for the scratch directory, $FIXTURES for tests/fixtures
// written the way the dashboard prints a path under the home directory (with a leading ~). They are
// substituted in the parsed values and keys, never in the serialized text, so a path containing quotes,
// backslashes or other JSON-significant characters cannot break the file.
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const fixtures = join(import.meta.dirname, 'fixtures');
const tilde = (path: string) => (path.startsWith(homedir() + '/') ? '~' + path.slice(homedir().length) : path);

export function golden(label: string, root: string): any {
  const replacements: [string, string][] = [
    ['$FIXTURES', tilde(fixtures)],
    ['$REALROOT', realpathSync(root)],
    ['$ROOT', root],
  ];
  const fill = (text: string) => replacements.reduce((out, [from, to]) => out.split(from).join(to), text);
  const walk = (value: any): any =>
    typeof value === 'string'
      ? fill(value)
      : Array.isArray(value)
        ? value.map(walk)
        : value && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [fill(key), walk(item)]))
          : value;
  return walk(JSON.parse(readFileSync(join(import.meta.dirname, 'golden', label + '.json'), 'utf8')));
}
