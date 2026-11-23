# Model presets

Read when the interview reaches `models`. Offer one preset as the starting point, then confirm each entry with the PO (`SKILL.md` "Models"). Schema and routing rules: `skills/init-team/references/config-schema.md` "Models" and `skills/orchestrator/references/routing.md` "Model routing".

## Discover ids first

Copy no id from this file without checking it on the PO's machine:

- Claude Code: aliases `haiku`, `sonnet`, `opus` follow the latest release; a full model name pins one. Effort: `claude --help` (`--effort`).
- Codex: `jq -r '.models[] | select(.visibility=="list") | .slug' ~/.codex/models_cache.json`; each entry lists its `supported_reasoning_levels`. The agent default is `model` / `model_reasoning_effort` in `~/.codex/config.toml`.
- Other Orca agents: the version-matched `orca-cli` guide; when it cannot list models, ask the PO for the id.
- Which model goes in which tier is the PO's call; a name does not tell quality or price.

## A. Agent defaults (smallest)

The PO already set model and effort in each agent; the team only picks the agent. Tiers differ only by order, so fast work costs the same as top work: use A to start, then move to B or C.

```yaml
models:
  catalog:
    codex:  {agent: codex,  model: null, effort: null}
    claude: {agent: claude, model: null, effort: null}
  tiers:
    fast: [codex, claude]
    work: [codex, claude]
    top:  [claude, codex]   # Reviewer, Tech Lead on the other provider
```

## B. One agent, tiers by model and effort

One subscription; cost follows the tier. No fallback agent: a rate limit blocks the Task until the PO decides.

```yaml
models:
  catalog:
    claude-fast: {agent: claude, model: haiku,  effort: null}
    claude-work: {agent: claude, model: sonnet, effort: medium}
    claude-top:  {agent: claude, model: opus,   effort: high}
  tiers:
    fast: [claude-fast]
    work: [claude-work]
    top:  [claude-top]
```

## C. Two agents, cross-provider review

Work tier (Builder, Designer, Support Engineer) on one provider, top tier (Reviewer, Tech Lead) on the other; every tier falls back to the other agent on a launch failure (rate limit, auth). Codex ids are examples: replace them with discovered ids the PO places.

```yaml
models:
  catalog:
    codex-fast:  {agent: codex,  model: gpt-6.2-sol,   effort: low}
    codex-work:  {agent: codex,  model: gpt-6.2-sol,   effort: medium}
    codex-top:   {agent: codex,  model: gpt-6.2-astra, effort: high}
    claude-fast: {agent: claude, model: haiku,  effort: null}
    claude-work: {agent: claude, model: sonnet, effort: medium}
    claude-top:  {agent: claude, model: opus,   effort: high}
  tiers:
    fast: [codex-fast, claude-fast]
    work: [codex-work, claude-work]
    top:  [claude-top, codex-top]
```

## Choosing

- Tier order already routes roles: role defaults come from each role card's "Runs on". Add `roles` only for a real exception, e.g. `designer: {prefer: [claude-work]}` when the PO prefers one agent's UI work; never restate a default.
- Give every tier at least two agents when the PO has them; a single-entry tier blocks on one rate limit.
- One alias per agent/model/effort combination; the same model at two efforts is two aliases.
- Top tier is the expensive one (Reviewer runs every Run); keep its effort at `high`, not the maximum, unless the PO asks.
- Keep the Reviewer's tier at least the Builder's (`skills/orchestrator/references/routing.md` "Model routing"); a different provider for the Reviewer is optional, not required.
- Disable an entry with `enabled: false` instead of deleting it, so the PO's choice stays visible.
