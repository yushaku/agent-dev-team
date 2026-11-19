# StarCi Harness: 12 verify gates before commit (survey, 2026-11)

Question: what are the 12 machine gates Nguyễn Văn Tự Cường (starci183) runs before every agent commit, how are they enforced, and which of them this team lacks. Primary source is his repo, read at commit `c1340ba` (2026-11-19, CLI `1.1.0-alpha.173`, `@starci/hfs` `6.13.53`) [1]; his Facebook post is the summary [2].

## Findings

1. **He dropped his own multi-agent harness for Claude Code and moved the effort into checks.** The post says Claude Code with Opus 5.5 is already a good harness; more agents raise the error rate, so the value is in strict testing [2]. The repo states the rule: "The agent that does the work never judges it" [1].
2. **The 12 gates are one command.** `starci app check --gate <hfs|format|db|secrets|wiring|types|lint|test|sonar|codecov|build|audit>`; `sonar` and `codecov` share one run, so 12 names run 11 checks [3].
   - `hfs`: every file sits in its architecture slot; managed files (CI, hooks, Sonar, tool configs) that differ from their render are red; BE/FE contract matches.
   - `format`: Prettier from the shared `@starci/prettier-config`.
   - `db`: every migration applied to an empty scratch database must build the schema the TypeORM entities describe (drift is red); RLS is enabled and forced on tables unless exempted by name [3][6].
   - `secrets`: scans changed files; real secrets live only in sops envelopes [5].
   - `wiring`: boots the NestJS app to prove DI composes every provider a module needs; catches what typecheck cannot.
   - `types`: TypeScript strict from `@starci/tsconfig`.
   - `lint`: ESLint canon per side (be, fe), Stylelint, and "Grammar" rules on UI component use.
   - `test`: unit tests, sharded in CI.
   - `sonar`: new code 0 issues at every severity, duplication ≤ 3%, every hotspot reviewed [4].
   - `codecov`: 100% coverage per file, not on average [4].
   - `build`: be and fe built as CI builds them.
   - `audit`: dependency advisories at or above high are red.
3. **A loosening gate stops an agent passing by switching rules off.** It scans the whole tree for `eslint-disable`, `stylelint-disable`, `ts-ignore`, `ts-nocheck`, `ts-expect-error`, `NOSONAR`, skipped or focused tests, `|| true`, `--no-verify`, TLS verification off and widened Sonar exclusions. An exception lives only in a policy file, names one file, one marker, the exact line and a reason; a stale exception is itself an error [4].
4. **Verify runs on a clean checkout, not in the worker's tree.** The worker dry-runs the contract until green and files a result; the harness rebases the task's paths onto the branch head, replays the checks on a clean checkout, and commits only on green [1].
5. **`hfs`, `secrets` and `db` can never be switched off.** Other gates may be declared off for a whole app with a reason, and a `dev` or `ui/*` branch may lower `lint`, `sonar`, `codecov` to report-only; `main` always runs the full set [4].
6. **Two tiers.** A runtime tier (pre-push and `task verify`, scoped to changed files, 300 s per step) and a CI tier on main; release and production deploy refuse unless CI is green [4].
7. **The coverage number has two limits.** The front end has no tests by rule (`FE_NO_TESTS` refuses any spec, test tool or test script under `fe/`), so 100% covers the back end only. Integration, e2e and contract suites never run in CI, only on a local machine on request (R12) [3].
8. **Cost of the setup.** 7,574 tracked files, 1,252 commits by the author in 2026-11, alpha releases; the gates assume his NestJS + Next.js + Postgres stack and his own lint canon [1].

## Against this team

Matches:
- A Builder never self-approves: an independent Reviewer checks every Run, and `roles/reviewer.md` flags a diff that weakens a test, lint rule or coverage target.
- `commands.verify` runs once in full before `worker_done`.

Differs (repo state on 2026-11-19):
- The Reviewer's loosening check is agent judgement; nothing in code refuses a marker.
- The Builder runs verify in its own worktree and the Reviewer reuses that evidence (`review.md`); no clean-checkout replay.
- `commands.verify` is weaker than CI: bisou verify has typecheck, test, build, while CI also runs lint, knip, format; `check:migrations` exists but runs nowhere.
- Per repo: jizen has typecheck, lint, test (no format, build, audit, secrets) and handles PayPal and user data; mado has typecheck, tests, build, `npm audit` at critical only, no lint or format; monmon has Swift format, tests, build and no CI.
- No repo has a secret scan, coverage target, Sonar, or a boot (wiring) check.

## Recommendations

1. **Add a loosening check to the shared process**: a script over the diff for disable comments, skipped or focused tests and `--no-verify`, red in `commands.verify`. Biggest gap for unattended agents; cheap.
2. **Add a secret scan** (gitleaks) to pre-commit and CI in all four repos.
3. **Make `commands.verify` match CI** in bisou and jizen, so a Builder cannot report done on a commit CI will fail.
4. **Do not copy 100% coverage or Sonar.** High cost, and the author reaches 100% only by banning front-end tests. Keep FE tests for state logic, permissions and a few e2e flows; leave visual checks to the Reviewer's screenshots.

## Open

- RLS applies to Postgres only; bisou runs on Cloudflare D1 and monmon on SwiftData, so `db` needs another form there.
- A clean-checkout replay in Orca (fresh worktree at the Builder's commit, run verify) is not costed.
- His claim that module quality is "always 10/10" is shown only by screenshots in the post; not checked.

## Sources

1. https://github.com/starci183/starci-harness README, commit `c1340ba` (fetched 2026-11-19). Primary.
2. https://www.facebook.com/100087579207714/posts/1136285099300786/ "Day 3: Hiểu harness và bản chất để tránh bị FOMO, Phần 1" (2026-11). Primary, summary.
3. `packages/hfs/README.md` and `packages/hfs/runtime/knowledge/hfs/ci-standard.yaml` in [1]. Primary.
4. `policy/quality.yaml`, `policy/loosening.yaml`, `policy/README.md` in [1]. Primary.
5. `policy/security.yaml` in [1]. Primary.
6. `contexts/code/be/persistence.md` in [1]. Primary.
