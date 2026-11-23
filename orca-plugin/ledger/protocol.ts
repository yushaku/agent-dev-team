type Counts = Record<string, number>;
export interface FeatureRun {
  id: string;
  repo: string;
  branch: string;
  variant: 'orca' | 'direct' | null;
  orca_loading: boolean;
  run_ids: string[];
  first_activity: number | null;
  last_activity: number | null;
  lead_seconds: number | null;
  tokens: number;
  orchestrator_tokens: number | null;
  worker_tokens: number | null;
  session_count: number;
  agents: string[];
  loaded_skills: Counts;
  fix_rounds: { count: number; source: string };
  gate2_findings: number | null;
  delivered: boolean | null;
  escaped_defects: number | null;
  fix_commits: FixCommit[];
  median_days_to_surface: number | null;
  source: string | null;
  merge_sha?: string;
  merged_at?: number;
  sources: Record<string, string | string[] | number>;
  heuristics: string[];
}
interface FixCommit {
  sha: string;
  subject: string;
  date: string;
  source: string;
  days_after_merge?: number;
}
export interface RepositoryMetrics {
  stale?: boolean;
  loading?: boolean;
  analysis_ms?: number;
  features: Record<
    string,
    {
      merge_sha: string;
      merged_at: number;
      fix_commits: FixCommit[];
      escaped_defects: number;
      median_days_to_surface: number | null;
      source: string;
    }
  >;
  unattributed_fix_commits: FixCommit[];
  error: string | null;
}
interface FeatureScope {
  orca_loading: boolean;
  runs: FeatureRun[];
  repositories: Record<string, RepositoryMetrics>;
}
type RtkTotals = { n: number; input: number; output: number; saved: number; pct: number };
export interface DashboardData {
  generated_at: number;
  days: number;
  range_start: number;
  dates: string[];
  build_ms: number;
  sessions: UsageRow[];
  attribution: {
    total: number;
    assigned: number;
    unassigned: number;
    inferred: number;
    aggregate: number;
    undated: number;
  };
  features: FeatureScope & {
    comparison: {
      variant: string;
      count: number;
      median_tokens: number | null;
      median_fix_rounds: number | null;
      gate2_findings: number | null;
      gate2_known: number;
    }[];
    attribution: { total: number; assigned: number; unassigned: number };
  };
  copilot_dirs: number;
  orca: { available: boolean; error: string | null; fetched_at: number | null; runs: DashboardRun[] };
  roles_cfg: {
    tiers: Record<string, string>;
    order: string[];
    roles: Record<string, { agent: string | null; tier: string | null; text: string }>;
  };
  known_roles: string[];
  skills_installed: string[];
  rtk:
    | { available: false }
    | {
        available: true;
        summary: {
          commands: number;
          input: number;
          output: number;
          saved: number;
          pct: number;
          time_ms: number;
        };
        by_cmd: (RtkTotals & { cmd: string })[];
        daily: (RtkTotals & { date: string })[];
        by_project: { project: string; n: number; saved: number; pct: number }[];
      };
}
interface RunSummary {
  id: string;
  objective: string;
  repo: string;
  stage: string;
  tasks: number;
  kinds: Counts;
  fix_rounds: number;
  fix_causes: Counts;
  fix_rounds_source: string;
  fix_rounds_estimated: boolean;
  gate_wait_seconds: number;
  lead_seconds: number | null;
  delivered: boolean | null;
  worker_tokens: number;
  orchestrator_tokens: number;
}
interface Issue {
  id: string;
  severity: string;
  title: string;
  evidence: string;
  suggestion: string;
  filter: Record<string, string>;
}
export interface AgentSummary {
  scope: {
    days: number;
    repo: string | null;
    run: string | null;
    role: string | null;
    agent: string | null;
    generated_at: number;
  };
  totals: {
    tokens: number;
    sessions: number;
    assigned_tokens: number;
    in: number;
    cache_read: number;
    cache_write: number;
    out: number;
  };
  features: FeatureScope;
  tokens_by_role: {
    role: string;
    tokens: number;
    sessions: number;
    share: number;
    mix: { key: string; tokens: number }[];
  }[];
  search_by_role: {
    role: string;
    codegraph: number;
    rg_grep: number;
    rg_symbol: number;
    codegraph_share: number;
  }[];
  skills_by_role: Record<string, { skill: string; loads: number; sessions: number }[]>;
  runs: RunSummary[];
  issues: Issue[];
}
export interface AgentRun {
  run: RunSummary;
  features: FeatureScope;
  tasks: (Pick<RunTask, 'id' | 'title' | 'role' | 'status' | 'agent' | 'model' | 'effort'> & {
    kind: string;
    round: number | null;
    cause: string | null;
    tier: string | null;
    tokens: number;
    duration_seconds: number | null;
    skills: Counts;
  })[];
  gates: (Pick<RunGate, 'id' | 'kind' | 'stage' | 'task' | 'question'> & { wait_seconds: number | null })[];
  issues: Issue[];
  skills_window_days: number;
}
export interface TeamSkill {
  name: string;
  origin: string;
  source: string;
  body: string | null;
  refs: string[];
  path: string | null;
  description?: string;
}
interface Installation {
  path: string;
  resolved_path: string;
  source: string;
  package: string;
  version: string;
}
export interface CliTools {
  machine: string;
  system: string;
  generated_at: number;
  directories: string[];
  warnings: string[];
  sources: Counts;
  tools: (Installation & {
    name: string;
    alternatives: Installation[];
    install_kind: string;
    description: string;
    description_source: string;
  })[];
}
export interface DashboardEndpoints {
  '/api/data': DashboardData & { projection: { errors: number; lag: number } };
  '/api/agent/summary': AgentSummary;
  '/api/agent/run': AgentRun;
  '/api/team/skill': TeamSkill;
  '/api/cli-tools': CliTools;
}

