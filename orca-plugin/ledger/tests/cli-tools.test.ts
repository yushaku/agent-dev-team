import './team-env.ts'; // first: the team root is read when modules load, and one process may run every test file
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { discover, install } from '../commands.ts';

// Contracts of the removed Python test_cli_tools.py: discovery precedence and provenance, on temporary trees.
function tree(t: import('node:test').TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'cli-tools-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = (path: string, text = '#!/bin/sh\nexit 0\n', mode = 0o755) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text, { mode });
    chmodSync(path, mode);
    return path;
  };
  return { root, file };
}
const only = (path: string, dir: string) => discover(dir).tools[0];

test('Homebrew receipts tell requested apps from dependencies from unknown', (t) => {
  const { root, file } = tree(t);
  const command = file(join(root, 'Cellar/example/1.0/bin/example'));
  const kind = () => discover(join(root, 'Cellar/example/1.0/bin')).tools[0].install_kind;
  assert.equal(kind(), 'unknown', 'no receipt');
  const receipt = join(root, 'Cellar/example/1.0/INSTALL_RECEIPT.json');
  for (const [metadata, expected] of [
    [{ installed_on_request: true, installed_as_dependency: true }, 'app'],
    [{ installed_on_request: false }, 'dependency'],
    [{ installed_as_dependency: true }, 'dependency'],
    [{ installed_as_dependency: false }, 'unknown'],
    [{ installed_on_request: 'false' }, 'unknown'],
    [{}, 'unknown'],
    [[], 'unknown'],
  ] as const) {
    writeFileSync(receipt, JSON.stringify(metadata));
    assert.equal(kind(), expected, JSON.stringify(metadata));
  }
  writeFileSync(receipt, 'broken JSON');
  assert.equal(kind(), 'unknown');
  file(join(root, 'Caskroom/example/.metadata/INSTALL_RECEIPT.json'), JSON.stringify({ installed_on_request: true }), 0o644);
  file(join(root, 'Caskroom/example/1.0/bin/example'));
  assert.equal(discover(join(root, 'Caskroom/example/1.0/bin')).tools[0].install_kind, 'app');
  void command;
});

test('the command manual is preferred to package metadata, and a broken manual falls back', (t) => {
  const { root, file } = tree(t);
  const base = join(root, 'Cellar/extra-package/1.0');
  file(join(base, 'bin/extra'));
  file(join(base, '.brew/extra-package.rb'), '  desc "Package purpose"\n', 0o644);
  const dir = join(base, 'bin');
  assert.deepEqual([only('', dir).description, only('', dir).description_source], ['Package purpose', 'Homebrew · extra-package']);
  const manual = join(base, 'share/man/man1/extra.1.gz');
  mkdirSync(join(manual, '..'), { recursive: true });
  writeFileSync(manual, gzipSync('.SH NAME\nextra \\- inspect local files\n.SH SYNOPSIS\nnot a description\n'));
  assert.deepEqual([only('', dir).description, only('', dir).description_source], ['inspect local files', 'man · extra(1)']);
  writeFileSync(manual, 'broken gzip');
  assert.equal(only('', dir).description, 'Package purpose');
});

test('npm and Python tool descriptions come from the matching installed package only', (t) => {
  const { root, file } = tree(t);
  const package_ = join(root, 'node_modules/@vendor/extra');
  file(join(package_, 'bin/extra'));
  const metadata = join(package_, 'package.json');
  const npm = () => only('', join(package_, 'bin'));
  writeFileSync(metadata, JSON.stringify({ description: 'Inspect local files' }));
  assert.deepEqual([npm().description, npm().description_source], ['Inspect local files', 'npm · @vendor/extra']);
  writeFileSync(metadata, JSON.stringify({ description: { invalid: true } }));
  assert.deepEqual([npm().description, npm().description_source], ['', ''], 'a description that is not text is ignored');
  writeFileSync(metadata, 'broken JSON');
  assert.deepEqual([npm().description, npm().description_source], ['', '']);

  const venv = join(root, 'uv/tools/new-tool');
  file(join(venv, 'bin/new'));
  const site = join(venv, 'lib/python3.12/site-packages');
  file(join(site, 'dependency.dist-info/METADATA'), 'Name: dependency\nSummary: Incorrect description\n', 0o644);
  const uv = () => only('', join(venv, 'bin'));
  assert.deepEqual([uv().description, uv().description_source], ['', ''], "another package's metadata is not this tool's");
  file(join(site, 'new_tool.dist-info/METADATA'), 'Name: New_Tool\nSummary: Check local projects\n', 0o644);
  assert.deepEqual([uv().description, uv().description_source], ['Check local projects', 'uv · new-tool']);
});

