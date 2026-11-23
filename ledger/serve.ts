import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createApi } from './api.ts';
export { createApi };
if (import.meta.main) {
  process.umask(0o077);
  const flag = process.argv.indexOf('--port'),
    port = flag < 0 ? 4748 : Number(process.argv[flag + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('invalid --port');
  const hostFlag = process.argv.indexOf('--host'),
    host = hostFlag < 0 ? '127.0.0.1' : process.argv[hostFlag + 1];
  if (host !== '::1' && host !== '127.0.0.1') throw Error('expected a loopback --host');
  const api = createApi(process.env.AGENT_LEDGER_HOME || join(homedir(), '.agents/ledger'));
  const server = createServer(api);
  server.once('error', (error) => {
    console.error('Ledger dashboard could not listen on ' + host + ':' + port + ' (' + error.message + ')');
    process.exitCode = 1;
    void api.close();
  });
  server.listen(port, host, () =>
    console.log('Ledger dashboard listening on ' + (host === '::1' ? '[::1]' : host) + ':' + port),
  );
  const stop = () => {
    server.close();
    void api.close();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
