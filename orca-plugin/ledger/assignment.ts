import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, sep } from 'node:path';
import { role, type Session } from './session.ts';

function promptRole(text: string): string | null {
  const assigned = text.match(
    /^(?:\s*Role:\s*|\s*(?:You are|Act as|Work as|Làm)\s+(?:(?:an?|the|independent|senior)\s+)*)(orchestrator|designer|builder|reviewer)\b/im,
  );
  if (assigned) return assigned[1].toLowerCase();
  const invoked = text.match(/^\s*[$/](?:team-)?(orchestrator|designer|builder|reviewer)\b/i);
  if (invoked) return invoked[1].toLowerCase();
  if (/^\s*[$/]design-taste-frontend\b/i.test(text)) return 'designer';
  const heading = text.replace(/^#\s*(?:Brief:\s*)?/i, '').trim();
  if (
    /^#\s*Brief:\s*(?:Review|Re-review)\b/i.test(text) ||
    /^(?:Standards|Spec)\s+review\b/i.test(heading) ||
    /^(?:Review|Re-review)\s+(?:(?:the|this|these)\s+)?(?:code|diff|changes|implementation|PR|pull request)\b/i.test(heading)
  )
    return 'reviewer';
  const goal = text.match(/^## Goal[ \t]*\r?\n([^\n]+)/m)?.[1] || '';
  if (/^(?:Build|Implement|Fix|Refactor)\b/i.test(heading) || /^## Build\s*$/m.test(text) || /\b(?:Build|Implement|Refactor)\b/.test(goal)) return 'builder';
  if (/^(?:Design|Redesign)\b/i.test(heading)) return 'designer';
  return null;
}

/** Recover legacy assignments from the request, without treating later skill reads as assignments. */
export function sessionAssignment(s: Pick<Session, 'preview'>): [string, string] | null {
  const direct = promptRole(s.preview);
  if (direct) return [direct, 'prompt'];
  const path = s.preview.match(/^Read\s+[`'"]?([^\s`'"]+\/\.team\/[^\s`'"]+\.md)\b/i)?.[1];
  if (!path || !isAbsolute(path)) return null;
  let fd: number | undefined;
  try {
    const root = realpathSync(path.slice(0, path.indexOf('/.team/') + 6));
    const real = realpathSync(path);
    if (!real.startsWith(root + sep)) return null;
    fd = openSync(real, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 256_000) return null;
    const buffer = Buffer.alloc(Math.min(stat.size, 16_000));
    const text = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0)).toString('utf8');
    const explicit = text.match(/^Role:[ \t]*([a-z-]+)/im)?.[1].toLowerCase();
    const assigned = (explicit && role(explicit)) || promptRole(text);
    return assigned ? [assigned, 'brief'] : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