export interface UsageRow {
  id: string;
  session_id: string;
  agent: string;
  repo: string;
  worktree: string;
  branch: string | null;
  cwd: string | null;
  role: string;
  role_src: string | null;
  originator: string;
  start: number | null;
  end: number | null;
  preview: string;
  title: string;
  task_id: string | null;
  task_title: string | null;
  run_id: string | null;
  attribution: string;
  aggregate: boolean;
  calls: number | null;
  fin: number;
  cr: number;
  cw: number;
  out: number;
  reason: number;
  prem: number;
  total: number;
  routing: {
    tier: string;
    catalog: string;
    agent: string;
    model: string | null;
    effort: string | null;
    dispatch: string | null;
  } | null;
  model: string;
  effort: string;
  search: Record<string, number>;
  hooks: Record<string, string>;
  skills: Record<string, [number, number]>;
  ctx: number[];
  ctx_med: number | null;
  ctx_max: number | null;
  t0: number;
  models: Record<string, number>;
  mix: Record<string, number>;
  snapshot: Record<string, number | null> | null;
  days: Record<string, number[]>;
  hours: Record<string, number[]>;
  feature_segments: {
    id: string;
    session_id: string;
    agent: string;
    cwd: string | null;
    repo: string;
    branch: string | null;
    run_id: string | null;
    role: string;
    start: number;
    end: number;
    total: number;
    skills: Record<string, [number, number]>;
    hooks: Record<string, string>;
    branch_source: string;
  }[];
}
export interface RunTask {
  id: string;
  run: string;
  title: string;
  role: string | null;
  status: string | null;
  created: number | null;
  completed: number | null;
  started?: number;
  ended?: number;
  repo: string | null;
  worktree: string | null;
  agent: string | null;
  model: string | null;
  effort: string | null;
  measurement: { kind: string; round: number | null; cause: string | null; source: string };
  routing: NonNullable<UsageRow['routing']>[];
  tokens: Record<string, number>;
}
export interface RunGate {
  id: string;
  task: string | null;
  question: string;
  answer: string;
  kind: string;
  stage: string;
  created: number | null;
  resolved: number | null;
}
export interface RunEvent {
  id: string;
  at: number;
  kind: string;
  from: string;
  to: string;
  text: string;
  body: string;
  from_actor: string;
  to_actor: string;
  type?: string | null;
  from_task?: string | null;
  to_task?: string | null;
}
export interface DashboardRun {
  id: string;
  objective: string;
  created: number | null;
  tasks: RunTask[];
  gates: RunGate[];
  events: RunEvent[];
  stage: string;
  messages_available: boolean;
  messages_limited: boolean;
  repo: string;
  delivered_at: number | null;
  delivered?: boolean;
  lead_seconds: number | null;
  gate_wait_seconds: number;
  attention: { kind: string; text: string; waiting_seconds: number | null }[];
  tokens: Record<string, number> & { sessions: number };
  window_tokens: Record<string, number>;
  orchestrator_by_agent: Record<string, number>;
  orchestrator_tokens: number;
  worker_tokens: number;
  orchestrator_activity: { agent: string; start: number; end: number; tokens: number }[];
  fix_tokens_by_cause: Record<string, Record<string, number>>;
  feature_runs?: { repo: string; branch: string }[];
  fix_rounds?: { count: number; source: string };
}
