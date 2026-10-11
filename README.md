# cache-invariants

**Find the code that silently breaks LLM prompt caching.**

Prompt caching only pays off while the start of each request (system prompt,
tools, earlier messages) stays byte-for-byte the same. Cached input tokens on
Claude bill at a tenth of the normal input price, so one timestamp in a system
prompt, or one earlier message edited in place, can make the same conversation
cost up to ten times as much. Nothing errors. The bill just goes up.

`cache-invariants` catches those changes two ways:

- **`lint`** reads your agent code (TypeScript, JavaScript, Python, shell) and
  flags the patterns that change a cached prefix.
- **`audit`** replays a log of your real calls and proves where a
  conversation's prefix changed between two requests.

```console
$ npx @dcyfr/cache-invariants lint examples
examples/agent.py:10:4  warn   system prompt is appended to; if this runs after the first call, every later call misses the cache  [system-prompt-append]
    system_prompt += f"\nNotes so far: {summarize(history)}"
examples/agent.py:13:9  error  time, random or process-specific value in the system prompt; the prefix is unique per request  [nondeterministic-system-prompt]
    system=system_prompt + f"\nToday is {datetime.date.today()}",
examples/agent.ts:13:5  error  time, random or process-specific value in the system prompt; the prefix is unique per request  [nondeterministic-system-prompt]
    system: `You are a support agent. Current time: ${new Date().toISOString()}`,
examples/agent.ts:18:28  warn   tool list changes mid-conversation; fix the tool set before the first call  [tool-list-mutation]
    if (needsBilling(reply)) tools.push(billingTool);
examples/agent.ts:19:3  error  an earlier message is edited or removed in place; cached history must be append-only  [history-rewrite]
    messages[0].content = redact(messages[0].content);
2 file(s) checked: 3 error(s), 2 warning(s)
```

No dependencies. Node 20 or later.

## Install

```sh
npm install --save-dev @dcyfr/cache-invariants
```

Or run it once with `npx @dcyfr/cache-invariants lint src`.

## The rules

| Rule | Severity | What it catches |
|---|---|---|
| `nondeterministic-system-prompt` | error | A date, time, UUID, random number or PID inside the system prompt |
| `history-rewrite` | error | Editing, splicing, shifting, filtering or slicing earlier messages |
| `system-prompt-append` | warn | Appending to the system prompt (fine while you build it, costly after the first call) |
| `tool-list-mutation` | warn | Pushing, splicing or filtering the tool list (same caveat) |

`cache-invariants rules` prints the list. Errors exit 1. Warnings exit 0
unless you pass `--strict`.

### When a finding is deliberate

Some changes are intended, such as compressing a long conversation into a new
one. Mark the line, or the line above it:

```ts
history = history.slice(-20); // cache-invariants: allow history-rewrite
```

```python
# cache-invariants: allow history-rewrite, tool-list-mutation
```

### What the linter skips

`node_modules`, build output and hidden directories, and test files and
fixtures (they build fake transcripts on purpose). Use `--include-tests` to
scan those too. A file you name directly is always checked.

## Audit real calls

The linter reads code, so it guesses. The audit reads what you actually sent,
so it doesn't. Log one row per model call with `callRow`, passing the exact
request:

```ts
import { appendFileSync } from 'node:fs';
import { callRow } from '@dcyfr/cache-invariants';

const request = { model, system, tools, messages, max_tokens: 1024 };
appendFileSync('calls.ndjson',
  JSON.stringify(callRow({ conversationId, ...request })) + '\n');
const reply = await client.messages.create(request);
```

Rows hold hashes only, never prompt text, so the log is safe to keep. Each row
carries a hash chain over the messages, which is how the audit can say which
message changed.

```console
$ npx @dcyfr/cache-invariants audit examples/calls.ndjson
examples/calls.ndjson:2  history-rewritten  c-81 claude-sonnet-5-5  message 0 changed after it was sent
examples/calls.ndjson:3  system-changed  c-81 claude-sonnet-5-5  system prompt differs from the previous call
3 call(s) in 1 conversation(s): 2 problem(s)
```

Rows are grouped by conversation and model, so falling back to a different
model, which has its own cache, is not reported. Use one `conversationId` per
conversation. Moving a `cache_control` breakpoint and reordering object keys
don't count as changes.

## Use it in CI

```yaml
- run: npx @dcyfr/cache-invariants lint src
```

Add `--json` for machine-readable output from either command.

## How accurate is the linter?

It matches single lines with regular expressions. That makes it fast enough
for a pre-commit hook, and it means it will sometimes flag a variable that
happens to be called `history` or `messages` but never reaches a model. On its
first run across 1,325 files in four of our own repositories it raised three
errors: one real cache-breaking bug (a chat window trimmed from the front on
every turn) and two false alarms. Treat lint findings as leads and the audit
as proof.

## Library API

```js
import { lintSource, lintPaths, callRow, auditRows, parseNdjson, RULES } from '@dcyfr/cache-invariants';
```

## Contributing

Bug reports with a line the linter got wrong (missed or flagged) are the most
useful thing you can send. See the
[DCYFR Labs contributing guide](https://github.com/dcyfr-labs/.github/blob/main/CONTRIBUTING.md).

## License

MIT © DCYFR Labs
