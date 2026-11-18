# AGENTS.md

`@dcyfr/cache-invariants` finds code and call logs that silently break LLM prompt caching. `lint` reads agent source with line-level regex rules, and `audit` replays an NDJSON log of hashed requests to prove where a conversation's cached prefix changed.

## Stack

- Node ESM (`"type": "module"`), `engines.node >= 20`. CI runs Node 20, 22 and 24.
- Zero dependencies and no lockfile. There is nothing to install; run `npm test` directly.
- Version 0.1.1, published to npm as `@dcyfr/cache-invariants`, MIT, author DCYFR Labs.

## Layout

```
bin/cache-invariants.mjs   CLI: lint, audit, rules (exit 0 clean, 1 problems, 2 usage/runtime error)
src/index.mjs              public API: RULES, RULE_IDS, lintSource, lintPaths, callRow, auditRows, parseNdjson
src/rules.mjs              the four lint rules (regexes) and the allow-comment parser
src/lint.mjs               file walker, test-file and hidden-directory skipping, per-line matching
src/audit.mjs              NDJSON parsing and prefix-change detection
src/fingerprint.mjs        callRow(): canonical JSON, sha256 hash chain over messages
test/                      lint.test.mjs, audit.test.mjs, cli.test.mjs (node:test)
examples/                  agent.ts, agent.py (deliberately bad code), calls.ndjson (a bad log)
.github/workflows/         ci.yml, release.yml
```

## Commands

| Command | What it does |
|---|---|
| `npm test` | `node --test` over the three test files. 24 tests, no network, no secrets. |
| `npm run lint:examples` | Lints `examples/`. It is expected to exit 1 because the examples are bad on purpose. |
| `node bin/cache-invariants.mjs lint [paths]` | Scan source (`.js .mjs .cjs .jsx .ts .mts .cts .tsx .py .sh .bash`). Flags: `--json`, `--strict`, `--include-tests`. |
| `node bin/cache-invariants.mjs audit <files...>` | Replay `.ndjson` call logs. `--json` for machine output. |
| `node bin/cache-invariants.mjs rules` | List the rules. |

There is no build step, formatter or linter config. Release is a `v*` tag (see CI).

## Guarantees the library makes, and the tests that pin them

- **Rules are line-level heuristics, not a parser.** Four rules: `nondeterministic-system-prompt` (error), `history-rewrite` (error), `system-prompt-append` (warn), `tool-list-mutation` (warn). Pinned by `test/lint.test.mjs`, including the false-positive guard "a keyed map named history is not a transcript".
- **Allow comments.** `cache-invariants: allow <rule>[, <rule>]` on the same or the previous line silences a finding. Pinned by "an allow comment silences one rule on its own line or the line above". Comment-only lines are skipped.
- **Test files, fixtures and hidden directories are skipped** unless `--include-tests` is passed; a file named directly on the command line is always checked. Pinned in `test/cli.test.mjs`.
- **Exit codes.** Errors exit 1, warnings exit 0 unless `--strict`, usage errors exit 2. Pinned in `test/cli.test.mjs`.
- **The linter is clean on its own source** (`lint exits 0 on the source itself`).
- **Audit rows hold hashes only, never prompt text.** Pinned by "rows hold hashes, not prompt text".
- **Key order and `cache_control` placement are not changes.** `fingerprint.mjs` canonicalizes JSON and drops `cache_control` before hashing. Pinned by "key order and cache_control placement do not count as changes".
- **Rows are grouped by conversation id and model**, so a model fallback starts its own baseline. Pinned by "a different model or conversation starts its own baseline".
- **Audit kinds:** `system-changed`, `tools-changed`, `history-rewritten` (shrunk, or an earlier message's chain hash differs), `bad-row`. Pinned by the other `test/audit.test.mjs` cases.
- `callRow` throws a `TypeError` without a `conversationId`.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on every pull request. Check name: `test` (matrix Node 20, 22, 24). It runs `npm test`, then a step named "Examples still trip every rule" that lints `examples` with `--json` and requires exit code 1 and all 4 distinct rule ids in the findings.

`release.yml` runs on `v*` tags: checks the tag equals `package.json` version, runs `npm test`, then `npm stage publish --access public --provenance` through npm Trusted Publishing (no `NPM_TOKEN`). A maintainer approves the staged release with 2FA.

## Gotchas

- If you add, remove or reword a rule, `examples/` must still trip all four rule ids or the CI example step fails. Update `examples/agent.ts` or `examples/agent.py` and `README.md` (the rules table and the sample output) together.
- The CI example check counts distinct rules (4). Adding a fifth rule means changing that number in `ci.yml`.
- Changing the row shape in `src/fingerprint.mjs` breaks every existing `calls.ndjson`; keep `REQUIRED` in `src/audit.mjs` and `examples/calls.ndjson` in step with it.
- `package.json` `files` limits the published package to `bin`, `src`, `README.md`, `LICENSE`.

## Never

- Add runtime dependencies without a strong reason; "no dependencies" is a stated feature in the README.
- Write prompt text, API keys or request bodies into a call row or a fixture. Rows are hashes by design.
- Commit secrets or an `NPM_TOKEN`; publishing uses OIDC.
- Push a `v*` tag, or push to `main`, without maintainer say-so.
- Edit `examples/` to make a rule pass; the examples are supposed to fail.
