---
name: anti-ai
description: "Use before a PR or outgoing message. Strips AI tells from the diff, docs, commits and drafts."
license: MIT
---

# Anti-AI pass

- Review the finished branch diff against base, PR description, commit messages and draft replies. Do not touch code outside the diff.
- Run this as a separate pass, preferably in a fresh context.
- For docs work in progress, give writing agents the prose rules before work, then run a separate fresh-context pass on the finished diff.

## Guardrails

- Do not change behaviour. Run tests after the pass; if any fail, revert that edit.
- Follow the surrounding code style.
- Never invent facts, names, history or reasons.
- Check factual claims in changed prose against the code; narrow false absolutes to what the code supports.
- Keep validation at trust boundaries, data-loss protections, security checks, accessibility and requested behaviour.

## Code

- Avoid uniform perfection the file does not have (exhaustive JSDoc on private one-liners or a docstring on every function when neighbours have none).
- Remove comments that narrate code, restate a function name or explain a change to a reviewer. Keep only non-obvious why-comments; match the file's comment density and language.
- Remove section banners and decorative comments unless the file already uses them.
- Remove defensive null checks, catches, fallbacks or retries when callers already validate the values.
- Do not add type escapes such as `as any`, `@ts-ignore`, `# type: ignore` or unchecked casts to silence the compiler.
- Avoid one-use helpers, wrapper functions, config objects, enums or interfaces; flatten unnecessary nesting.
- Use domain names already present in the codebase.
- Remove chatty logs, emoji, exclamation marks, "Successfully ..." messages, agent TODOs, commented-out code, placeholders and unused imports.

## Prose

- Load the `humanizer` skill for prose changes.
- Lead with the point, no staged openers.
- Avoid inflated words: robust, seamless, comprehensive, leverage, powerful, crucial, delve.
- No not-X-but-Y contrasts, forced groups of three, or one-line closers.
- No em or en dashes. In HTML, check added lines for `&mdash;` and `&ndash;` with `git diff -U0 | grep '^+' | grep -E '&mdash;|&ndash;'`; check raw dashes separately.
- Use bold, headers and bullets only where the existing docs use them.
- Prefer the concrete: file, function, number, ticket key.
- Generated artifacts: edit the source and re-render, never hand-edit the output.
- Non-English text keeps the client's register (keigo, greeting and closing formulas), no literal idioms.
- Cut Vietnamese inflated words: mạnh mẽ, toàn diện, liền mạch, tối ưu vượt trội, giải pháp hoàn hảo.

## Commits and PR metadata

- Follow `git log` for language, tense, prefix convention and length.
- Do not add `Co-Authored-By`, `Generated with ...`, session links or tool names unless the project requires them.
- Use one logical change per commit message; do not recap every file in bullets.

## Output

- Return the cleaned diff and drafts, plus 1 to 3 sentences on what changed and what remains intentionally.
