// Cuts the dashboard's /api/data payload to what the Tasks tab (#tk-theo-repo) renders, so the
// answer fits the 1 MiB limit on a worker's reply (the full 7-day payload is about 1.6 MB).

type Json = Record<string, unknown>

/** Top-level keys the Tasks view reads (dash.js, charts.js, tabs/{overall,roles,role-skills,repos,search,sessions}.js). */
const KEEP = [
  'generated_at', 'days', 'range_start', 'dates', 'sessions', 'orca', 'roles_cfg', 'known_roles',
  'attribution', 'copilot_dirs'
]
/** Per-session fields only the Runs tab or nothing reads. */
const SESSION_DROP = ['feature_segments', 'ctx', 'cwd', 'models']
/** Orca run events carry whole inbox messages in `body`; the modal shows it, so it is cut, not dropped. */
const BODY_CAPS = [600, 300, 120, 0]
export const ANSWER_LIMIT = 1_000_000 // under the 1 MiB (1,048,576) cap, with headroom

const cut = (text: unknown, cap: number): string | undefined =>
  typeof text !== 'string' || cap === 0 ? undefined : text.length > cap ? text.slice(0, cap) + '…' : text

export function trim(data: Json, bodyCap: number): Json {
  const out: Json = {}
  for (const key of KEEP) if (key in data) out[key] = data[key]
  out.sessions = ((data.sessions as Json[]) || []).map((s) => {
    const copy = { ...s }
    for (const key of SESSION_DROP) delete copy[key]
    return copy
  })
  const orca = (data.orca as Json) || {}
  out.orca = {
    ...orca,
    runs: ((orca.runs as Json[]) || []).map((run) => ({
      ...run,
      events: ((run.events as Json[]) || []).map((e) => {
        const { body, ...rest } = e
        const short = cut(body, bodyCap)
        return short === undefined ? rest : { ...rest, body: short }
      })
    }))
  }
  return out
}

/** The fullest trimmed payload that fits; message bodies shrink first. */
export function fit(data: Json, limit = ANSWER_LIMIT): { payload: Json; bytes: number; bodyCap: number } {
  let last = 0
  for (const bodyCap of BODY_CAPS) {
    const payload = trim(data, bodyCap)
    last = new TextEncoder().encode(JSON.stringify(payload)).length
    if (last <= limit) return { payload, bytes: last, bodyCap }
  }
  throw Object.assign(new Error(`Dashboard data is ${last} bytes after trimming; the limit is ${limit}.`), {
    code: 'too_large'
  })
}
