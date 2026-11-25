import type { TeamSkill } from './protocol.ts';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, normalize, resolve, relative } from 'node:path';
import { teamRoot } from './roots.ts';

export const home = homedir(),
  teams = teamRoot();
export const skills = process.env.AGENT_SKILLS_DIR || join(home, '.agents/skills');
export function read(path: string) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}
export function ls(path: string) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
export function dir(path: string) {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory();
}
export function installed(base: string) {
  return ls(base)
    .filter((n) => statSync(join(base, n, 'SKILL.md'), { throwIfNoEntry: false })?.isFile())
    .sort();
}
export function roleConfig() {
  const roles: Record<string, { agent: string | null; tier: string | null; text: string }> = {},
    known = ['anti-ai', 'security', 'perf-a11y'];
  for (const name of installed(join(teams, 'skills'))) {
    if (name.startsWith('team-')) {
      const role = name.slice(5);
      known.push(role);
      const text = read(join(teams, 'skills', name, 'SKILL.md')).match(/\*\*Runs on:\*\*\s*(.+)/)?.[1];
      if (text)
        roles[role] = {
          agent: null,
          tier: text.match(/tier (top|work|fast)/)?.[1] || null,
          text: text.trim().slice(0, 200),
        };
    } else if (['orchestrator', 'researcher', 'solution-architect'].includes(name)) known.push(name);
  }
  return {
    roles_cfg: { tiers: {}, order: ['fast', 'work', 'top'], roles },
    known_roles: known.sort(),
    skills_installed: installed(skills),
  };
}
export function checkout(cwd: string) {
  if (!cwd) return null;
  for (let root = resolve(cwd); ; root = dirname(root)) {
    const git = join(root, '.git'),
      st = statSync(git, { throwIfNoEntry: false });
    if (st?.isDirectory()) return root;
    if (st?.isFile()) {
      const target = resolve(
        root,
        read(git)
          .trim()
          .replace(/^gitdir: /, ''),
      );
      const common = read(join(target, 'commondir')).trim();
      return common ? dirname(resolve(target, common)) : null;
    }
    if (dirname(root) === root) return null;
  }
}
export function repoOf(cwd: string) {
  if (!cwd) return ['?', '?'];
  const p = normalize(cwd),
    root = checkout(p);
  if (root) return [basename(root), p === root || p.startsWith(root + '/') ? '(main)' : basename(p)];
  for (const [prefix, worktree] of [
    ['/orca/workspaces/', true],
    ['/orca/projects/', false],
  ] as const) {
    if (p.startsWith(home + prefix)) {
      const [r, w] = p.slice((home + prefix).length).split('/');
      return [r, (worktree && w) || '(main)'];
    }
  }
  if (dirname(p) === home) return [basename(p), '(main)'];
  const parts = p.split('/').filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2) : [parts[0] || '?', '?'];
}
const orcaSkills = new Map<string, { at: number; text: string }>();
function orcaSkill(name = '') {
  const now = Date.now(),
    cached = orcaSkills.get(name);
  if (cached && now - cached.at < 600000) return cached.text;
  let text = '';
  try {
    text = execFileSync('orca', ['skills', ...(name ? ['get', name] : ['list'])], {
      encoding: 'utf8',
      timeout: name ? 15000 : 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {}
  orcaSkills.set(name, { at: now, text });
  return text;
}
function listed(name: string) {
  return orcaSkill()
    .split('\n')
    .some((line) => line.match(/^([a-z0-9][a-z0-9-]*):/)?.[1] === name);
}
export function skillDoc(name: string): TeamSkill | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(name)) return null;
  const path = join(skills, name, 'SKILL.md');
  let body = read(path),
    source = 'không tìm thấy',
    origin = 'missing',
    where = null,
    refs: string[] = [];
  const local = statSync(path, { throwIfNoEntry: false })?.isFile();
  if (local) {
    origin = 'dl';
    const real = dirname(realpathSync(path)),
      lockPath = process.env.AGENT_SKILL_LOCK || join(dirname(skills), '.skill-lock.json');
    let lock: { source?: string } | undefined;
    try {
      lock = JSON.parse(read(lockPath)).skills?.[name];
    } catch {}
    if (real.startsWith(join(teams, 'skills') + '/')) {
      origin = 'own';
      source = 'đội tự viết';
    } else if (lock) source = lock.source || 'skill-lock';
    else {
      source = 'không rõ nguồn';
      for (let p = real; p.startsWith(dirname(realpathSync(skills)) + '/'); p = dirname(p))
        if (dir(join(p, '.git'))) {
          source = basename(p) + ' (git clone)';
          break;
        }
    }
    if (source === 'không rõ nguồn' && listed(name)) source = 'Orca';
    where = path.startsWith(home + '/') ? '~/' + relative(home, path) : path;
    refs = ls(join(dirname(path), 'references'))
      .filter((x) => !x.startsWith('.'))
      .sort();
  } else {
    if (listed(name)) {
      origin = 'orca';
      source = 'orca skills get';
      body = orcaSkill(name);
      if (body) where = 'orca skills get ' + name;
    } else {
      const stack = [join(home, '.hermes/skills')];
      while (stack.length) {
        const p = stack.pop()!;
        if (basename(p) === name && read(join(p, 'SKILL.md'))) {
          source = 'chỉ ở Hermes';
          where = '~/' + relative(home, join(p, 'SKILL.md'));
          break;
        }
        try {
          for (const e of readdirSync(p, { withFileTypes: true })) if (e.isDirectory()) stack.push(join(p, e.name));
        } catch {}
      }
    }
  }
  const front = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(body);
  return {
    name,
    origin,
    source,
    body: local || body ? body.slice(front?.[0].length || 0) : null,
    refs,
    path: where,
    ...(local || body
      ? {
          description: (front?.[1].match(/^description\s*:\s*(.*)$/m)?.[1] || '').trim().replace(/^(['"])(.*)\1$/, '$2'),
        }
      : {}),
  };
}
