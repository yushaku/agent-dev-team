import { existsSync, readFileSync, statSync } from 'node:fs';
import { teams } from './metadata.ts';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export type Time = number | null;
type Event = [string, Time];
type Context = { cwd: string | null; branch: string | null; branch_source?: string };
export type Call = [Time, string, string | null, number, number, number, number, number, string | null, number?, Context?];
export interface Session {
  agent: string;
  id: string;
  cwd: string | null;
  branch: string | null;
  start: Time;
  end: Time;
  originator: string | null;
  skills: Event[];
  tasks: Event[];
  subagent: boolean;
  calls: Call[];
  preview: string;
  role_line: string | null;
  discussion: string | null;
  sid?: string | null;
  hooks?: Record<string, [Time, string]>;
  dispatcher?: boolean;
  search?: Event[];
  runs?: Event[];
  branch_segments?: (Context & { at: Time })[];
  title?: string;
  tool_count?: number;
  discussion_read?: string | null;
  aggregate?: boolean;
  snapshot?: Record<string, Time> | null;
}

export const tsOf = (s?: string): Time => {
  if (!s) return null;
  const stamp = s.replace(' ', 'T');
  const ms = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(stamp) ? stamp : stamp + 'Z');
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000) + Number('0.' + (stamp.match(/\.(\d+)/)?.[1]?.slice(0, 6) || 0));
};
export function json(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
export const aliases: Record<string, string> = Object.fromEntries(
  Object.entries({
    builder: 'build fix qa qa-tests delivery deliver poc',
    reviewer: 'review re-review review+security verify',
    'doc-keeper': 'docs doc',
    designer: 'design ux',
    'perf-a11y': 'perf a11y',
    orchestrator: 'close',
    'tech-lead': 'product spec pm tidy plan arch architect',
    researcher: 'research',
    'support-engineer': 'investigate investigator support',
    'solution-architect': 'solution sa solution-architect arch-review',
  }).flatMap(([role, words]) => words.split(' ').map((w) => [w, role])),
);
const roleFile = /(?:roles|checks)\/([a-z0-9-]+)\.md|skills\/(researcher|solution-architect)\/SKILL\.md|skills\/team-([a-z0-9-]+)\//;
export function role(word: string) {
  if (Object.hasOwn(aliases, word)) return aliases[word];
  if (['anti-ai', 'security', 'perf-a11y', 'tech-lead', 'designer'].includes(word)) return word;
  if (!/^[a-z0-9-]+$/.test(word)) return null;
  const skill = ['orchestrator', 'solution-architect', 'researcher'].includes(word) ? word : 'team-' + word;
  return existsSync(join(teams, 'skills', skill, 'SKILL.md')) ? word : null;
}
export function newSession(agent: string, id: string): Session {
  return {
    agent,
    id,
    cwd: null,
    branch: null,
    start: null,
    end: null,
    originator: null,
    skills: [],
    tasks: [],
    hooks: {},
    dispatcher: false,
    subagent: false,
    calls: [],
    preview: '',
    role_line: null,
    discussion: null,
  };
}
function command(args) {
  let v = typeof args === 'string' ? json(args) : args;
  if (!v && typeof args === 'string')
    return Array.from(args.matchAll(/\bcmd\s*:\s*(["'`])((?:\\.|(?!\1).)*)\1/gs), (m) => m[2].replaceAll('\\n', '\n')).join('\n');
  if (v && !Array.isArray(v) && typeof v === 'object') v = v.command || v.cmd;
  if (Array.isArray(v)) return v.filter((x) => String(x).includes(' ')).join('\n') || v.join(' ');
  return typeof v === 'string' ? v : '';
}
const valueFlags = new Set([
  '-g',
  '--glob',
  '-t',
  '--type',
  '-T',
  '--type-not',
  '-m',
  '--max-count',
  '-A',
  '-B',
  '-C',
  '--include',
  '--exclude',
  '--exclude-dir',
  '-f',
  '--file',
  '--max-depth',
  '--max-columns',
]);
function symbolSearch(cmd: string, cwd: string) {
  if (!cwd) return false;
  const cd = cmd.match(/^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*(?:&&|;)/);
  const rel = cd?.[1]?.replace(/^['"]|['"]$/g, '').replace(/^~(?=\/|$)/, homedir()) || '.';
  let root = resolve(cwd, rel);
  while (!existsSync(join(root, '.codegraph'))) {
    if (root === dirname(root)) return false;
    root = dirname(root);
  }
  const decl = '(?:(?:export\\s+)?(?:async\\s+)?(?:function|class|def|interface|type|const|let|var|func|fn)\\s+)?';
  const ident = decl + '[A-Za-z_$][A-Za-z0-9_$]*',
    symbol = new RegExp('^' + ident + '(?:\\|' + ident + ')*$');
  const shape = /[a-z][A-Z]|[A-Z][a-z]+[A-Z]|[A-Za-z]_[A-Za-z]|^(?:function|class|def|interface|type|func|fn)\s/;
  function search(argv: string[]) {
    while (argv.length && (['rtk', 'command', 'sudo', 'git'].includes(argv[0]) || argv[0].includes('='))) argv.shift();
    if (!['rg', 'grep', 'egrep'].includes(basename(argv.shift() || ''))) return false;
    const pats = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '-e' || a === '--regexp') {
        pats.push(argv[++i] || '');
        continue;
      }
      if (a.startsWith('--regexp=')) {
        pats.push(a.slice(9));
        continue;
      }
      if (valueFlags.has(a)) {
        i++;
        continue;
      }
      if (a.startsWith('-')) continue;
      if (!pats.length) pats.push(a);
      break;
    }
    return pats.some((p) => symbol.test(p) && shape.test(p));
  }
  return shellWords(cmd.replaceAll('\\b', ''), true).some(search);
}
function shellWords(cmd: string, splitCommands: boolean) {
  const commands: string[][] = [[]];
  let word = '',
    quote = '',
    escaped = false;
  for (const ch of cmd) {
    if (escaped) {
      if (quote && ch !== quote && ch !== '\\') word += '\\';
      word += ch;
      escaped = false;
    } else if (ch === '\\' && quote !== "'") escaped = true;
    else if (quote) {
      if (ch === quote) quote = '';
      else word += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch) || (splitCommands && /[;&|()<>]/.test(ch))) {
      if (word) {
        commands.at(-1)!.push(word);
        word = '';
      }
      if (!/\s/.test(ch)) commands.push([]);
    } else word += ch;
  }
  if (quote || escaped) return [];
  if (word) commands.at(-1)!.push(word);
  return commands;
}
function tool(s: Session, name: string, args, ts: Time) {
  const cmd = command(args),
    a = typeof args === 'string' ? json(args) : args;
  if ((s.tool_count || 0) < 5 && !s.discussion_read) {
    const m = name === 'Read' && roleFile.exec(a?.file_path || a?.path || '');
    s.discussion_read =
      m && ['researcher', 'solution-architect'].includes(m[1] || m[2])
        ? m[1] || m[2]
        : cmd.match(/\b(?:cat|sed|head)\b[^;&|\n]*\b(?:roles\/|skills\/)(researcher|solution-architect)(?:\.md|\/SKILL\.md)/i)?.[1]?.toLowerCase() || null;
  }
  s.tool_count = (s.tool_count || 0) + 1;
  const search = (k: string) => (s.search ??= []).push([k, ts]);
  if (
    /codegraph/i.test(name) ||
    /(?:^|[;&|(\s'"`])codegraph\s+(?:explore|query|node|callers|callees|impact|affected|files|context|search)\b|codegraph_/.test(cmd)
  )
    search('codegraph');
  else if (/^(read|view|read_file)$/i.test(name))
    search(['limit', 'offset', 'start_line', 'end_line', 'view_range', 'line_range'].some((k) => a?.[k]) ? 'read_part' : 'read_full');
  else if (/^(grep|glob|find_files|search_files|agentgrep)$/i.test(name)) search(/glob|find/i.test(name) ? 'find' : 'grep');
  else {
    for (const [kind, re] of Object.entries({
      rg: /(?:^|[;&|(\s'"`])rg\s/,
      grep: /(?:^|[;&|(\s'"`])grep\s/,
      find: /(?:^|[;&|(\s'"`])(?:find|fd)\s/,
      read_full: /(?:^|[;&(\s'"`])cat\s+[^|<>]*[\w/.]/,
      read_part: /(?:^|[;&(\s'"`])(?:head|tail|sed\s+-n)\s+[^|]*[\p{L}\p{N}_/.]+\.[\p{L}\p{N}_]+/u,
    }))
      if (re.test(cmd)) search(kind);
    if (/(?:^|[;&|(\s'"`])(?:rg|grep)\s/.test(cmd) && symbolSearch(cmd, s.cwd)) search('rg_symbol');
  }
  if (name === 'Skill' && s.agent === 'claude') {
    const skill = String(a?.skill || a?.name || a?.command || '')
      .split(':')
      .pop()
      ?.replace(/^[/ ]+|[/ ]+$/g, '');
    if (skill) s.skills.push([skill, ts]);
  } else if (s.agent !== 'hermes' && (s.agent !== 'claude' || ['Read', 'Bash'].includes(name))) {
    const raw = typeof args === 'string' ? args : JSON.stringify(args);
    for (const re of [/\/skills\/([\w.-]+)\/SKILL\.md/g, /orca skills get ([\w.-]+)/g]) for (const m of raw.matchAll(re)) s.skills.push([m[1], ts]);
  }
  for (const m of cmd.matchAll(
    /(?:^|[;&|(\n]|\bsh\s+-l?c\s+['"])\s*(?:rtk\s+(?:proxy\s+)?)?orca\s+orchestration\s+(worker-start|task-create|dispatch|run-use)\b(?![^;&|\n]*--help)/g,
  )) {
    s.dispatcher = true;
    const flag = m[1] === 'run-use' ? '--id' : '--run';
    const tail = cmd.slice(m.index + m[0].length).split(/[;\n]/, 1)[0];
    const argv = shellWords(tail, false)[0] || [];
    for (const [i, arg] of argv.entries()) {
      const run = arg === flag ? argv[i + 1] : arg.startsWith(flag + '=') ? arg.slice(flag.length + 1) : '';
      if (run && /^run_[0-9a-z]+$/.test(run) && s.runs?.at(-1)?.[0] !== run) (s.runs ??= []).push([run, ts]);
    }
  }
}
function tasks(s: Session, txt: string, ts: Time) {
  for (const m of txt.matchAll(/Your task ID is:\s*(task_[0-9a-f]+)/g)) if (s.tasks.at(-1)?.[0] !== m[1]) s.tasks.push([m[1], ts]);
}
function hook(s: Session, txt: string, ts: Time) {
  const head = (txt || '').slice(0, 200);
  if (head.includes('PONYTAIL MODE ACTIVE')) s.hooks!.ponytail ??= [ts, head.match(/level:\s*([\w-]+)/)?.[1] || ''];
}
function finish(s: Session, first: string) {
  s.preview = Array.from(first.replace(/\s+/g, ' ').trim()).slice(0, 160).join('');
  const line = first.match(/^\s*role\s*:\s*(.+)$/im)?.[1] || '';
  const m = roleFile.exec(line);
  s.role_line = m ? role(m[1] || m[2] || m[3]) || m[1] || m[2] || m[3] : role(line.match(/^\s*([a-z][\w+-]*)/i)?.[1]?.toLowerCase() || '');
  const head = first.slice(0, 400);
  s.discussion =
    s.subagent || s.title?.startsWith('Subagent:')
      ? null
      : /\blàm\s+researcher\b|\b(?:act|work)\s+as\s+(?:the\s+)?researcher\b|^\s*role\s*:\s*research(er)?\b/im.test(head)
        ? 'researcher'
        : /\blàm\s+(?:solution\s+architect(?:ure)?|SA)\b|\b(?:act|work)\s+as\s+(?:the\s+)?solution\s+architect\b|^\s*role\s*:\s*solution\s+architect(?:ure)?\b/im.test(
              head,
            )
          ? 'solution-architect'
          : s.discussion_read || null;
  const tid = first.match(/Your task ID is:\s*(task_[0-9a-f]+)/)?.[1];
  if (tid && !s.tasks.some((x) => x[0] === tid)) s.tasks.unshift([tid, s.start]);
  return s;
}
function bounds(s: Session, ts: Time) {
  if (ts) {
    s.start = Math.min(s.start ?? ts, ts);
    s.end = Math.max(s.end ?? ts, ts);
  }
}
function branch(s: Session, ts: Time, cwd, branch, source = 'message_context'): Context {
  const prev = s.branch_segments?.at(-1);
  const ctx = {
    cwd: cwd || prev?.cwd || null,
    branch: branch ?? (cwd && cwd !== prev?.cwd ? null : (prev?.branch ?? null)),
    branch_source: branch != null ? source : cwd && cwd !== prev?.cwd ? 'unavailable' : prev?.branch_source || 'unavailable',
  };
  if (!prev || ctx.cwd !== prev.cwd || ctx.branch !== prev.branch || ctx.branch_source !== prev.branch_source)
    (s.branch_segments ??= []).push({ ...ctx, at: ts });
  return ctx;
}
export function parseFile(agent: string, path: string, text: string, ws: Record<string, string> = {}) {
  const s = newSession(agent, basename(path).replace(/\.jsonl?$/, ''));
  let first = '',
    ctx: Context = { cwd: null, branch: null },
    turn = [null, null],
    lastTotal = null;
  const turns = new Map(),
    records = new Map<string, Call>(),
    counts: Call[] = [];
  if (agent === 'claude') {
    s.sid = null;
    s.subagent = path.includes('/subagents/');
  }
  if (agent === 'copilot') {
    s.id = ws.id || basename(dirname(path));
    s.start = tsOf(ws.created_at);
    s.cwd = ws.cwd || null;
    s.branch = ws.branch || null;
    s.originator = ws.client_name || null;
    s.snapshot = null;
    delete s.hooks;
    delete s.dispatcher;
  }
  if (agent === 'jcode') {
    const d = JSON.parse(text);
    s.id = d.id || s.id;
    s.cwd = d.working_dir ?? null;
    s.title = d.title || '';
    s.originator = d.provider_key ?? null;
    s.subagent = !!d.parent_id;
    if (s.cwd) {
      try {
        let git = join(s.cwd, '.git');
        if (statSync(git).isFile()) git = resolve(s.cwd, readFileSync(git, 'utf8').split('gitdir:')[1].trim());
        const ref = readFileSync(join(git, 'HEAD'), 'utf8').trim();
        s.branch = ref.startsWith('ref: refs/heads/') ? ref.slice(16) : ref.slice(0, 8);
      } catch {}
    }
    for (const m of d.messages || []) {
      const ts = tsOf(m.timestamp);
      bounds(s, ts);
      if (m.role === 'user') {
        const txt = (m.content || [])
          .filter((c) => c?.type === 'text')
          .map((c) => c.text || '')
          .join(' ');
        tasks(s, txt, ts);
        if (!first && !txt.trimStart().startsWith('<')) first = txt;
      } else if (m.role === 'assistant') {
        const u = m.token_usage;
        if (u && Object.keys(u).length)
          s.calls.push([
            ts,
            d.model || '?',
            null,
            u.input_tokens || 0,
            u.cache_read_input_tokens || 0,
            u.cache_creation_input_tokens || 0,
            u.output_tokens || 0,
            0,
            null,
          ]);
        for (const c of m.content || []) if (c?.type === 'tool_use') tool(s, c.name, c.input || {}, ts);
      }
    }
    s.start ??= tsOf(d.created_at);
    s.end ??= tsOf(d.updated_at);
    finish(s, first);
    if (d.system_prompt?.startsWith('You are the ambient agent')) {
      s.role_line = s.discussion = null;
      s.tasks = [];
    }
    return s;
  }
  for (const line of text.split('\n')) {
    if (agent === 'codex' && /"(custom_tool_call_output|function_call_output|reasoning|item_completed|world_state)"/.test(line.slice(0, 220))) continue;
    const d = json(line);
    if (!d) continue;
    const ts = tsOf(d.timestamp),
      t = d.type;
    if (agent === 'claude') {
      if (d.attachment?.type === 'hook_success') {
        hook(s, d.attachment.content, ts);
        continue;
      }
      if (!/"type":"(?:user|assistant)"/.test(line) || !['user', 'assistant'].includes(t)) continue;
      bounds(s, ts);
      s.sid ||= d.sessionId ?? null;
      s.cwd ||= d.cwd ?? null;
      s.branch ||= d.gitBranch ?? null;
      s.originator ||= d.entrypoint ?? null;
      ctx = branch(s, ts, d.cwd, d.gitBranch);
      const m = d.message || {},
        content = m.content;
      if (t === 'user') {
        const txt =
          typeof content === 'string'
            ? content
            : (content || [])
                .filter((c) => c?.type === 'text')
                .map((c) => c.text || '')
                .join(' ');
        if (!first && !d.isMeta && !txt.trimStart().startsWith('<')) first = txt;
        tasks(s, txt, ts);
        for (const [, raw] of txt.matchAll(/<command-name>\/([^<\s]+)<\/command-name>/g)) {
          const name = raw.split(':').at(-1);
          if (
            raw.includes(':') ||
            [process.env.AGENT_SKILLS_DIR || join(homedir(), '.agents/skills'), join(homedir(), '.claude/skills')].some((dir) => existsSync(join(dir, name)))
          )
            s.skills.push([name, ts]);
        }
      } else {
        const u = m.usage;
        if (u && m.id && m.model && m.model !== '<synthetic>')
          records.set(m.id, [
            ts,
            m.model,
            d.effort || d.perTurnEffort || null,
            u.input_tokens || 0,
            u.cache_read_input_tokens || 0,
            u.cache_creation_input_tokens || 0,
            u.output_tokens || 0,
            u.output_tokens_details?.thinking_tokens || 0,
            m.id,
            0,
            ctx,
          ]);
        if (Array.isArray(content)) for (const c of content) if (c?.type === 'tool_use') tool(s, c.name, c.input || {}, ts);
      }
    } else if (agent === 'codex') {
      const p = d.payload || {};
      bounds(s, ts);
      if (t === 'session_meta') {
        s.id = p.id || p.session_id || s.id;
        s.cwd = p.cwd ?? null;
        s.originator = p.originator ?? null;
        s.branch = p.git?.branch ?? null;
        ctx = branch(s, ts, p.cwd, s.branch, 'session');
      } else if (t === 'turn_context') {
        turn = [p.model ?? null, p.effort || p.reasoning_effort || null];
        s.cwd ||= p.cwd ?? null;
        ctx = branch(s, ts, p.cwd, p.git?.branch);
        if (p.turn_id) turns.set(p.turn_id, [turn, ctx]);
      } else if (t === 'token_usage_record' || (t === 'event_msg' && p.type === 'token_count')) {
        const record = t === 'token_usage_record',
          u = record ? p.usage || {} : p.info?.last_token_usage;
        const total = p.info?.total_token_usage?.total_tokens ?? null;
        if (!record && (!u || total === lastTotal)) continue;
        if (!record) lastTotal = total;
        const [[model, eff], context] = (record && turns.get(p.turn_id)) || [turn, ctx];
        const cached = u.cached_input_tokens || 0;
        (record ? s.calls : counts).push([
          ts,
          model || '?',
          eff,
          Math.max(0, (u.input_tokens || 0) - cached),
          cached,
          u.cache_write_input_tokens || 0,
          u.output_tokens || 0,
          u.reasoning_output_tokens || 0,
          null,
          0,
          context,
        ]);
      } else if (t === 'response_item') {
        if (p.type === 'message' && p.role === 'developer') for (const c of p.content || []) hook(s, c?.text, ts);
        if (p.type === 'message' && p.role === 'user') {
          const txt = (p.content || []).map((c) => c?.text || '').join(' ');
          tasks(s, txt, ts);
          if (!first && !/^(<|# AGENTS.md)/.test(txt.trimStart())) first = txt;
        } else if (['custom_tool_call', 'function_call', 'local_shell_call'].includes(p.type) && p.name !== 'apply_patch')
          tool(s, p.name, p.input || p.arguments || p.action || '', ts);
      }
    } else if (agent === 'copilot') {
      if (
        !/"type":"(?:session\.(?:start|resume|usage_record|usage_checkpoint|shutdown)|user\.message|model\.model_call_success|skill\.invoked(?:_ref)?)"/.test(
          line.slice(0, 48),
        )
      )
        continue;
      bounds(s, ts);
      const p = d.data || {};
      if (t === 'session.start' || t === 'session.resume') {
        s.cwd ||= p.context?.cwd ?? null;
        s.branch ||= p.context?.branch ?? null;
      }
      if (t === 'user.message') {
        const txt = p.content || '';
        tasks(s, txt, ts);
        if (!first && !txt.trimStart().startsWith('<')) first = txt;
      }
      if (t.startsWith('skill.invoked') && p.name) s.skills.push([p.name, ts]);
      if (t === 'session.usage_record') {
        const u = p.usage || {},
          a = u.accounting || {},
          key = 'cp:' + (a.sourceSessionId || s.id) + ':' + (a.sequence || d.id || 'None');
        const cr = u.cacheReadTokens || 0,
          cw = u.cacheWriteTokens || 0;
        records.set(key, [
          ts,
          u.model || '?',
          u.reasoningEffort ?? null,
          Math.max(0, (u.inputTokens || 0) - cr - cw),
          cr,
          cw,
          u.outputTokens || 0,
          u.reasoningTokens || 0,
          key,
          u.initiator === 'user' ? u.cost || 0 : 0,
        ]);
      }
      if (t === 'session.shutdown' || t === 'session.usage_checkpoint') {
        const a = p.accountingSnapshot || {},
          td = a.tokenDetails || {};
        s.snapshot = {
          ts,
          premium: a.totalPremiumRequestCost || 0,
          fin: td.input?.tokenCount || 0,
          cr: td.cache_read?.tokenCount || 0,
          cw: td.cache_write?.tokenCount || 0,
          out: td.output?.tokenCount || 0,
          requests: Object.keys(a.modelMetrics || {}).reduce((n, k) => n + (a.modelMetrics[k]?.requests?.count || 0), 0),
        };
      }
    }
  }
  if (agent === 'claude') s.id = s.subagent ? (s.sid || '?') + ':' + s.id : s.sid || s.id;
  if (agent === 'codex') {
    if (!s.calls.length) s.calls = counts;
  } else s.calls = Array.from(records.values()).sort((a, b) => (a[0] || 0) - (b[0] || 0));
  return finish(s, first);
}
export function parseHermes(r, messages) {
  const s = newSession('hermes', r.id);
  delete s.hooks;
  s.title = r.title || '';
  s.tool_count = 0;
  s.runs = [];
  s.search = [];
  s.cwd = r.cwd ?? null;
  s.branch = r.git_branch ?? null;
  s.start = r.started_at;
  s.end = r.ended_at || r.started_at;
  s.sid = r.id;
  s.originator = 'hermes:' + (r.source || '?');
  s.aggregate = true;
  let first = '';
  for (const m of messages) {
    if (m.role === 'user') {
      let txt = (m.content || '').trimStart();
      const match = txt.match(/^\[IMPORTANT: The user has invoked the "([^"]+)" skill/);
      if (match) {
        s.skills.push([match[1], m.timestamp]);
        txt = txt.split('The user has provided the following instruction alongside the skill invocation:').slice(1).join('');
      }
      if (!first && !/^[<\[]/.test(txt)) first = txt;
    } else if (m.role === 'assistant') {
      const calls = json(m.tool_calls);
      if (Array.isArray(calls)) for (const c of calls) tool(s, c?.function?.name, c?.function?.arguments || '', m.timestamp);
    } else if (m.role === 'tool' && m.tool_name === 'skill_view') {
      const name = json(m.content)?.name;
      if (name) s.skills.push([name, m.timestamp]);
    }
  }
  delete s.tool_count;
  s.discussion_read ??= null;
  s.calls = [
    [
      s.start,
      r.model || 'unknown',
      null,
      r.input_tokens || 0,
      r.cache_read_tokens || 0,
      r.cache_write_tokens || 0,
      r.output_tokens || 0,
      r.reasoning_tokens || 0,
      null,
    ],
  ];
  return finish(s, first);
}
