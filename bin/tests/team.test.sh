#!/usr/bin/env bash
# Tests for bin/team against a fake orca and a scratch git repo. Run: bash bin/tests/team.test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
team="$here/../team"
tmp=$(cd "$(mktemp -d)" && pwd -P); trap 'rm -rf "$tmp"' EXIT
fails=0; n=0
ok() { n=$((n+1)); echo "ok $n - $1"; }
no() { n=$((n+1)); fails=$((fails+1)); echo "not ok $n - $1"; [ -n "${2:-}" ] && echo "  $2"; }
check() { if eval "$2"; then ok "$1"; else no "$1" "$2"; fi; }

# fake orca: logs argv, answers per subcommand
mkdir -p "$tmp/bin"
cat >"$tmp/bin/orca" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$FAKE_LOG"
case "$1 $2" in
  "worktree create")
    name=""; while [ $# -gt 0 ]; do [ "$1" = --name ] && name=$2; shift; done
    wt="$FAKE_WT/$name"; git -C "$FAKE_REPO" worktree add -q -b "feat/$name" "$wt" main
    echo "{\"ok\":true,\"result\":{\"worktree\":{\"path\":\"$wt\"}}}";;
  "orchestration run-create") echo '{"ok":true,"result":{"runId":"run_test1","objective":"x"}}';;
  "orchestration task-create")
    c=$(grep -c task-create "$FAKE_LOG"); echo "{\"ok\":true,\"result\":{\"taskId\":\"task_$c\",\"status\":\"ready\"}}";;
  "orchestration worker-start")
    [ -n "${FAKE_FAIL_START:-}" ] && { echo '{"ok":false,"error":{"code":"launch_failed"}}'; exit 1; }
    task=""; agent=""; while [ $# -gt 0 ]; do case $1 in --task) task=$2;; --agent) agent=$2;; esac; shift; done
    c=$(grep -c worker-start "$FAKE_LOG")
    echo "{\"ok\":true,\"result\":{\"dispatchId\":\"ctx_$c\",\"taskId\":\"$task\",\"runId\":\"run_test1\",\"state\":\"ready\",\"agent\":\"${agent:-claude}\",\"terminal\":\"term_$c\",\"next\":\"end turn\"}}";;
  "orchestration task-list") echo '{"ok":true,"result":{"tasks":[{"id":"task_1","status":"completed","title":"builder: one"},{"id":"task_2","status":"dispatched","title":"reviewer: two"}],"runId":"run_test1"}}';;
  "worktree set") echo '{"ok":true,"result":{}}';;
  "worktree rm") echo '{"ok":true,"result":{}}';;
  "agent list") echo '{"ok":true,"result":{"agents":[{"orcaSessionId":"sess-1","kind":"terminal","agent":"pi","paneKey":"pane-1","repo":"repo"}]}}';;
  "orchestration worker-release") echo '{"ok":true,"result":{"status":"released"}}';;
  "orchestration worker-read")
    if [[ "$*" == *--cursor* ]]; then echo '{"ok":true,"result":{"transcript":{"messages":[{"role":"assistant","blocks":[{"type":"text","text":"tail message"}]}]}}}'
    else echo '{"ok":true,"result":{"transcript":{"nextCursor":"c2","messages":[{"role":"user","blocks":[{"type":"text","text":"prompt"}]},{"role":"assistant","blocks":[{"type":"tool_use"}]}]}}}'; fi;;
  *) echo '{"ok":false}'; exit 1;;
esac
EOF
chmod +x "$tmp/bin/orca"

repo="$tmp/repo"; mkdir -p "$repo/.team" "$tmp/wt"
git -C "$repo" init -q -b main && git -C "$repo" commit -q --allow-empty -m init
echo secret >"$repo/.env"
cat >"$repo/.team/config.yaml" <<'EOF'
branches:
  base: main
  naming: "{type}/{topic}"
commands:
  verify:
    - "npm test"
    - "npm run lint"   # comment
  serial: false
worktree_links: [.env]
codegraph: on
human_only: ["on-device testing"]
matt:
  glossary: GLOSSARY.md
  adr: docs/adr/
