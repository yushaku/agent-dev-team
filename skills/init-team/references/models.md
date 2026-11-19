# Model presets

Read when the interview reaches `models`. Offer one preset as the starting point, then confirm each entry with the PO (`SKILL.md` "Models"). Schema and routing rules: `config.md` "Model settings" and "Model routing".

## Discover ids first

Copy no id from this file without checking it on the PO's machine:

- Claude Code: aliases `haiku`, `sonnet`, `opus` follow the latest release; a full model name pins one. Effort: `claude --help` (`--effort`).
- Codex: `jq -r '.models[] | select(.visibility=="list") | .slug' ~/.codex/models_cache.json`; each entry lists its `supported_reasoning_levels`. The agent default is `model` / `model_reasoning_effort` in `~/.codex/config.toml`.
- Other Orca agents: the version-matched `orca-cli` guide; when it cannot list models, ask the PO for the id.

## A. Agent defaults (smallest)

The PO already set model and effort in each agent; the team only picks the agent. Good first config; tiers differ only by fallback order.

```yaml
models:
  catalog:
    codex:  {agent: codex,  model: null, effort: null}
    claude: {agent: claude, model: null, effort: null}
  tiers:
    fast: [codex]
    work: [codex, claude]
    top:  [claude, codex]
  roles:
    reviewer: {tier: top, prefer: [claude]}   # review by a different provider than the Builder
```

## B. One agent, tiers by model and effort

One subscription; cost follows the tier.

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

Builders on one provider, Reviewer and top-tier work on the other; each tier falls back to the other agent on a launch failure (rate limit, auth).

```yaml
models:
  catalog:
    codex-fast:  {agent: codex,  model: gpt-6.2-sol,   effort: low}
    codex-work:  {agent: codex,  model: gpt-6.2-sol,   effort: medium}
    codex-top:   {agent: codex,  model: gpt-6.2-astra, effort: high}
    claude-work: {agent: claude, model: sonnet, effort: medium}
    claude-top:  {agent: claude, model: opus,   effort: high}
  tiers:
    fast: [codex-fast]
    work: [codex-work, claude-work]
    top:  [claude-top, codex-top]
  roles:
    builder:  {prefer: [codex-work]}
    reviewer: {tier: top, prefer: [claude-top]}
    security: {tier: top, prefer: [claude-top]}
    delivery: {tier: fast}
```

## Choosing

- Start with A when the PO has no cost or quality preference; move to B or C after a few Runs show where tokens go (dashboard).
- One alias per agent/model/effort combination; the same model at two efforts is two aliases.
- Keep the Reviewer's tier at least the Builder's (`config.md` "Model routing"); a different provider for the Reviewer is optional, not required.
- `roles` lists only overrides; role defaults come from each role card's "Runs on".
- Disable an entry with `enabled: false` instead of deleting it, so the PO's choice stays visible.
