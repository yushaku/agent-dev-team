---
name: web-perf-lab
description: "Use when a web list, table or chart is slow with many rows. Simulate N rows in the browser and profile scroll and load over CDP."
---

# Web perf lab

## Procedure

1. Count real local data read-only with a one-off script using the repo's DB client, then delete it. Small counts mean simulate.
2. Read the render path first: who renders each row, what runs on `scroll`, and what is mounted but hidden.
3. Simulate N rows in the browser only; never write synthetic rows to the DB. `scripts/amplify-xhr.js` is injected with `Page.addScriptToEvaluateOnNewDocument` and patches XHR and `fetch`. Args: API URL part, N, dot path to the item array (`data`, `data.tasks`, empty for a bare array), and keys made unique per clone (`id,parentId`).
4. Attach to the user's logged-in browser over CDP. Pass its data dir holding `DevToolsActivePort` (line 1 is the port, line 2 the ws path), for example `~/Library/Application Support/Google/Chrome`. Never ask for credentials. Scripts open and close their own tab.
5. Scroll: `node scripts/cdp-scroll-bench.mjs <dataDir> <page> <urlPart> <itemsPath> <keys> <sizes> <scrollerSel> <itemSel> [profile]`. Per size, load until item count is stable, then report DOM node count, rAF frame times while scrolling the real scroller 60px per frame (median, p95, frames over 20ms, long tasks), and CPU self time.
6. Load: `node scripts/cdp-load-profile.mjs <dataDir> <page> <urlPart> <itemsPath> <keys> <N> <itemSel>`. Warm once, profile a reload, and print marks plus self and inclusive time. Inclusive time names the culprit; self time alone shows layout calls. Map minified frames through the dev chunk.
7. Check `bench.n` equals N and `benchErr` is empty before trusting a number.
8. Isolate a third-party library in a bare harness page with synthetic N to split library cost from app cost.
9. Report a size table, timeline table, causes ranked by profile share with file and function, and fix options with cost. Investigation changes no code.
10. For a fix Task, quote measured causes, forbid re-investigation, rerun the same script and size, and report before/after in one table.

## Pitfalls

- A boolean guard around two-way scroll sync does not work (the event fires after the reset); compare the target's `scrollTop`.
- Synthetic `dispatchEvent(new Event('scroll'))` times handlers only; jank needs rAF frames with real `scrollTop` changes.
- Two mount effects (construct, then refresh on data change) build a heavy view twice per load; look for it in inclusive time.
- Library-specific fixes belong to the project skill of the repo that uses the library, not here.
- An investigation seeds no DB.
- Large self time in `getBoundingClientRect` or `getBBox` is the first forced layout of a large DOM; fewer nodes reduce it.
