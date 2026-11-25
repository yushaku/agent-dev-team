// LIFO teardown for fixtures that acquire listeners, ingest runners, timers or workers.
// Register each release with defer() right after acquiring the resource, so a failing assertion still runs it.
import type { TestContext } from 'node:test';

export type Teardown = () => unknown;

/** One t.after() hook that runs every deferred release, last registered first; one failing release does not skip the others. */
export function teardowns(t: TestContext, last: Teardown = () => {}) {
  const stack: Teardown[] = [];
  t.after(async () => {
    const errors: unknown[] = [];
    for (const fn of stack.reverse()) {
      try {
        await fn();
      } catch (e) {
        errors.push(e);
      }
    }
    try {
      await last();
    } catch (e) {
      errors.push(e);
    }
    if (errors.length) throw errors[0];
  });
  return (fn: Teardown) => void stack.push(fn);
}
