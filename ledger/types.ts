// Types shared by ingest.ts and the plugin worker. Pure types: no Node declarations needed.
export type Pass = { reason: string, startedAt: string, finishedAt: string, ms: number, timings: Record<string, number>, errors: string[] };
export type Status = {
  host: string, home: string, pid: number, node: string, startedAt: string,
  lock: 'held' | 'waiting' | 'stopped', lockedBy?: string,
  running: boolean, passes: number, lastPass?: Pass, lastError?: string,
  counts?: { sources: Record<string, number>, blobs: number, bytes: { ledger: number, archive: number } },
};
export type Options = {
  /** Ledger directory; default AGENT_LEDGER_HOME or ~/.agents/ledger. */
  home?: string,
  env?: Record<string, string | undefined>,
  /** Fixed period of the scheduled pass, ms. */
  intervalMs?: number,
  /** Wait before an event-triggered pass, ms; triggers inside the wait coalesce into it. */
  debounceMs?: number,
  /** Least spacing between the starts of two passes that events ask for, ms. */
  minGapMs?: number,
  /** Label written into the lock info and /health, e.g. "orca-plugin" or "launchd". */
  host?: string,
  onPass?: (pass: Pass) => void,
  onState?: (state: Status) => void,
};
export type IngestApi = {
  start(options?: Options): Status,
  stop(): Promise<void>,
  status(): Status | undefined,
  trigger(reason?: string): void,
};
export type Route = (req: { url?: string, method?: string }, url: URL) => unknown | Promise<unknown>;
export type HttpApi = {
  serve(routes: Record<string, Route>, options?: {
    port?: number, host?: string, retryMs?: number,
    onError?: (error: Error & { code?: string }) => void, onListening?: () => void,
  }): { close(): Promise<void> },
};