models:
  catalog:
    claude-work: {agent: claude, model: sonnet, effort: medium}
    codex-work:  {agent: codex, model: gpt-x, effort: medium}
    claude-fast:
      agent: claude      # block form
      model: haiku
      effort: low
    both: {agent: codex, model: null}
    off: {agent: codex, enabled: false}
  tiers:
    fast: [claude-fast, both]
    work: [claude-work, codex-work, both]
    top: [off]
EOF
mkdir -p "$tmp/claude"; export CLAUDE_CONFIG_DIR="$tmp/claude"
echo '{"sandbox":{"enabled":true,"filesystem":{"allowWrite":["~/.npm"]}}}' >"$tmp/claude/settings.json"
export TEAM_ORCA_BIN="$tmp/bin/orca" FAKE_LOG="$tmp/orca.log" FAKE_REPO="$repo" FAKE_WT="$tmp/wt" AGENT_SKILLS_DIR=/skills
cd "$repo"
F="$repo/.team/csv"

# init
out=$(ORCA_PANE_KEY=pane-1 ORCA_TERMINAL_HANDLE=term_me "$team" init csv --objective "CSV export" 2>"$tmp/err")
check "init exits 0" '[ $? -eq 0 ]'
check "init writes run.json with Run ID" '[ "$(jq -r .run "$F/run.json")" = run_test1 ]'
check "init records worktree path" '[ "$(jq -r .workspace.path "$F/run.json")" = "$tmp/wt/csv" ]'
check "init creates feature dirs" '[ -d "$F/specs" ] && [ -d "$F/reports" ] && [ -d "$F/logs" ] && [ -d "$F/issues" ]'
check "init links .team into worktree" '[ -L "$tmp/wt/csv/.team" ]'
check "init links worktree_links" '[ -L "$tmp/wt/csv/.env" ]'
check "init writes handoff with Run" 'grep -q "Run: run_test1" "$F/handoff.md"'
check "init records the coordinator identity" 'grep -q "Coordinator: pi terminal, terminal term_me, orca_session_id:sess-1" "$F/handoff.md"'
w=$(env -u ORCA_PANE_KEY -u ORCA_TERMINAL_HANDLE "$team" whoami)
check "whoami outside Orca has no identity" '[ "$(jq -r .terminal <<<"$w")" = null ]'
check "init branches from base" 'grep -q -- "--base-branch main" "$FAKE_LOG"'
check "init sets board in-progress" 'grep -q -- "--workspace-status in-progress" "$FAKE_LOG"'
check "init warns when the Claude sandbox cannot write .team" 'grep -q "Claude workers cannot write $repo/.team" "$tmp/err"'
check "init rerun reuses state (one run-create)" '[ "$(grep -c run-create "$FAKE_LOG")" = 1 ]'

check "init marks Run on stderr" 'grep -qx "{\"team\":\"init\",\"run\":\"run_test1\"}" "$tmp/err"'
"$team" init csv --objective "CSV export" 2>"$tmp/err" >/dev/null
check "init rerun repeats the Claude sandbox warning" 'grep -q "Claude workers cannot write" "$tmp/err"'
check "init rerun marks Run again (resume)" 'grep -q "\"team\":\"init\",\"run\":\"run_test1\"" "$tmp/err"'

