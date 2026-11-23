# Agent history ledger

Run `node ledger/daemon.ts` with Node 26. The first pass backfills available
history. Subsequent passes start at 60-second intervals. A slow pass finishes
before the next begins. Use `node ledger/daemon.ts --once` for one pass. It
prints wall time in milliseconds for each source kind to stdout, writes source errors to stderr and exits nonzero if a source read failed.
Run the fixture suite with `node --test ledger/tests/*.test.ts`.

| Environment variable | Default | Input |
| --- | --- | --- |
| AGENT_LEDGER_HOME | ~/.agents/ledger | Private output directory |
| AGENT_LEDGER_CLAUDE | ~/.claude/projects | Recursive *.jsonl |
| AGENT_LEDGER_CODEX | ~/.codex/sessions | Recursive *.jsonl |
| AGENT_LEDGER_COPILOT | ~/.copilot/session-state | */events.jsonl |
| AGENT_LEDGER_JCODE | ~/.jcode/sessions | *.json |
| AGENT_LEDGER_HERMES | ~/.hermes/state.db | sessions, messages, system_prompts and session_model_usage |
| AGENT_LEDGER_RTK | ~/Library/Application Support/rtk/history.db | commands |
| AGENT_LEDGER_ORCA | orca on PATH | CLI executable |

Use absolute paths for overrides. Choose a private output directory outside
the inputs. Raw archives contain complete conversations and command lines.

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

1. Choose a stable checkout and an installed Node 26 binary. Check
   `/absolute/path/to/node --version` and `command -v orca`.
2. Copy `agent-ledger.plist` to
   `~/Library/LaunchAgents/<label>.plist`. Replace every placeholder,
   using the same label in the filename and plist. Use absolute paths for
   Node, the checkout's ledger/daemon.ts, Orca, and the stderr log in an
   existing private directory. launchd does not expand shell variables or ~.
3. Run `plutil -lint "$HOME/Library/LaunchAgents/<label>.plist"`, then
   `launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/<label>.plist"`.
4. Check `launchctl print "gui/$(id -u)/<label>"` and the chosen stderr log.
   To stop the daemon, run `launchctl bootout "gui/$(id -u)/<label>"`.