test('the manual parser reads the NAME section in common formats and nothing else', (t) => {
  const { root, file } = tree(t);
  const described = (name: string, manual: string) => {
    const base = join(root, name);
    file(join(base, 'bin', name));
    file(join(base, 'share/man/man1', name + '.1'), manual, 0o644);
    return discover(join(base, 'bin')).tools[0].description;
  };
  assert.equal(described('mdoc', '.Sh NAME\n.Nm example\n.Nd inspect projects\n.Sh SYNOPSIS\nother'), 'inspect projects');
  assert.equal(described('man', '.SH "NAME"\nexample \\- inspect \\fBprojects\\fP\n.SH DESCRIPTION\nother'), 'inspect projects');
  assert.equal(described('dash', '.SH "NAME"\nexample - inspect \\.files\n.SS Synopsis\nother'), 'inspect .files');
  assert.equal(described('nameless', '.SH DESCRIPTION\nnot a summary'), '');
});

test('the live inventory follows PATH precedence and ignores what is not a command', (t) => {
  const { root, file } = tree(t);
  const first = join(root, 'first'),
    second = join(root, 'second');
  mkdirSync(first);
  mkdirSync(second);
  const installed = file(join(root, 'Cellar/new-package/2.5/bin/new-command'), '#!/bin/sh\ntouch ' + join(root, 'should-not-exist'));
  symlinkSync(installed, join(first, 'new-command'));
  symlinkSync(installed, join(second, 'new-command'));
  symlinkSync(join(root, 'missing'), join(first, 'broken'));
  file(join(first, 'not-executable'), 'data', 0o644);
  mkdirSync(join(first, 'directory'), { mode: 0o755 });
  const path = [first, first, join(root, 'absent'), second].join(delimiter);
  const data = discover(path);
  assert.equal(data.tools.length, 1);
  const tool = data.tools[0];
  assert.equal(tool.name, 'new-command');
  assert.equal(tool.path, join(first, 'new-command'), 'the first PATH entry wins');
  assert.equal(tool.source, 'Homebrew');
  assert.equal(tool.package, 'new-package');
  assert.equal(tool.version, '2.5');
  assert.equal(tool.install_kind, 'unknown');
  assert.equal(tool.alternatives[0].path, join(second, 'new-command'), 'later copies are alternatives');
  assert.deepEqual({ ...data.sources }, { Homebrew: 1 });
  assert.equal(data.directories.length, 3, 'a duplicate PATH entry counts once');
  assert.equal(existsSync(join(root, 'should-not-exist')), false, 'discovery never runs a command');
  unlinkSync(join(first, 'new-command'));
  unlinkSync(join(second, 'new-command'));
  assert.deepEqual(discover(path).tools, []);
});

test('provenance comes from paths and local package metadata', (t) => {
  const { root, file } = tree(t);
  const package_ = join(root, 'node_modules/@vendor/unknown-tool');
  const command = file(join(package_, 'bin/run.js'));
  file(join(package_, 'package.json'), JSON.stringify({ version: '3.1' }), 0o644);
  assert.deepEqual(install(command), ['npm', '@vendor/unknown-tool', '3.1']);
  writeFileSync(join(package_, 'package.json'), 'invalid JSON');
  assert.deepEqual(install(command), ['npm', '@vendor/unknown-tool', ''], 'invalid metadata leaves the version unknown');
  assert.deepEqual(install(join(root, 'uv/tools/new-tool/bin/run')), ['uv', 'new-tool', '']);
  assert.deepEqual(install(join(root, 'pipx/venvs/another/bin/run')), ['pipx', 'another', '']);
  assert.deepEqual(install(join(root, 'custom/run')), [join(root, 'custom'), '', ''], 'anything else is grouped by its folder');
  const saved = process.env.CARGO_HOME;
  process.env.CARGO_HOME = join(root, 'rust');
  t.after(() => {
    if (saved === undefined) delete process.env.CARGO_HOME;
    else process.env.CARGO_HOME = saved;
  });
  assert.deepEqual(install(join(root, 'rust/bin/run')), ['Cargo', '', '']);
});

