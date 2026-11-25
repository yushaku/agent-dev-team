import { join } from 'node:path';
import { homedir } from 'node:os';
import { once, start, stop } from './ingest.ts';
export { cycle } from './cycle.ts';

if (import.meta.main) {
  process.umask(0o077);
  const home = process.env.AGENT_LEDGER_HOME || join(homedir(), '.agents/ledger');
  if (process.argv.includes('--once')) {
    const result = await once({ home, host: 'launchd-once' });
    if ('by' in result) {
      console.error(`ledger ingest is held by ${result.by}; not running`);
      process.exitCode = 75;
    } else {
      console.log(JSON.stringify({ wall_ms: result.timings }));
      for (const message of result.errors) console.error(message);
      if (result.errors.length) process.exitCode = 1;
    }
  } else {
    const state = start({
      home,
      host: 'launchd',
      onPass: (pass) => {
        for (const message of pass.errors) console.error(message);
      },
      onState: (s) => {
        if (s.lock === 'waiting' && s.lockedBy) console.error(`waiting: ingest is held by ${s.lockedBy}`);
      },
    });
    let quitting: Promise<void> | undefined;
    const quit = () => (quitting ??= stop().then(() => process.exit(0))); // a second signal waits for the same drain
    process.on('SIGTERM', quit);
    process.on('SIGINT', quit);
    // Keeps the process alive between passes; state.lock stays referenced for debugging.
    setInterval(() => void state, 1 << 30);
  }
}
