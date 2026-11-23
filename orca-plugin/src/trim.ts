// Cuts the dashboard's /api/data payload to what the Tasks tab (#tk-theo-repo) renders, so the
// pieces fit the 1 MiB limit on a worker's reply (the full 7-day payload is 1.6 MB, 30 days 3.0 MB).

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
/** The whole snapshot may be large (it travels in chunks); this only guards against runaway data. */
export const SNAPSHOT_LIMIT = 24_000_000
/** One reply must stay under Orca's 1 MiB (1,048,576) answer cap; this is the most a chunk reply may weigh. */
export const REPLY_LIMIT = 900_000

const bytes = (text: string) => new TextEncoder().encode(text).length
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
  // The repo filter (dash.js) also lists repos of feature runs: keep their names, not the records.
  const repos = [...new Set((((data.features as Json)?.runs as Json[]) || []).map((r) => r.repo).filter(Boolean))]
  out.features = { runs: repos.map((repo) => ({ repo })) }
  return out
}

/** The fullest trimmed snapshot (as JSON text) that fits SNAPSHOT_LIMIT; message bodies shrink first. */
export function prepare(data: Json, limit = SNAPSHOT_LIMIT): { text: string; bytes: number; bodyCap: number } {
  let last = 0
  for (const bodyCap of BODY_CAPS) {
    const text = JSON.stringify(trim(data, bodyCap))
    last = bytes(text)
    if (last <= limit) return { text, bytes: last, bodyCap }
  }
  throw Object.assign(new Error(`Dashboard data is ${last} bytes after trimming; the limit is ${limit}.`), { code: 'too_large' })
}

/** Splits JSON text into pieces whose reply, `{"chunk":"…"}` as UTF-8 JSON, weighs at most `limit` bytes; joining them restores the text. */
export function chunks(text: string, limit = REPLY_LIMIT): string[] {
  const out: string[] = []
  let at = 0
  while (at < text.length) {
    let n = Math.min(text.length - at, Math.floor(limit / 2))
    while (bytes(JSON.stringify({ chunk: text.slice(at, at + n) })) > limit) n = Math.floor(n * 0.9)
    out.push(text.slice(at, at + n))
    at += n
  }
  return out
}