# spec
s1=$("$team" spec csv builder --catalog claude-work)
check "spec numbers from 01" '[ "$s1" = "$F/specs/01-builder.md" ]'
check "spec fills Run" 'grep -qx "Run: run_test1" "$s1"'
check "spec resolves catalog" 'grep -q "\"agent\":\"claude\",\"model\":\"sonnet\",\"effort\":\"medium\"" "$s1"'
check "spec fills verify" 'grep -q "Evidence: npm test; npm run lint" "$s1"'
check "Spec line says none without spec.md" 'grep -qx "Spec: none (no to-spec for this feature)" "$s1"'
check "spec fills Output" 'grep -q "Output: $F/reports/01-builder.md" "$s1"'
check "spec leaves FILL for judgment" 'grep -q FILL: "$s1"'
check "spec takes tier from models.tiers" 'grep -q "Routing: {\"tier\":\"work\",\"catalog\":\"claude-work\"" "$s1"'
"$team" spec csv builder --kind fix >/dev/null 2>&1
check "fix spec without round refused" '[ $? -ne 0 ]'
"$team" spec csv builder --catalog nope >/dev/null 2>"$tmp/err"
check "unknown catalog refused, aliases listed" '[ $? -ne 0 ] && grep -q "aliases: both, claude-fast" "$tmp/err"'
"$team" spec csv builder --catalog claude-work --tier fast >/dev/null 2>"$tmp/err"
check "tier not containing the alias refused" '[ $? -ne 0 ] && grep -q "not in tier fast" "$tmp/err"'
"$team" spec csv builder --catalog both >/dev/null 2>"$tmp/err"
check "alias in two tiers needs --tier" '[ $? -ne 0 ] && grep -q "pass --tier" "$tmp/err"'
"$team" spec csv builder --catalog off >/dev/null 2>"$tmp/err"
check "disabled alias refused" '[ $? -ne 0 ] && grep -q disabled "$tmp/err"'
check "refused specs leave no file" '[ "$(ls "$F/specs" | wc -l | tr -d " ")" = 1 ]'

# task validation
"$team" task csv "$s1" --title one >/dev/null 2>"$tmp/err"
check "task refuses FILL lines" '[ $? -ne 0 ] && grep -q "unresolved FILL" "$tmp/err"'
sed -i '' 's/FILL:[^\n]*/done/' "$s1"
t1=$("$team" task csv "$s1" --title one 2>"$tmp/err")
check "task marks Run and Task" 'grep -qx "{\"team\":\"task\",\"run\":\"run_test1\",\"task\":\"task_1\"}" "$tmp/err"'
check "task returns task id" '[ "$t1" = task_1 ]'
check "task title has role prefix" 'grep -q -- "--task-title builder: one" "$FAKE_LOG"'
check "task passes --run" 'grep task-create "$FAKE_LOG" | grep -q -- "--run run_test1"'

# dispatch
d=$("$team" dispatch csv "$t1" 2>"$tmp/err")
check "dispatch marks Run, Task and Dispatch" 'grep -qx "{\"team\":\"dispatch\",\"run\":\"run_test1\",\"task\":\"task_1\",\"dispatch\":\"ctx_1\"}" "$tmp/err"'
check "a claude dispatch repeats the sandbox warning" 'grep -q "Claude workers cannot write" "$tmp/err"'
jq --arg d "$repo/.team" '.sandbox.filesystem.allowWrite += [$d]' "$tmp/claude/settings.json" >"$tmp/s" && mv "$tmp/s" "$tmp/claude/settings.json"
check "dispatch returns dispatch" '[ "$(jq -r .dispatch <<<"$d")" = ctx_1 ]'
check "dispatch keeps open on workspace with routing" 'grep worker-start "$FAKE_LOG" | grep -q -- "--keep-open --worktree path:$tmp/wt/csv --agent claude --model sonnet --effort medium"'
check "routing.jsonl appended" '[ "$(jq -r .dispatch "$F/routing.jsonl")" = ctx_1 ]'
check "run.json records dispatch terminal" '[ "$(jq -r ".tasks.task_1.dispatches[0].terminal" "$F/run.json")" = term_1 ]'

# reviewer independence
s2=$("$team" spec csv reviewer --catalog claude-work 2>"$tmp/err")
check "reviewer on builder agent refused at spec" '[ -z "$s2" ] && grep -q "routing.md rule 4" "$tmp/err"'
s3=$("$team" spec csv reviewer --catalog codex-work --name alt); sed -i '' 's/FILL:[^\n]*/done/' "$s3"
d=$("$team" start csv "$s3" --title three)
check "start with other agent dispatches" '[ "$(jq -r .dispatch <<<"$d")" = ctx_2 ]'
check "spec Peers lists builder dispatch" 'grep -q "Peers: task_1 builder dispatch:ctx_1" "$s3"'

