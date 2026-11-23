import { parentPort } from 'node:worker_threads';
import { discover } from './commands.ts';

parentPort!.postMessage(JSON.stringify(discover()));
