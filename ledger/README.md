# Agent history ledger

Run `node ledger/daemon.ts` with Node 26. The first pass backfills available
history. Subsequent passes start at 60-second intervals. A slow pass finishes
before the next begins. Use `node ledger/daemon.ts --once` for one pass. It
prints source errors to stderr and exits nonzero if a source read failed.
Run the fixture suite with `node --test ledger/tests/*.test.ts`.

| Environment variable | Default | Input |
| --- | --- | --- |
| AGENT_LEDGER_HOME | ~/.agents/ledger | Private output directory |
| AGENT_LEDGER_CLAUDE | ~/.claude/projects | Recursive *.jsonl |
| AGENT_LEDGER_CODEX | ~/.codex/sessions | Recursive *.jsonl |
| AGENT_LEDGER_COPILOT | ~/.copilot/session-state | */events.jsonl |
| AGENT_LEDGER_JCODE | ~/.jcode/sessions | *.json |
| AGENT_LEDGER_HERMES | ~/.hermes/state.db | sessions and messages |
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
Rotation, observed shrinkage and reappearance start a new generation.
Whole JSON files retain their original bytes. Database rows use JSON objects
with column names, decimal integer literals and base64 objects for BLOBs.
A change to the database or WAL triggers bounded rowid queries and row-hash
comparisons because the dashboard tables have mutable fields and no reliable
update timestamp. Each page releases its source read transaction.

Orca snapshots store the full JSON result for each command and page.
The outer CLI envelope contains a per-call request ID. Run and worker lists
are paginated. Each run includes tasks, gates, up to 500 inbox messages
(the dashboard's window), and a worker-show result for each listed dispatch.
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
