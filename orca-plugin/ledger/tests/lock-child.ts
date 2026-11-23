// Test helper: take the ingest lock for <home>, print "held" or "refused", then keep it until killed or stdin closes.
import { acquire } from '../lock.ts';
const got = acquire(process.argv[2], 'child-' + process.pid);
if ('by' in got) { console.log('refused ' + got.by); process.exit(0); }
console.log('held ' + process.pid);
process.stdin.resume();
process.stdin.on('end', () => { got.held.release(); process.exit(0); });
setInterval(() => {}, 1 << 30);