# follow-up on kept terminal, failure path
s4=$("$team" spec csv builder --kind fix --round 1 --cause defect --catalog claude-work); sed -i '' 's/FILL:[^\n]*/done/' "$s4"
check "fix spec named -r1" '[ "$s4" = "$F/specs/03-builder-r1.md" ]'
t4=$("$team" task csv "$s4" --title "fix round 1")
FAKE_FAIL_START=1 "$team" dispatch csv "$t4" --terminal term_1 >/dev/null 2>"$tmp/err"
check "failed start exits nonzero" '[ $? -ne 0 ] && grep -q launch_failed "$tmp/err"'
check "failed start leaves routing.jsonl alone" '[ "$(wc -l <"$F/routing.jsonl" | tr -d " ")" = 2 ]'
"$team" dispatch csv "$s4" --terminal term_1 >/dev/null
check "terminal reuse omits agent flags" 'grep worker-start "$FAKE_LOG" | tail -1 | grep -q -- "--terminal term_1" && ! grep worker-start "$FAKE_LOG" | tail -1 | grep -q -- --agent'

# feature inference, start with a role, --reuse
cd "$tmp/wt/csv"
out=$("$team" spec reviewer --catalog claude-fast --goal "Review one" --scope "src/" --selection "cheap" 2>"$tmp/err")
check "Reviewer clash refused before the spec is written" '[ -z "$out" ] && grep -q "routing.md rule 4" "$tmp/err" && [ ! -f "$F/specs/04-reviewer.md" ]'
s5=$("$team" spec support-engineer --catalog claude-fast --goal "Find why X" --scope "src/" --selection "bounded read" --constraint "UI: ui_rules apply." --skill /s/prototype/SKILL.md --ref docs/a.md --ref docs/b.md)
check "--constraint, --skill and --ref are appended" 'grep -q "^Constraints: .*codegraph.* UI: ui_rules apply.$" "$s5" && grep -q "^Skills: .*first; /s/prototype/SKILL.md$" "$s5" && grep -qx "Refs: docs/a.md; docs/b.md" "$s5"'
check "feature inferred from the worktree" '[ "$s5" = "$F/specs/04-support-engineer.md" ]'
check "spec --goal/--scope/--selection fill the lines" '! grep -q FILL: "$s5" && grep -qx "Selection: bounded read" "$s5" && grep -qx "Goal: Find why X" "$s5"'
check "Constraints carry matt, human_only and codegraph from config" 'grep -q "^Constraints: .*Glossary: GLOSSARY.md. ADRs: docs/adr/. Human only (list for the PO, do not perform): on-device testing. Code search: codegraph first" "$s5"'
check "block-form catalog entry with tier fast" 'grep -q "\"tier\":\"fast\",\"catalog\":\"claude-fast\",\"agent\":\"claude\",\"model\":\"haiku\"" "$s5"'
rm "$s5"
"$team" start builder --catalog claude-work --goal "Fix X" >/dev/null 2>"$tmp/err"
check "start refuses open FILL and names the lines" '[ $? -ne 0 ] && grep -q "unresolved FILL in Selection,Scope" "$tmp/err"'
check "refused start removes its spec" '[ ! -f "$F/specs/04-builder.md" ]'
check "refused start creates no Task" '[ "$(grep -c task-create "$FAKE_LOG")" = 3 ]'
d=$("$team" start builder --kind fix --round 2 --cause defect --reuse builder --goal "Fix X" --scope "src/" --selection "same worker" 2>"$tmp/err")
check "start with a role writes spec, Task and Dispatch" '[ -f "$F/specs/04-builder-r2.md" ] && [ "$(jq -r .task <<<"$d")" = task_4 ]'
check "default title from Goal, with the kind for a fix" 'grep task-create "$FAKE_LOG" | tail -1 | grep -q -- "--task-title builder: fix r2: Fix X"'
check "--reuse dispatches to the role terminal" 'grep worker-start "$FAKE_LOG" | tail -1 | grep -q -- "--terminal term_4"'
check "--reuse copies the role Routing" 'grep -q "Routing: {\"tier\":\"work\",\"catalog\":\"claude-work\"" "$F/specs/04-builder-r2.md"'
cd "$repo"
"$team" init other --objective "Other" >/dev/null 2>"$tmp/err.other"
check "no warning once allowWrite covers .team" '[ -s "$tmp/err.other" ] && ! grep -q "Claude workers cannot write" "$tmp/err.other"'
"$team" status --json >/dev/null 2>"$tmp/err"
check "two features from main: asks which" '[ $? -ne 0 ] && grep -q "which feature" "$tmp/err"'
TEAM_FEATURE=csv "$team" status --json >/dev/null
check "TEAM_FEATURE picks the feature" '[ $? -eq 0 ]'
cp .team/config.yaml "$tmp/cfg"; printf 'models:\n  catalog: |\n    x\n' >.team/config.yaml
"$team" status csv >/dev/null 2>"$tmp/err"
check "unsupported YAML reports the file" '[ $? -ne 0 ] && grep -q "cannot read .*config.yaml" "$tmp/err"'
cp "$tmp/cfg" .team/config.yaml

