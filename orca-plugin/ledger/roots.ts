import { lstatSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function teamRoot() {
  const root = resolve(process.env.AGENT_TEAM_HOME || fileURLToPath(new URL('../..', import.meta.url)));
  if (!statSync(join(root, 'skills'), { throwIfNoEntry: false })?.isDirectory())
    throw new Error('AGENT_TEAM_HOME must point to a team checkout containing skills/ (' + root + ')');
  return realpathSync(root);
}
export function webRoot() {
  const root = resolve(process.env.AGENT_DASHBOARD_WEB || fileURLToPath(new URL('../dashboard-web', import.meta.url)));
  // lstat, not stat: a linked index.html is not an approved page
  if (!lstatSync(join(root, 'index.html'), { throwIfNoEntry: false })?.isFile()) throw new Error('AGENT_DASHBOARD_WEB must contain index.html (' + root + ')');
  return root;
}