test('application and local-share subdirectories share their root group', () => {
  for (const path of ['/Applications/First.app/Contents/MacOS/tool', '/Applications/Second.app/Contents/Resources/bin/tool'])
    assert.equal(install(path)[0], '/Applications');
  assert.notEqual(install('/ApplicationsExtra/bin/tool')[0], '/Applications');
  assert.equal(install(join(homedir(), 'Library/pnpm/bin/example'))[0], 'pnpm');
  const share = join(homedir(), '.local/share');
  for (const path of [join(share, 'first/versions/1/bin/tool'), join(share, 'second/bin/tool')]) assert.equal(install(path)[0], share);
  assert.equal(install(join(share, 'uv/tools/example/bin/tool'))[0], 'uv');
  assert.equal(install(join(share, 'node_modules/example/bin/tool'))[0], 'npm');
  const outside = join(homedir(), '.local/share-extra/bin/tool');
  assert.equal(install(outside)[0], join(outside, '..'));
});

test('default system commands are excluded without hiding installed copies of the same name', (t) => {
  const { root, file } = tree(t);
  const system = join(root, 'system'),
    downloaded = join(root, 'downloaded');
  mkdirSync(system);
  mkdirSync(downloaded);
  symlinkSync('/bin/sh', join(system, 'default-only'));
  symlinkSync('/bin/sh', join(system, 'extra-command'));
  const executable = file(join(downloaded, 'extra-command'));
  const data = discover([system, downloaded].join(delimiter));
  assert.deepEqual(
    data.tools.map((tool) => tool.name),
    ['extra-command'],
  );
  assert.equal(data.tools[0].path, executable);
  assert.deepEqual(data.tools[0].alternatives, []);
  assert.ok(!('Hệ thống' in data.sources));
  for (const path of ['/usr/bin/default', '/usr/libexec/default', '/System/Library/default', '/Library/Apple/usr/bin/default'])
    assert.equal(install(path)[0], 'Hệ thống', path);
  assert.notEqual(install('/usr/local/bin/downloaded')[0], 'Hệ thống');
});

test('the login shell PATH comes first, and a failing shell falls back to this process PATH with a warning', (t) => {
  const { root, file } = tree(t);
  const saved = process.env.PATH;
  process.env.PATH = '/server/bin';
  t.after(() => {
    process.env.PATH = saved;
  });
  const good = file(join(root, 'good-shell'), '#!/bin/sh\nprintf "startup noise\\n__TEAM_DASHBOARD_PATH__/user/bin:/usr/bin\\n"\n');
  const ok = discover(undefined, good);
  assert.deepEqual(ok.directories.slice(0, 3), ['/user/bin', '/usr/bin', '/server/bin']);
  assert.deepEqual(ok.warnings, []);
  const bad = file(join(root, 'bad-shell'), '#!/bin/sh\nexit 3\n');
  const fallback = discover(undefined, bad);
  assert.deepEqual(fallback.directories, ['/server/bin']);
  assert.ok(fallback.warnings.length > 0);
});

test('an unreadable directory keeps the rest of the inventory and says so', (t) => {
  const { root, file } = tree(t);
  const locked = join(root, 'locked'),
    open = join(root, 'open');
  mkdirSync(locked);
  mkdirSync(open);
  file(join(open, 'visible'));
  chmodSync(locked, 0o000);
  let data: ReturnType<typeof discover>;
  try {
    data = discover([locked, open].join(delimiter));
  } finally {
    chmodSync(locked, 0o755); // before the scratch directory is removed
  }
  assert.deepEqual(
    data.tools.map((tool) => tool.name),
    ['visible'],
  );
  assert.ok(data.warnings.some((w) => w.includes(locked)) || process.getuid?.() === 0);
});

test('a login shell that cannot even be found falls back to this process PATH with a warning', (t) => {
  const saved = process.env.PATH;
  process.env.PATH = '/server/bin';
  t.after(() => {
    process.env.PATH = saved;
  });
  const data = discover(undefined, () => {
    throw new Error('cannot resolve the effective user');
  });
  assert.deepEqual(data.directories, ['/server/bin']);
  assert.ok(data.warnings.length > 0);
  // With an explicit PATH the shell is never needed, so nothing about it can fail the call.
  assert.deepEqual(
    discover('/server/bin', () => {
      throw new Error('never called');
    }).warnings,
    [],
  );
});