# status
mkdir -p "$F/reports"; printf 'Role: builder\n\n## Result\nimplemented, verify green\n## Evidence\nx\n' >"$F/reports/01-builder.md"
out=$("$team" status csv --json)
check "status joins report verdict" '[ "$(jq -r ".tasks[0].verdict" <<<"$out")" = "implemented, verify green" ]'
check "status shows dispatch" '[ "$(jq -r ".tasks[1].dispatch" <<<"$out")" = ctx_2 ]'
"$team" status csv | grep -q "01-builder.md"
check "status table prints" '[ $? -eq 0 ]'
mv "$F/reports/01-builder.md" "$tmp/r1"
check "status says missing for a finished Task without report" '[ "$("$team" status csv --json | jq -r ".tasks[0].verdict")" = missing ] && [ "$("$team" status csv --json | jq -r ".tasks[1].verdict")" = - ]'
mv "$tmp/r1" "$F/reports/01-builder.md"

FAKE_FAIL_START=1 "$team" start csv support-engineer --catalog claude-fast --goal "Probe" --scope "src/" --selection x >/dev/null 2>"$tmp/err"
check "a refused start says how to settle the ready Task" '[ $? -ne 0 ] && grep -q "is ready with no worker.*team dispatch csv task_.*task-update --id task_" "$tmp/err"'
# fix and rereview rounds (feature other)
O="$repo/.team/other"; printf '# 01 thing\n' >"$O/issues/01-thing.md"
"$team" start other builder --catalog claude-work --ticket "$O/issues/01-thing.md" --selection x >/dev/null 2>&1
"$team" start other reviewer --catalog codex-work --ticket "$O/issues/01-thing.md" --selection y >/dev/null 2>&1
bterm=$(jq -r '[.tasks[] | select(.role=="builder")][0].dispatches[-1].terminal' "$O/run.json")
rterm=$(jq -r '[.tasks[] | select(.role=="reviewer")][0].dispatches[-1].terminal' "$O/run.json")
"$team" fix other >/dev/null 2>"$tmp/err"
check "fix refuses a missing review report" '[ $? -ne 0 ] && grep -q "reviewer report missing: $O/reports/02-reviewer.md" "$tmp/err"'
printf '## Result\npass\n' >"$O/reports/02-reviewer.md"
"$team" fix other >/dev/null 2>"$tmp/err"
check "fix refuses a passing review" '[ $? -ne 0 ] && grep -q "says \"pass\", not changes requested" "$tmp/err"'
"$team" fix other --read-as pass >/dev/null 2>"$tmp/err"
check "--read-as names only the verdict the step needs" '[ $? -ne 0 ] && grep -q "read-as must be \"changes requested\"" "$tmp/err"'
"$team" rereview other >/dev/null 2>"$tmp/err"
check "rereview refuses when the last Builder Task is no fix" '[ $? -ne 0 ] && grep -q "is build, not a fix" "$tmp/err"'
printf '## Result\nChanges requested: S1 Must fix.\n' >"$O/reports/02-reviewer.md"
"$team" fix other >/dev/null 2>&1
s=$O/specs/03-builder-r1.md
check "fix writes round 1 with the ticket and the review as Ref" '[ -f "$s" ] && grep -q "\"kind\":\"fix\",\"round\":1,\"cause\":\"defect\"" "$s" && grep -q "^Ticket: $O/issues/01-thing.md" "$s" && grep -q "^Refs: .*02-reviewer.md" "$s"'
check "fix dispatches to the Builder terminal" 'grep worker-start "$FAKE_LOG" | tail -1 | grep -q -- "--terminal $bterm"'
check "fix records the review as processed" 'grep -q "^- Processed: task_.* | reports/02-reviewer.md | Changes requested: S1 Must fix. | [0-9a-f]* | fix r1$" "$O/handoff.md"'
"$team" fix other >/dev/null 2>"$tmp/err"
check "a second fix for the same review is refused" '[ $? -ne 0 ] && grep -q "builder Task .* already follows reviewer Task" "$tmp/err"'
"$team" rereview other >/dev/null 2>"$tmp/err"
check "rereview refuses a missing fix report" '[ $? -ne 0 ] && grep -q "builder report missing" "$tmp/err"'
printf '## Result\nimplemented\n' >"$O/reports/03-builder-r1.md"
"$team" rereview other >/dev/null 2>&1
s=$O/specs/04-reviewer-r1.md
check "rereview writes round 1 with both reports as Refs" '[ -f "$s" ] && grep -q "\"kind\":\"re-review\",\"round\":1" "$s" && grep -q "^Refs: .*02-reviewer.md.*03-builder-r1.md" "$s"'
check "rereview dispatches to the Reviewer terminal" 'grep worker-start "$FAKE_LOG" | tail -1 | grep -q -- "--terminal $rterm"'
check "rereview records the fix as processed" 'grep -q "| reports/03-builder-r1.md | implemented | .* | re-review r1$" "$O/handoff.md"'
printf '## Result\nNot approved: S2 open\n' >"$O/reports/04-reviewer-r1.md"
"$team" fix other --read-as "changes requested" >/dev/null 2>&1
check "fix --read-as records the reading and the report wording" 'grep -q "| changes requested (read as; report: Not approved: S2 open) | .* | fix r2$" "$O/handoff.md"'
check "fix after a failed re-review is round 2" '[ -f "$O/specs/05-builder-r2.md" ]'
printf '## Result\nimplemented\n' >"$O/reports/05-builder-r2.md"; "$team" rereview other >/dev/null 2>&1
printf '## Result\nchanges requested\n' >"$O/reports/06-reviewer-r2.md"
"$team" fix other >/dev/null 2>"$tmp/err"
check "a third fix round waits for the PO" '[ $? -ne 0 ] && grep -q "two failed fix rounds; ask the PO" "$tmp/err" && [ ! -f "$O/specs/07-builder-r3.md" ]'
"$team" fix other --round 3 >/dev/null 2>&1
check "fix --round 3 after PO approval" '[ -f "$O/specs/07-builder-r3.md" ]'

