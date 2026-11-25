# Agent history ledger

Run `node orca-plugin/ledger/daemon.ts` with Node 24 or 26 (from the repository root; paths below are relative to `orca-plugin/ledger/` unless they start with `orca-plugin/`). The first pass backfills available
history. Subsequent passes start at 60-second intervals. A slow pass finishes
before the next begins. Use `node orca-plugin/ledger/daemon.ts --once` for one pass. It
prints wall time in milliseconds for each source kind to stdout, writes source errors to stderr and exits nonzero if a source read failed.
Ingest lives in `ingest.ts` (`start(options)`, `trigger()`, `stop()`, `once()`); `daemon.ts` is the launchd entry and the Orca plugin worker (`orca-plugin/src/ledger-host.ts`) is the other host. Only one host ingests into a ledger directory: the lock is an exclusive SQLite lock on `ingest.lock.db` that the OS drops when the holder dies (a second connection in the same process is refused too, so a reload cannot overlap), held from before the databases open until after they close; `ingest.lock.info` only names the holder. A second host waits and retries each interval; `--once` exits 75 with a message. The periodic pass keeps a fixed 60 s schedule; passes asked for by events are coalesced (1.5 s) and start at least 5 s apart. An existing ledger directory is tightened to 0700 and its files to 0600 (a directory owned by someone else is refused). `http.ts` is a small loopback route server (the plugin mounts the API next to `/health` on 4747; `serve()` answers 403 to a non-loopback `Host` on every route). Code runs on Node 24 (Orca's worker) and Node 26.
Run the tests as the plugin README says ("Verify").

| Environment variable | Default | Input |
| --- | --- | --- |
| AGENT_LEDGER_HOME | ~/.agents/ledger | Private output directory |
| AGENT_LEDGER_CLAUDE | ~/.claude/projects | Recursive *.jsonl |
| AGENT_LEDGER_CODEX | ~/.codex/sessions | Recursive *.jsonl |
| AGENT_LEDGER_COPILOT | ~/.copilot/session-state | */events.jsonl and */workspace.yaml |
| AGENT_LEDGER_JCODE | ~/.jcode/sessions | *.json |
| AGENT_LEDGER_PI | ~/.pi/agent/sessions | Recursive *.jsonl |
| AGENT_LEDGER_HERMES | ~/.hermes/state.db | sessions, messages, system_prompts and session_model_usage |
| AGENT_LEDGER_RTK | ~/Library/Application Support/rtk/history.db | commands |
| AGENT_LEDGER_ORCA | orca on PATH | CLI executable |

Use absolute paths for overrides. Choose a private output directory outside
the inputs. Raw archives contain complete conversations and command lines.

## Dashboard API

With an ingested ledger, run `node orca-plugin/ledger/serve.ts --port 4748` on Node 24 or 26 (a standalone server for the same API; the plugin's worker normally serves it on 4747).
The server binds to 127.0.0.1. For IPv6 loopback use `--host ::1`.
The standalone API and the daemon share `AGENT_LEDGER_HOME`.

Pass an open Store or ledger directory to `createApi`. Its `routes` property
contains the dashboard endpoints and static assets for the plugin's listener.

```ts
import { createApi } from './api.ts';
import { serve } from './http.ts';

const api = createApi(store);
const http = serve({ '/health': health, ...api.routes }, { port: 4747 });
```

During deactivation, call `await http.close()` and `await api.close()`.
The API is also callable as a standalone Node HTTP request listener. The query
worker writes derived tables, so use a scratch ledger when testing alongside
the plugin. Wire types for dashboard JSON responses are in `ledger/protocol.ts`.

Set `AGENT_DASHBOARD_WEB` to a directory containing `index.html` for an
installed frontend. Set `AGENT_TEAM_HOME` to the team checkout containing
`skills/`. The defaults are the plugin's `dashboard-web/` and the repository root (two levels above `ledger/`). Which files of that directory are served, under which URLs, and which are never served (links, dot files, other file types) is the static route contract in `orca-plugin/README.md` (Layout, `dashboard-web/`).
Startup errors name the missing root or the occupied listen address.

The query worker checks the ingest log every second. During catch-up it
commits one source generation per turn, yielding between jobs. Each job uses
a savepoint. If a parser throws, the job records the failure in
`dashboard_errors`, keeps its previous successful projection and lets the
cursor advance. A later edit or parser version retries the source. Each
`/api/data` response includes `projection.errors` for the current version
and `projection.lag`, the highest ingest-log ID minus the committed cursor.
During a rebuild, the response contains the sources projected so far.

A changed JSONL file replays its archived transcript. The replay log records
its source ID, generation, byte count and duration. Copilot workspace
metadata is available from the first pass that archives its sidecar. Older
archives with events only use the event context.

The projection groups transcript generations by source path and session ID.
For JSONL it matches complete lines byte for byte and by occurrence within
the generation. Restoring an old prefix counts that prefix once. A partial
overlap retains the unmatched records from both sides, including repeated
identical lines in a single generation. A different session ID starts a
separate history. A headerless Codex or Claude continuation inherits the
previous ID. JCode combines messages by message ID, falling back to their
JSON when an ID is absent.

For a replaced Hermes database, the latest archived session row for each
session ID supplies the totals. Messages within a session use the newest
archived row for their message ID, falling back to the archived item key.
For RTK, a restored row with the same rowid, timestamp, command and project
uses the latest counters. Reusing the rowid for a different command,
project or time preserves both commands. A row found only in a previous
generation remains available.

All `dashboard_*` tables in `ledger.sqlite` are derived and safe to drop
with the API stopped. Restarting the API rebuilds them from `ledger.sqlite`
and `archive.sqlite`. Git metrics come from each available checkout.
Parser cleanup retains the current version and its immediate predecessor
after catch-up. History in the archive survives deletions from live files
and databases, including Hermes messages.

The API reads current Git metadata, report files, installed skills and CLI
metadata. A background worker analyzes Git defects per checkout and
default-branch head. A cached result stays visible during a Git update.
`features.repositories[repo].loading` marks work in progress, `stale`
marks a previous head, and `error` names a failed probe or analysis.
Failed heads retry after five minutes. The worker warms known repositories
at startup. Git timings are logged per repository and stored in
`dashboard_git_attempts`. CLI discovery runs in a separate worker and
shares a result for 60 seconds. The query worker caches up to four
serialized date windows, refreshing them on projection or Git changes or
after 30 seconds. If the query worker takes over 10 seconds to answer, the
listener returns HTTP 503 with `{"loading":true}`.

The parsers' expected output for the fixtures is frozen in `tests/golden/` (recorded once from the retired Python dashboard; see `tests/golden.ts`), and `tests/fixtures.test.ts` compares each fixture's projection with it.

## Reading the archive

Keep `ledger.sqlite` and `archive.sqlite` together. Writes to both use one
SQLite transaction with rollback journals. The archive stores each distinct
byte payload once by SHA-256. The ledger holds source paths, cursors, the
latest hash for each item, and the history of observed versions. To recover
JSONL, concatenate blobs in numeric offset order within one source generation.

```sql
-- From the ledger directory, open ledger.sqlite with sqlite3.
ATTACH 'archive.sqlite' AS archive;
SELECT path, generation, item, length(bytes), recorded_at
FROM ingest_log JOIN sources ON sources.id=ingest_log.source
JOIN archive.blobs USING(hash)
WHERE kind='claude'
ORDER BY path,generation,CAST(item AS INTEGER);
```

Pi uses its session header ID and cwd. Assistant usage, standalone usage
(including cache warming), compaction and branch-summary usage all count,
including abandoned conversation branches. Entry ID plus timestamp prevents
copied fork history from counting twice. Provider/model and thinking level
remain attached to each call; reasoning is part of output, not added again.
Successful Orca Run creation receipts and explicit Run commands establish
attribution boundaries; worker prompts supply Task IDs. Format reference:
[Pi session format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md).

An unfinished JSONL line stays at the cursor until a newline arrives.
A new file identity, observed shrinkage or a changed checksum in the 64 bytes
before the committed offset starts a new JSONL generation. A file that returns
with the same identity and matching tail resumes at its saved offset.
Whole JSON files retain their original bytes. Database rows use JSON objects
with column names, decimal integer literals and base64 objects for BLOBs.
On a database or WAL change, the ledger checks rtk commands above the last
archived rowid. A VACUUM that shrinks a database preserves its generation.
Hermes prompts are read by increasing rowid. Sessions and per-model usage
totals can change in place, so the ledger rehashes both small tables. For
messages it tracks count, active and compacted sums, and maximum rowid by
session. A changed fingerprint triggers a session rescan. The newest 256
rowid positions are also revisited. Older content-only edits that leave the
fingerprint unchanged can be missed.

Orca lists runs every minute and fetches details immediately for new or
changed entries. A run with a live dispatch gets fresh details every minute.
Other open runs are checked after five minutes of quiet, fifteen minutes
later, then hourly. Settled runs are checked ten minutes, one hour and six
hours after settling, then daily. Detail changes restart the backoff. When
run status is absent, the daemon uses tasks, gates and workers to decide
whether a run has settled. Each snapshot covers tasks, gates, up to 500 inbox
messages, workers and dispatches. The daemon collects responses before
opening the write transaction. Concurrent readers and writers get a
30-second SQLite busy timeout.
An unavailable CLI is retried on the next pass. Previously observed data
stays in the archive when a source disappears.

## Install as a macOS LaunchAgent after review

1. Choose a stable checkout and an installed Node 24 or 26 binary. Check
   `/absolute/path/to/node --version` and `command -v orca`.
2. Copy `agent-ledger.plist` to
   `~/Library/LaunchAgents/<label>.plist`. Replace every placeholder,
   using the same label in the filename and plist. Use absolute paths for
   Node, the checkout's orca-plugin/ledger/daemon.ts, Orca, and the stderr log in an
   existing private directory. launchd does not expand shell variables or ~.
3. Run `plutil -lint "$HOME/Library/LaunchAgents/<label>.plist"`, then
   `launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/<label>.plist"`.
4. Check `launchctl print "gui/$(id -u)/<label>"` and the chosen stderr log.
   To stop the daemon, run `launchctl bootout "gui/$(id -u)/<label>"`.