# read, close
out=$("$team" read csv builder --last 2)
check "read follows the cursor to the tail, skips textless messages" 'grep -q "tail message" <<<"$out" && grep -q "^--- user" <<<"$out" && ! grep -q "tool_use" <<<"$out"'
check "init links do not dirty the worktree" '[ -z "$(git -C "$tmp/wt/csv" status --porcelain)" ]'
touch "$tmp/wt/csv/dirty.txt"
"$team" close csv --remove-worktree >/dev/null 2>"$tmp/err"
check "close refuses a dirty worktree before releasing" '[ $? -ne 0 ] && grep -q "uncommitted" "$tmp/err" && ! grep -q worker-release "$FAKE_LOG"'
rm "$tmp/wt/csv/dirty.txt"
(cd "$tmp/wt/csv" && "$team" close csv --remove-worktree >/dev/null 2>"$tmp/err")
check "close refuses from inside the worktree" '[ $? -ne 0 ] && grep -q "outside" "$tmp/err"'
out=$("$team" close csv --remove-worktree --delete-branch)
check "close releases every recorded Dispatch" '[ "$(grep -c worker-release "$FAKE_LOG")" = "$(jq "[.tasks[].dispatches[].id] | unique | length" "$F/run.json")" ]'
check "close sets board completed and removes the worktree with its branch" 'grep -q -- "--workspace-status completed" "$FAKE_LOG" && grep "worktree rm" "$FAKE_LOG" | grep -q -- "--worktree path:$tmp/wt/csv --delete-branch"'
check "close records itself in run.json" '[ "$(jq -r .closed.worktreeRemoved "$F/run.json")" = true ]'

echo "1..$n"; [ $fails = 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
